"""Staff accounts: sign-in, sessions, invites, password resets and user management.

Each person has their own account. Admins see and manage every classroom and
every account; teachers see only the classrooms an admin has assigned to them.

Sessions are random tokens in a cookie; only their SHA-256 hash is stored. Invite
and reset links work the same way. Passwords are hashed with argon2id.
"""
import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import datetime
from functools import wraps
from zoneinfo import ZoneInfo

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from flask import Blueprint, abort, current_app, g, redirect, render_template, request

import emails

MINUTE, HOUR, DAY = 60, 3600, 86400
SESSION_IDLE = 8 * HOUR
SESSION_SHORT = 12 * HOUR
SESSION_LONG = 30 * DAY
INVITE_TTL = 72 * HOUR
RESET_TTL = HOUR
LIMIT_WINDOW = 15 * MINUTE
# Failed sign-ins allowed per email and per IP address within LIMIT_WINDOW.
EMAIL_FAILS, IP_FAILS = 5, 20
# Reset emails allowed per email and per IP address within LIMIT_WINDOW.
EMAIL_RESETS, IP_RESETS = 3, 10
PASSWORD_MIN = 12
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
ROLES = ("admin", "teacher")
COMMON_PASSWORDS = {
    "123456789012", "1234567890123", "qwertyuiopas", "passwordpassword", "password1234", "password12345",
    "password123!", "iloveyou1234", "adminadminadmin", "welcome12345", "letmein12345", "safaracademy",
    "safaracademy1", "safaracademy123", "safardashboard", "replace-with-a-long-unique-password",
    "aaaaaaaaaaaa", "abcdefghijkl", "abc123abc123", "qwerty123456", "000000000000", "111111111111",
}

hasher = PasswordHasher()
# Verified against when an email is unknown, so that both cases take as long.
DUMMY_HASH = hasher.hash(secrets.token_hex(16))

bp = Blueprint("auth", __name__)
LONDON = ZoneInfo("Europe/London")
ACTIONS = {
    "login": "Signed in", "login.failed": "Wrong password", "login.blocked": "Sign-in blocked (too many attempts)",
    "logout": "Signed out", "logout.others": "Signed out other devices", "password.changed": "Changed password",
    "password.reset_requested": "Asked for a reset link", "password.reset": "Reset password",
    "invite.accepted": "Accepted invite", "user.invited": "Invited a user", "user.updated": "Changed a user",
    "user.reset_link": "Made a reset link", "user.invite_link": "Made a new invite", "user.disabled": "Turned off a user",
    "user.enabled": "Turned on a user", "class.saved": "Saved classroom", "class.deleted": "Deleted classroom",
    "class.restored": "Restored classroom", "tv.created": "Made a TV screen link",
    "tv.revoked": "Turned off a TV screen link", "email.test": "Sent a test email",
}


@bp.app_template_filter("when")
def when(timestamp):
    return datetime.fromtimestamp(timestamp, LONDON).strftime("%-d %b %Y, %H:%M")


@bp.app_template_filter("action")
def action_label(action):
    return ACTIONS.get(action, action)


@bp.app_template_filter("fromjson")
def fromjson(value):
    return json.loads(value)


def now():
    return int(time.time())


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def norm_email(value):
    return (value or "").strip().lower()


def password_problem(password, email=""):
    if len(password) < PASSWORD_MIN:
        return f"Use at least {PASSWORD_MIN} characters."
    if len(password) > 256:
        return "Use at most 256 characters."
    if password.lower() in COMMON_PASSWORDS or password.lower() == email or len(set(password)) < 4:
        return "That password is too easy to guess. Try a few unrelated words together."
    return None


def safe_next(target):
    """Only same-site paths, so a sign-in link can't send someone to another website."""
    if not target or not target.startswith("/") or target.startswith("//") or "\\" in target:
        return "/"
    return target


def db():
    return current_app.config["DB"]


def audit(tx, action, class_id=None, detail=None, user_id=None):
    if user_id is None and g.get("user"):
        user_id = g.user["id"]
    tx.execute("INSERT INTO audit_log (at, user_id, action, class_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)",
               (now(), user_id, action, class_id, json.dumps(detail) if detail is not None else None,
                request.remote_addr))


def cookie_name():
    return "__Host-safar" if current_app.config["COOKIE_SECURE"] else "safar"


def pre_cookie_name():
    return "__Host-safar-form" if current_app.config["COOKIE_SECURE"] else "safar-form"


def set_cookie(response, name, value, max_age=None):
    response.set_cookie(name, value, max_age=max_age, path="/", secure=current_app.config["COOKIE_SECURE"],
                        httponly=True, samesite="Lax")


LINK_TOKEN = re.compile(r"(/(?:invite|reset)/)[^/?#\s\"]+")


def hide_link_tokens(text):
    """Takes the one-time token out of invite and reset links, so they can be written to a log."""
    return LINK_TOKEN.sub(r"\1[hidden]", text)


def public_url(path):
    base = current_app.config["PUBLIC_URL"] or request.host_url
    return base.rstrip("/") + path


# --- Sessions -----------------------------------------------------------------

def load_session():
    """Sets g.user and g.session from the session cookie, if it is valid."""
    g.user = g.session = None
    token = request.cookies.get(cookie_name())
    if not token:
        return
    t = now()
    with db().transaction() as tx:
        row = tx.execute(
            "SELECT s.token_hash, s.csrf, s.last_seen_at, s.expires_at, u.id, u.email, u.name, u.role, u.must_change, "
            "u.disabled FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (token_hash(token),)).fetchone()
        if not row:
            return
        if row["disabled"] or row["expires_at"] <= t or row["last_seen_at"] + SESSION_IDLE <= t:
            tx.execute("DELETE FROM sessions WHERE token_hash = ?", (row["token_hash"],))
            return
        # The dashboard polls every 10 seconds; record activity at most once a minute.
        if t - row["last_seen_at"] >= MINUTE:
            tx.execute("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", (t, row["token_hash"]))
    g.session = {"token_hash": row["token_hash"], "csrf": row["csrf"]}
    g.user = {k: row[k] for k in ("id", "email", "name", "role", "must_change")}


def start_session(tx, user_id, remember):
    token = secrets.token_urlsafe(32)
    t = now()
    tx.execute("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
               (token_hash(token), user_id, secrets.token_urlsafe(32), t, t,
                t + (SESSION_LONG if remember else SESSION_SHORT), request.remote_addr,
                (request.user_agent.string or "")[:200]))
    tx.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (t, user_id))
    return token, (SESSION_LONG if remember else None)


def signed_in_redirect(token, max_age, target):
    response = redirect(safe_next(target))
    set_cookie(response, cookie_name(), token, max_age)
    response.delete_cookie(pre_cookie_name(), path="/", secure=current_app.config["COOKIE_SECURE"])
    return response


# --- CSRF ---------------------------------------------------------------------

def form_token():
    """CSRF token for the current page's forms."""
    if g.get("session"):
        return g.session["csrf"]
    token = request.cookies.get(pre_cookie_name())
    if not token or len(token) > 100:
        token = secrets.token_urlsafe(32)
    g.new_pre_token = token
    return token


def check_form_token():
    sent = request.form.get("csrf", "")
    expected = g.session["csrf"] if g.get("session") else request.cookies.get(pre_cookie_name(), "")
    if not expected or not hmac.compare_digest(sent.encode(), expected.encode()):
        abort(400, "This form has expired. Go back, reload the page and try again.")


@bp.after_app_request
def keep_pre_token(response):
    if g.get("new_pre_token") and request.cookies.get(pre_cookie_name()) != g.new_pre_token:
        set_cookie(response, pre_cookie_name(), g.new_pre_token, max_age=DAY)
    return response


def page(template, status=200, **context):
    return render_template(template, user=g.get("user"), csrf=form_token(),
                           mail_enabled=current_app.config["MAILER"].enabled,
                           support_email=current_app.config.get("SUPPORT_EMAIL", ""), **context), status


# --- Access control -----------------------------------------------------------

def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not g.user or g.user["role"] != "admin":
            abort(403)
        return view(*args, **kwargs)
    return wrapper


# --- Rate limiting --------------------------------------------------------------

def limited(tx, kind, email, email_limit, ip_limit, failures_only=True):
    since = now() - LIMIT_WINDOW
    ok = " AND ok = 0" if failures_only else ""
    by_email = tx.execute(f"SELECT COUNT(*) AS n FROM attempts WHERE kind = ? AND email = ? AND at > ?{ok}",
                          (kind, email, since)).fetchone()["n"]
    by_ip = tx.execute(f"SELECT COUNT(*) AS n FROM attempts WHERE kind = ? AND ip = ? AND at > ?{ok}",
                       (kind, request.remote_addr or "", since)).fetchone()["n"]
    return by_email >= email_limit or by_ip >= ip_limit


def record_attempt(tx, kind, email, ok):
    tx.execute("INSERT INTO attempts (kind, email, ip, at, ok) VALUES (?, ?, ?, ?, ?)",
               (kind, email, request.remote_addr or "", now(), 1 if ok else 0))


# --- Tokens for invite and reset links -------------------------------------------

def issue_link(tx, user_id, purpose):
    """Creates a one-time link and cancels earlier unused ones for the same purpose."""
    t = now()
    tx.execute("UPDATE user_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL",
               (t, user_id, purpose))
    token = secrets.token_urlsafe(32)
    tx.execute("INSERT INTO user_tokens VALUES (?, ?, ?, ?, ?, NULL)",
               (token_hash(token), user_id, purpose, t, t + (INVITE_TTL if purpose == "invite" else RESET_TTL)))
    return public_url(f"/{purpose}/{token}")


def send_link(user, purpose, link, by=None, rooms=(), background=False):
    """Emails an invite or reset link. `by` is the admin who sent it, if one did."""
    if purpose == "invite":
        return emails.send("invite", user["email"], background=background, name=user["name"], email=user["email"],
                           role=user.get("role", "teacher"), rooms=list(rooms), by=by, link=link)
    return emails.send("reset", user["email"], background=background, name=user["name"], email=user["email"],
                       by=by, link=link)


def password_changed_notice(user, how):
    """Tells someone their password changed, so they find out if it wasn't them. Sent in the background."""
    emails.send("password_changed", user["email"], background=True, name=user["name"], email=user["email"],
                how=how, at=now())


def find_link(tx, token, purpose):
    row = tx.execute("SELECT t.token_hash, t.expires_at, t.used_at, u.id, u.email, u.name, u.disabled "
                     "FROM user_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.purpose = ?",
                     (token_hash(token), purpose)).fetchone()
    if not row or row["used_at"] or row["expires_at"] <= now() or row["disabled"]:
        return None
    return row


# --- Sign in and out ----------------------------------------------------------

@bp.route("/login", methods=["GET", "POST"])
def login():
    target = safe_next(request.values.get("next"))
    if g.user and request.method == "GET":
        return redirect(target)
    if request.method == "GET":
        notice = "You've signed out." if request.args.get("out") else None
        return page("login.html", next=target, notice=notice)
    check_form_token()
    email = norm_email(request.form.get("email"))[:254]
    password = request.form.get("password", "")[:256]
    remember = request.form.get("remember") == "1"
    with db().transaction() as tx:
        if limited(tx, "login", email, EMAIL_FAILS, IP_FAILS):
            audit(tx, "login.blocked", detail={"email": email})
            error = "Too many attempts. Wait 15 minutes, then try again."
            return page("login.html", 429, next=target, email=email, error=error)
        user = tx.execute("SELECT id, password_hash, disabled FROM users WHERE email = ?", (email,)).fetchone()
        try:
            ok = hasher.verify(user["password_hash"] if user and user["password_hash"] else DUMMY_HASH, password)
        except (VerificationError, InvalidHashError):
            ok = False
        ok = ok and bool(user) and bool(user["password_hash"]) and not user["disabled"]
        record_attempt(tx, "login", email, ok)
        if not ok:
            audit(tx, "login.failed", detail={"email": email}, user_id=user["id"] if user else None)
    if not ok:
        return page("login.html", 401, next=target, email=email, error="That email and password don't match.")
    with db().transaction() as tx:
        if hasher.check_needs_rehash(user["password_hash"]):
            tx.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hasher.hash(password), user["id"]))
        token, max_age = start_session(tx, user["id"], remember)
        audit(tx, "login", user_id=user["id"])
    return signed_in_redirect(token, max_age, target)


@bp.post("/logout")
def logout():
    if g.session:
        check_form_token()
        with db().transaction() as tx:
            tx.execute("DELETE FROM sessions WHERE token_hash = ?", (g.session["token_hash"],))
            audit(tx, "logout")
    response = redirect("/login?out=1")
    response.delete_cookie(cookie_name(), path="/", secure=current_app.config["COOKIE_SECURE"])
    return response


@bp.route("/forgot", methods=["GET", "POST"])
def forgot():
    if request.method == "GET":
        return page("forgot.html")
    check_form_token()
    email = norm_email(request.form.get("email"))[:254]
    with db().transaction() as tx:
        blocked = limited(tx, "reset", email, EMAIL_RESETS, IP_RESETS, failures_only=False)
        record_attempt(tx, "reset", email, False)
        user = tx.execute("SELECT id, email, name, role, password_hash, disabled FROM users WHERE email = ?",
                          (email,)).fetchone()
        link = None
        if not blocked and user and not user["disabled"] and current_app.config["MAILER"].enabled:
            # Someone who never accepted their invite gets a fresh invite instead.
            purpose = "reset" if user["password_hash"] else "invite"
            link = issue_link(tx, user["id"], purpose)
            audit(tx, "password.reset_requested", user_id=user["id"])
    if link:
        # Sent from another thread, so the page takes as long whether or not the email has an account.
        send_link(dict(user), purpose, link, background=True)
    # The same answer whether or not the email has an account.
    return page("forgot.html", sent=True)


def set_password_page(token, purpose):
    with db().transaction() as tx:
        row = find_link(tx, token, purpose)
    if not row:
        return page("link_expired.html", 410, purpose=purpose)
    if request.method == "GET":
        return page("set_password.html", purpose=purpose, name=row["name"], email=row["email"])
    check_form_token()
    password = request.form.get("password", "")
    error = password_problem(password, row["email"])
    if not error and password != request.form.get("confirm", ""):
        error = "The two passwords don't match."
    if error:
        return page("set_password.html", 400, purpose=purpose, name=row["name"], email=row["email"], error=error)
    with db().transaction() as tx:
        # Mark the link used first, so two submissions can't both succeed.
        used = tx.execute("UPDATE user_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL",
                          (now(), row["token_hash"]))
        if not used.rowcount:
            return page("link_expired.html", 410, purpose=purpose)
        tx.execute("UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?", (hasher.hash(password), row["id"]))
        tx.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        audit(tx, "invite.accepted" if purpose == "invite" else "password.reset", user_id=row["id"])
        session_token, max_age = start_session(tx, row["id"], False)
    if purpose == "reset":
        password_changed_notice(row, "reset")
    return signed_in_redirect(session_token, max_age, "/")


@bp.route("/invite/<token>", methods=["GET", "POST"])
def invite(token):
    return set_password_page(token, "invite")


@bp.route("/reset/<token>", methods=["GET", "POST"])
def reset(token):
    return set_password_page(token, "reset")


# --- Your account ---------------------------------------------------------------

def other_sessions(tx):
    return tx.execute("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND token_hash <> ? AND expires_at > ?",
                      (g.user["id"], g.session["token_hash"], now())).fetchone()["n"]


@bp.get("/account")
def account():
    with db().transaction() as tx:
        others = other_sessions(tx)
    return page("account.html", others=others)


@bp.post("/account/password")
def change_password():
    check_form_token()
    current, password = request.form.get("current", ""), request.form.get("password", "")
    with db().transaction() as tx:
        stored = tx.execute("SELECT password_hash FROM users WHERE id = ?", (g.user["id"],)).fetchone()["password_hash"]
        others = other_sessions(tx)
    try:
        ok = hasher.verify(stored, current)
    except (VerificationError, InvalidHashError):
        ok = False
    error = None if ok else "Your current password isn't right."
    error = error or password_problem(password, g.user["email"])
    if not error and password != request.form.get("confirm", ""):
        error = "The two new passwords don't match."
    if not error and password == current:
        error = "Choose a password different from your current one."
    if error:
        return page("account.html", 400, others=others, error=error)
    with db().transaction() as tx:
        tx.execute("UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?", (hasher.hash(password), g.user["id"]))
        # Any other device signed in with the old password is signed out.
        tx.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", (g.user["id"], g.session["token_hash"]))
        audit(tx, "password.changed")
    password_changed_notice(g.user, "changed")
    g.user["must_change"] = 0
    return page("account.html", others=0, notice="Password changed. You've been signed out on your other devices.")


@bp.post("/account/signout-others")
def sign_out_others():
    check_form_token()
    with db().transaction() as tx:
        tx.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", (g.user["id"], g.session["token_hash"]))
        audit(tx, "logout.others")
    return page("account.html", others=0, notice="You've been signed out on all your other devices.")


# --- Manage users (admins) ---------------------------------------------------------

def classrooms(tx):
    rows = tx.execute("SELECT id, json FROM classrooms").fetchall()
    names = {}
    for row in rows:
        try:
            names[row["id"]] = json.loads(row["json"]).get("name") or row["id"]
        except ValueError:
            names[row["id"]] = row["id"]
    return sorted(names.items(), key=lambda item: item[1].lower())


def users_page(status=200, **context):
    with db().transaction() as tx:
        users = [dict(row) for row in tx.execute(
            "SELECT id, email, name, role, disabled, password_hash IS NOT NULL AS active, last_login_at FROM users "
            "ORDER BY disabled, role, name").fetchall()]
        members = {}
        for row in tx.execute("SELECT class_id, user_id FROM classroom_members").fetchall():
            members.setdefault(row["user_id"], set()).add(row["class_id"])
        rooms = classrooms(tx)
    for user in users:
        user["classes"] = members.get(user["id"], set())
    mailer = current_app.config["MAILER"]
    return page("admin_users.html", status, users=users, rooms=rooms, mail_from=getattr(mailer, "sender_address", ""),
                mail_test_mode=bool(getattr(mailer, "redirect_to", "")), email_previews=EMAIL_PREVIEWS, **context)


EMAIL_PREVIEWS = (("invite", "Invite"), ("reset", "Password reset"), ("password_changed", "Password changed"),
                  ("test", "Test email"))


def chosen_classes(tx):
    known = {c for c, _ in classrooms(tx)}
    return sorted(set(request.form.getlist("classes")) & known)


def set_classes(tx, user_id, role, classes):
    tx.execute("DELETE FROM classroom_members WHERE user_id = ?", (user_id,))
    # Admins see every classroom, so they are not assigned any.
    if role == "teacher":
        for class_id in classes:
            tx.execute("INSERT INTO classroom_members VALUES (?, ?)", (class_id, user_id))


def room_names(tx, user_id):
    """The names of the classrooms a teacher is assigned to, for their invite email."""
    mine = {row["class_id"] for row in tx.execute("SELECT class_id FROM classroom_members WHERE user_id = ?",
                                                  (user_id,)).fetchall()}
    return [name for class_id, name in classrooms(tx) if class_id in mine]


def user_by_id(tx, user_id):
    row = tx.execute("SELECT id, email, name, role, disabled, password_hash IS NOT NULL AS active FROM users WHERE id = ?",
                     (user_id,)).fetchone()
    if not row:
        abort(404)
    return dict(row)


def active_admins(tx):
    return tx.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").fetchone()["n"]


@bp.get("/admin/users")
@admin_required
def admin_users():
    return users_page()


@bp.post("/admin/users/invite")
@admin_required
def admin_invite():
    check_form_token()
    name = " ".join(request.form.get("name", "").split())[:80]
    email = norm_email(request.form.get("email"))[:254]
    role = request.form.get("role")
    if not name or not EMAIL.fullmatch(email) or role not in ROLES:
        return users_page(400, error="Enter a name, a valid email address and a role.")
    with db().transaction() as tx:
        if tx.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            return users_page(400, error=f"{email} already has an account.")
        user_id = tx.insert("INSERT INTO users (email, name, role, created_at) VALUES (?, ?, ?, ?)",
                            (email, name, role, now()))
        set_classes(tx, user_id, role, chosen_classes(tx))
        rooms = room_names(tx, user_id) if role == "teacher" else []
        link = issue_link(tx, user_id, "invite")
        audit(tx, "user.invited", detail={"email": email, "role": role, "user": user_id})
    sent = send_link({"name": name, "email": email, "role": role}, "invite", link, by=g.user["name"], rooms=rooms)
    return users_page(notice=f"Invite {'emailed to' if sent else 'created for'} {email}.",
                      link=None if sent else link, link_for=name)


@bp.post("/admin/users/<int:user_id>/update")
@admin_required
def admin_update(user_id):
    check_form_token()
    name = " ".join(request.form.get("name", "").split())[:80]
    role = request.form.get("role")
    if not name or role not in ROLES:
        return users_page(400, error="Enter a name and a role.")
    with db().transaction() as tx:
        user = user_by_id(tx, user_id)
        if user["role"] == "admin" and role != "admin" and active_admins(tx) <= 1 and not user["disabled"]:
            return users_page(400, error="Keep at least one admin. Make someone else an admin first.")
        classes = chosen_classes(tx)
        tx.execute("UPDATE users SET name = ?, role = ? WHERE id = ?", (name, role, user_id))
        set_classes(tx, user_id, role, classes)
        audit(tx, "user.updated", detail={"user": user_id, "role": role, "classes": classes})
    return users_page(notice=f"Saved {name}.")


@bp.post("/admin/users/<int:user_id>/link")
@admin_required
def admin_link(user_id):
    """A new reset link, or a new invite for someone who never set a password."""
    check_form_token()
    with db().transaction() as tx:
        user = user_by_id(tx, user_id)
        if user["disabled"]:
            return users_page(400, error="Turn this account back on first.")
        purpose = "reset" if user["active"] else "invite"
        rooms = room_names(tx, user_id) if user["role"] == "teacher" else []
        link = issue_link(tx, user_id, purpose)
        audit(tx, f"user.{purpose}_link", detail={"user": user_id})
    sent = send_link(user, purpose, link, by=g.user["name"], rooms=rooms)
    what = "Password reset link" if purpose == "reset" else "New invite"
    return users_page(notice=f"{what} {'emailed to' if sent else 'created for'} {user['email']}.",
                      link=None if sent else link, link_for=user["name"])


@bp.post("/admin/users/<int:user_id>/access")
@admin_required
def admin_access(user_id):
    check_form_token()
    disable = request.form.get("disable") == "1"
    with db().transaction() as tx:
        user = user_by_id(tx, user_id)
        if disable and user_id == g.user["id"]:
            return users_page(400, error="You can't turn off your own account.")
        if disable and user["role"] == "admin" and active_admins(tx) <= 1:
            return users_page(400, error="Keep at least one admin.")
        tx.execute("UPDATE users SET disabled = ? WHERE id = ?", (1 if disable else 0, user_id))
        if disable:
            tx.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            tx.execute("UPDATE user_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL", (now(), user_id))
        audit(tx, "user.disabled" if disable else "user.enabled", detail={"user": user_id})
    return users_page(notice=f"{user['name']} can {'no longer' if disable else 'now'} sign in.")


@bp.post("/admin/email/test")
@admin_required
def admin_email_test():
    """Sends the signed-in admin a test email, to check that email is set up."""
    check_form_token()
    if not current_app.config["MAILER"].enabled:
        return users_page(400, error="Email isn't set up yet. Add RESEND_API_KEY and MAIL_FROM on Railway.")
    sent = emails.send("test", g.user["email"], name=g.user["name"], email=g.user["email"], at=now())
    with db().transaction() as tx:
        audit(tx, "email.test", detail={"sent": sent})
    if not sent:
        return users_page(502, error="The test email couldn't be sent. The MySafar service's logs on Railway say why.")
    return users_page(notice=f"Test email sent to {g.user['email']}. It should arrive within a minute.")


@bp.get("/admin/email/preview/<template>")
@admin_required
def admin_email_preview(template):
    """Shows an email with made-up details, as staff would see it. ?text=1 shows the plain-text part."""
    if template not in emails.PREVIEWS:
        abort(404)
    subject, text, html = emails.render(template, **emails.PREVIEWS[template]())
    if request.args.get("text"):
        return current_app.response_class(f"Subject: {subject}\n\n{text}", mimetype="text/plain")
    return html


@bp.get("/admin/activity")
@admin_required
def admin_activity():
    with db().transaction() as tx:
        rows = tx.execute("SELECT a.at, a.action, a.class_id, a.detail, a.ip, u.name, u.email FROM audit_log a "
                          "LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300").fetchall()
    return page("admin_activity.html", rows=rows)


# --- Startup ------------------------------------------------------------------

def bootstrap_admin(database, email, password):
    """Creates the first admin from ADMIN_EMAIL and DASHBOARD_PASSWORD when there are no accounts yet."""
    with database.transaction() as tx:
        if tx.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]:
            return
        email = norm_email(email)
        if not EMAIL.fullmatch(email) or not password or password == "replace-with-a-long-unique-password":
            raise RuntimeError("There are no accounts yet. Set ADMIN_EMAIL and DASHBOARD_PASSWORD to create the "
                               "first admin; they will choose a new password when they first sign in.")
        tx.insert("INSERT INTO users (email, name, role, password_hash, must_change, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                  (email, "Administrator", "admin", hasher.hash(password), now()))
        print(f"Created the first admin account for {email}.", flush=True)


def prune(database, retention_days):
    """Removes records past their retention period, and expired sessions and links."""
    t = now()
    cutoff = t - retention_days * DAY
    with database.transaction() as tx:
        tx.execute("DELETE FROM audit_log WHERE at < ?", (cutoff,))
        tx.execute("DELETE FROM classroom_history WHERE saved_at < ?", (cutoff,))
        tx.execute("DELETE FROM attempts WHERE at < ?", (t - DAY,))
        tx.execute("DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?", (t, t - SESSION_IDLE))
        tx.execute("DELETE FROM user_tokens WHERE expires_at < ?", (t - DAY,))
