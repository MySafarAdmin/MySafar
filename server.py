"""Safar dashboard server: staff sign-in and shared class records.

Records are kept in PostgreSQL when DATABASE_URL is set (on Railway, a reference
to the PostgreSQL service's DATABASE_URL). Without it they are kept in a SQLite
file in DATA_DIR, which is meant for running locally. See db.py.

Each classroom is one row of the `classrooms` table. Classrooms are created from
the dashboard (CSV upload) by an admin. Teachers see and edit only the
classrooms an admin has assigned to them. Every save and delete is recorded in
`classroom_history` and `audit_log`, which are kept for RETENTION_DAYS.
"""
import base64
import json
import logging
import os
import re
import time
from datetime import date
from pathlib import Path
from urllib.parse import quote

from flask import Flask, Response, abort, g, jsonify, redirect, request
from werkzeug.middleware.proxy_fix import ProxyFix

import auth
import cleanup
import export
import tv
from db import DB_ERRORS, Database
from mailer import Mailer

ROOT = Path(__file__).resolve().parent
CLASS_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
MAX_CLASSES = 500
HOUSES = ("Makkah", "Al-Aqsa", "Madinah")
QAIDAH_LEVELS = 10  # keep in step with QAIDAH in src/page.html
# House tokens: each student's list of award times per token. Keep in step with TOK in src/page.html.
TOKEN_POINTS = {"tg": 5, "tb": 20, "tr": 50}  # green, blue, red (book completion)
# Reachable without signing in.
PUBLIC = {"/login", "/forgot", "/healthz", "/logo.png", "/auth.css", "/intro.js", "/favicon.png", "/favicon.ico"}
# Atkinson Hyperlegible Next stays for the TV display; the dashboard and admin pages use Figtree
# for text and titles alike (see DESIGN.md).
FONTS = {"atkinson-next-latin.woff2", "atkinson-next-latin-ext.woff2", "figtree-latin.woff2", "figtree-latin-ext.woff2"}
# /tv/<token> is a TV screen link; tv.py checks the token.
PUBLIC_PREFIXES = ("/invite/", "/reset/", "/tv/", "/fonts/")


def valid_state(state):
    """Validate the structure consumed by the dashboard before replacing a class."""
    if not isinstance(state, dict):
        return False
    if not isinstance(state.get("name"), str) or not state["name"].strip():
        return False
    try:
        date.fromisoformat(state["fcd"])
    except (KeyError, TypeError, ValueError):
        return False
    levels = state.get("L")
    if not isinstance(levels, list) or not levels or not all(type(n) is int and n > 0 for n in levels):
        return False
    # Numbered Juz items that follow the book (198 An-Naba onwards). Older records have none.
    juz_items = state.get("Q", 0)
    if type(juz_items) is not int or juz_items < 0:
        return False
    students = state.get("S")
    if not isinstance(students, list):
        return False
    for student in students:
        if not isinstance(student, dict) or not isinstance(student.get("name"), str):
            return False
        if not all(type(student.get(k)) is int and student[k] >= 0 for k in ("target", "passes", "merits", "warn")):
            return False
        if not 1 <= student["target"] <= sum(levels) + juz_items + 1 or student["warn"] > 3:
            return False
        for key in ("log", "lt", "ml"):
            if not isinstance(student.get(key), list) or not all(type(n) in (int, float) and n >= 0 for n in student[key]):
                return False
        # Fails are dated like passes but never change the target or the pass count.
        fails = student.get("fl", [])
        if not isinstance(fails, list) or not all(type(n) in (int, float) and n >= 0 for n in fails):
            return False
        if not isinstance(student.get("lx"), list) or not all(isinstance(x, str) for x in student["lx"]):
            return False
        # Details from the CSV upload: Student ID, gender, Safar year group, school year group,
        # Islamic Studies teacher.
        if not all(isinstance(student.get(k, ""), str) for k in ("sid", "gender", "year", "sy", "ist")):
            return False
        # Qaidah level, set on the Record page: 0 until set, then 1 to QAIDAH_LEVELS.
        qaidah = student.get("qa", 0)
        if type(qaidah) is not int or not 0 <= qaidah <= QAIDAH_LEVELS:
            return False
        # Level tests from the Record page: day, Quran ("q") or Memo ("m"), level or target, 0 to 5 score, passed,
        # and for a pass, when its blue token was given.
        tests = student.get("tests", [])
        if not isinstance(tests, list) or not all(
                isinstance(x, dict) and isinstance(x.get("d"), str) and DAY.fullmatch(x["d"]) and x.get("k") in ("q", "m")
                and type(x.get("n")) is int and x["n"] >= 1 and type(x.get("sc")) is int and 0 <= x["sc"] <= 5
                and type(x.get("ok")) is bool and type(x.get("pq", 0)) is int and 0 <= x.get("pq", 0) <= QAIDAH_LEVELS
                and type(x.get("tk", 0)) in (int, float) and x.get("tk", 0) >= 0
                for x in tests):
            return False
        # Star of the week: the Monday of each week the student was chosen.
        stars = student.get("sw", [])
        if not isinstance(stars, list) or not all(isinstance(d, str) and DAY.fullmatch(d) for d in stars):
            return False
        # House points: the student's house (from the CSV) and the times each token was given.
        if student.get("house", "") not in ("",) + HOUSES:
            return False
        for key in TOKEN_POINTS:
            tokens = student.get(key, [])
            if not isinstance(tokens, list) or not all(type(n) in (int, float) and n >= 0 for n in tokens):
                return False
        if len(student["log"]) != len(student["lt"]) or len(student["log"]) != len(student["lx"]):
            return False
        # The Quran tab scores out of 5, starting at 0.
        if not isinstance(student.get("q"), dict) or not all(type(v) is int and 0 <= v <= 5 for v in student["q"].values()):
            return False
    return True




DASHBOARD_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                 "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
PAGE_CSP = ("default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; "
            "base-uri 'none'")
# The sign-in page also runs one script of ours, /intro.js, which focuses the email field after the opening.
LOGIN_CSP = PAGE_CSP + "; script-src 'self'"
# Email previews are styled inline, as emails must be; they have no scripts or forms.
EMAIL_PREVIEW_CSP = ("default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'none'; "
                     "frame-ancestors 'none'; base-uri 'none'")
# A classroom saved again by the same person within this time updates its latest
# history entry instead of adding one, so that history doesn't grow with every click.
HISTORY_COALESCE = 15 * 60


class RailwayProxy:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        real_ip = environ.get("HTTP_X_REAL_IP", "").strip()
        if real_ip:
            environ["REMOTE_ADDR"] = real_ip[:64]
        return self.wsgi_app(environ, start_response)


# Opening the site in a new tab or window always starts at the sign-in page. A tab that has just signed in is
# marked in sessionStorage (which lasts for that tab only, through refreshes); a dashboard loaded in a tab without
# the mark signs out and goes to the sign-in page. If sessionStorage is blocked, the 20-minute idle limit still applies.
TAB_GUARD = ("(function(){try{var k='mysafar.tab';if(ME.fresh){document.documentElement.classList.add('fresh');"
             "sessionStorage.setItem(k,'1');return}"
             "if(sessionStorage.getItem(k))return;window.SIGNING_OUT=true;"
             "document.documentElement.style.visibility='hidden';var f=new FormData();f.append('csrf',ME.csrf);"
             "fetch('/logout',{method:'POST',body:f,credentials:'same-origin'}).then(go,go);"
             "function go(){location.replace('/login')}}catch(e){}})();")


def script_json(value):
    """JSON that is safe inside a <script> element."""
    return json.dumps(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def hide_link_tokens(record):
    """Flask logs the path of a request that fails; an invite or reset link's token stays out of it."""
    record.msg, record.args = auth.hide_link_tokens(record.getMessage()), None
    return True


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None, template_folder=str(ROOT / "templates"))
    app.logger.addFilter(hide_link_tokens)
    app.config.update(
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        DATABASE_URL=os.environ.get("DATABASE_URL", ""),
        DATA_DIR=os.environ.get("DATA_DIR", str(ROOT / ".local-data")),
        ADMIN_EMAIL=os.environ.get("ADMIN_EMAIL", ""),
        DASHBOARD_PASSWORD=os.environ.get("DASHBOARD_PASSWORD", ""),
        COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "1") != "0",
        # The site's address in invite and reset links. Railway's own RAILWAY_PUBLIC_DOMAIN can name a
        # domain that no longer exists, so it isn't used; without PUBLIC_URL the request's address is.
        PUBLIC_URL=os.environ.get("PUBLIC_URL", ""),
        TRUST_PROXY=bool(os.environ.get("RAILWAY_ENVIRONMENT_ID")),
        RESEND_API_KEY=os.environ.get("RESEND_API_KEY", ""),
        MAIL_FROM=os.environ.get("MAIL_FROM", ""),
        MAIL_REDIRECT_TO=os.environ.get("MAIL_REDIRECT_TO", ""),
        # Where replies to the dashboard's emails go. Defaults to SUPPORT_EMAIL.
        MAIL_REPLY_TO=os.environ.get("MAIL_REPLY_TO", "").strip(),
        RETENTION_DAYS=int(os.environ.get("RETENTION_DAYS", "14")),
        # Shown on the password pages so staff can contact the school office directly.
        SUPPORT_EMAIL=os.environ.get("SUPPORT_EMAIL", "").strip(),
    )
    if test_config:
        app.config.update(test_config)
    if app.config["TRUST_PROXY"]:
        # Railway's edge proxy sets X-Forwarded-Proto and X-Forwarded-Host to the public request,
        # and X-Real-IP to the client's address (used for sign-in limits and the activity log).
        app.wsgi_app = RailwayProxy(ProxyFix(app.wsgi_app, x_proto=1, x_host=1))
    database = Database(app.config["DATABASE_URL"].strip(), app.config["DATA_DIR"], app.config.get("TESTING"))
    database.migrate()
    auth.bootstrap_admin(database, app.config["ADMIN_EMAIL"], app.config["DASHBOARD_PASSWORD"])
    app.config["DB"] = database
    app.config.setdefault("MAILER", Mailer(app.config["RESEND_API_KEY"].strip(), app.config["MAIL_FROM"].strip(),
                                           app.config["MAIL_REDIRECT_TO"].strip(),
                                           app.config["MAIL_REPLY_TO"] or app.config["SUPPORT_EMAIL"]))
    app.register_blueprint(auth.bp)
    app.register_blueprint(tv.bp)
    app.register_blueprint(cleanup.bp)
    app.register_blueprint(export.bp)
    pruned = {"at": 0}

    def wants_json():
        return request.path.startswith("/api/")

    @app.before_request
    def require_login():
        if request.path == "/healthz":
            return None
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            # Writes only from this site's own pages.
            origin = request.headers.get("Origin")
            own = {request.host_url.rstrip("/"), app.config["PUBLIC_URL"].rstrip("/")}
            if (origin and origin not in own) or request.headers.get("Sec-Fetch-Site") == "cross-site":
                abort(403)
        auth.load_session()
        if time.time() - pruned["at"] > 3600:
            pruned["at"] = time.time()
            auth.prune(database, app.config["RETENTION_DAYS"])
        public = request.path in PUBLIC or request.path.startswith(PUBLIC_PREFIXES)
        if not g.user and not public:
            if wants_json() or request.method != "GET":
                return jsonify(error="Your session has ended. Sign in again."), 401
            target = request.full_path.rstrip("?")
            return redirect("/login" + ("" if target == "/" else "?next=" + quote(target, safe="/")))
        if g.user and g.user["must_change"] and not public and request.path not in ("/account", "/account/password", "/logout"):
            if wants_json():
                return jsonify(error="Choose a new password before continuing."), 403
            return redirect("/account")
        if wants_json() and request.method not in ("GET", "HEAD", "OPTIONS"):
            # JSON plus this custom header require a CORS preflight cross-origin.
            # No CORS access is granted by this server.
            if not request.is_json or request.headers.get("X-Dashboard-Request") != "1":
                abort(403)

    @app.after_request
    def private_responses(response):
        # The font files are public and never change; everything else is private.
        # The logo is public too, and email apps fetch it for every email they show.
        response.headers["Cache-Control"] = "public, max-age=604800" if (request.path.startswith("/fonts/")
            or request.path in ("/logo.png", "/favicon.png", "/favicon.ico")) and response.status_code == 200 else "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        dashboard = request.path in ("/", "/tv") or (request.path.startswith("/tv/") and response.mimetype == "text/html"
                                                        and response.status_code == 200)
        response.headers["Content-Security-Policy"] = DASHBOARD_CSP if dashboard else \
            EMAIL_PREVIEW_CSP if request.path.startswith("/admin/email/preview/") else \
            LOGIN_CSP if request.path == "/login" else PAGE_CSP
        if app.config["COOKIE_SECURE"]:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    @app.get("/healthz")
    def health():
        try:
            with database.transaction() as db:
                db.execute("SELECT COUNT(*) FROM classrooms").fetchone()
            return jsonify(status="ok")
        except DB_ERRORS:
            return jsonify(status="unavailable"), 503

    logo = {}

    @app.get("/logo.png")
    def logo_png():
        if "png" not in logo:
            logo["png"] = base64.b64decode((ROOT / "src" / "logo.b64").read_text().strip())
        response = Response(logo["png"], mimetype="image/png")
        return response

    # The browser tab icon: the logo on a white disc, so it reads as a circle on light and dark tabs alike.
    @app.get("/favicon.png")
    @app.get("/favicon.ico")
    def favicon():
        return Response((ROOT / "static" / "favicon.png").read_bytes(), mimetype="image/png")

    @app.get("/auth.css")
    def auth_css():
        # The shared shell and tokens (also inlined in the dashboard), then the admin page styles.
        css = (ROOT / "src" / "tokens.css").read_text(encoding="utf-8") + "\n" + \
            (ROOT / "static" / "auth.css").read_text(encoding="utf-8")
        return Response(css, mimetype="text/css")

    @app.get("/intro.js")
    def intro_js():
        return Response((ROOT / "static" / "intro.js").read_text(encoding="utf-8"), mimetype="text/javascript")

    @app.get("/fonts/<name>")
    def font(name):
        if name not in FONTS:
            abort(404)
        return Response((ROOT / "static" / "fonts" / name).read_bytes(), mimetype="font/woff2")

    @app.get("/")
    def dashboard():
        fresh = bool(request.cookies.get(auth.fresh_cookie_name()))
        me = {"name": g.user["name"], "email": g.user["email"], "role": g.user["role"], "csrf": g.session["csrf"],
              "fresh": fresh}
        html = (ROOT / "Master_Dashboard_standalone.html").read_text(encoding="utf-8")
        html = html.replace("<script>", f"<script>window.RAILWAY=true;window.ME={script_json(me)};{TAB_GUARD}</script>\n<script>", 1)
        html = html.replace("<header>", "<header inert>").replace("<main>", "<main inert>")
        html = html.replace("</body>", '<script src="/railway-storage.js"></script></body>')
        response = Response(html, mimetype="text/html")
        if fresh:
            response.delete_cookie(auth.fresh_cookie_name(), path="/", secure=app.config["COOKIE_SECURE"])
        return response

    @app.get("/Master_Dashboard_standalone.html")
    def old_dashboard_link():
        return redirect("/")

    @app.get("/railway-storage.js")
    def storage_script():
        return Response((ROOT / "railway-storage.js").read_text(encoding="utf-8"), mimetype="text/javascript")

    def is_admin():
        return g.user["role"] == "admin"

    def can_edit(db, class_id):
        return is_admin() or db.execute("SELECT 1 FROM classroom_members WHERE class_id = ? AND user_id = ?",
                                        (class_id, g.user["id"])).fetchone() is not None

    def record_history(db, class_id, revision, encoded):
        """Adds a history entry, or updates this person's latest one if it is recent."""
        t = int(time.time())
        last = db.execute("SELECT id, saved_by, saved_at, json FROM classroom_history WHERE class_id = ? "
                          "ORDER BY id DESC LIMIT 1", (class_id,)).fetchone()
        if last and last["json"] is not None and last["saved_by"] == g.user["id"] and t - last["saved_at"] < HISTORY_COALESCE:
            db.execute("UPDATE classroom_history SET revision = ?, json = ? WHERE id = ?", (revision, encoded, last["id"]))
            return
        db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)",
                   (class_id, revision, encoded, g.user["id"], t))
        auth.audit(db, "class.saved", class_id, {"revision": revision})

    @app.get("/api/classes")
    def read_classes():
        with database.transaction() as db:
            if is_admin():
                rows = db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall()
            else:
                rows = db.execute("SELECT c.id, c.json, c.revision FROM classrooms c JOIN classroom_members m "
                                  "ON m.class_id = c.id WHERE m.user_id = ? ORDER BY c.id", (g.user["id"],)).fetchall()
            return jsonify({row["id"]: {"json": row["json"], "revision": row["revision"]} for row in rows})

    @app.get("/api/houses")
    def house_totals():
        """Whole-school house points. Only totals, so teachers can see them too."""
        totals = dict.fromkeys(HOUSES, 0)
        with database.transaction() as db:
            rows = db.execute("SELECT json FROM classrooms").fetchall()
        for row in rows:
            for student in json.loads(row["json"]).get("S", []):
                if student.get("house") in totals:
                    totals[student["house"]] += sum(len(student.get(k, [])) * v for k, v in TOKEN_POINTS.items())
        return jsonify(totals)

    @app.put("/api/classes/<class_id>")
    def write_class(class_id):
        """Revision 0 creates a classroom; otherwise it must match the stored revision."""
        document = request.get_json()
        if not CLASS_ID.fullmatch(class_id) or not isinstance(document, dict) or not isinstance(document.get("json"), str) \
                or type(document.get("revision")) is not int or document["revision"] < 0:
            abort(400)
        try:
            state = json.loads(document["json"])
            if not valid_state(state):
                abort(400)
            encoded = json.dumps(state, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        except (TypeError, ValueError):
            abort(400)
        with database.transaction() as db:
            if not can_edit(db, class_id) or (document["revision"] == 0 and not is_admin()):
                return jsonify(error="Your account can't change this classroom."), 403
            if document["revision"] == 0:
                exists = db.execute("SELECT 1 FROM classrooms WHERE id = ?", (class_id,)).fetchone()
                if not exists and db.execute("SELECT COUNT(*) AS n FROM classrooms").fetchone()["n"] >= MAX_CLASSES:
                    return jsonify(error=f"The dashboard holds at most {MAX_CLASSES} classrooms."), 400
                cursor = db.execute("INSERT INTO classrooms VALUES (?, ?, 1) ON CONFLICT (id) DO NOTHING",
                                    (class_id, encoded))
            else:
                cursor = db.execute("UPDATE classrooms SET json = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
                                    (encoded, class_id, document["revision"]))
            if cursor.rowcount:
                record_history(db, class_id, document["revision"] + 1, encoded)
                return jsonify(revision=document["revision"] + 1)
            current = db.execute("SELECT json, revision FROM classrooms WHERE id = ?", (class_id,)).fetchone()
            if current is None:
                abort(404)
            # A lost response may cause an identical write to be retried.
            if json.loads(current["json"]) == state:
                return jsonify(revision=current["revision"])
            return jsonify(error="This class changed in another browser. Reload before editing again."), 409

    @app.delete("/api/classes/<class_id>")
    def delete_class(class_id):
        """Deletes a classroom if it is still at the revision the browser last saw."""
        document = request.get_json()
        if not CLASS_ID.fullmatch(class_id) or not isinstance(document, dict) or type(document.get("revision")) is not int:
            abort(400)
        if not is_admin():
            return jsonify(error="Only an admin can delete a classroom."), 403
        with database.transaction() as db:
            cursor = db.execute("DELETE FROM classrooms WHERE id = ? AND revision = ?", (class_id, document["revision"]))
            if cursor.rowcount:
                db.execute("DELETE FROM classroom_members WHERE class_id = ?", (class_id,))
                # A history entry without a record marks the deletion; the entries before it can restore it.
                db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, NULL, ?, ?)",
                           (class_id, document["revision"], g.user["id"], int(time.time())))
                auth.audit(db, "class.deleted", class_id, {"revision": document["revision"]})
                return jsonify(deleted=True)
            # Deleting a classroom that is already gone succeeds, so a retried request is harmless.
            if db.execute("SELECT 1 FROM classrooms WHERE id = ?", (class_id,)).fetchone() is None:
                return jsonify(deleted=True)
            return jsonify(error="This class changed in another browser. Reload before deleting it."), 409

    @app.get("/admin/history")
    @auth.admin_required
    def history():
        with database.transaction() as db:
            current = {row["id"] for row in db.execute("SELECT id FROM classrooms").fetchall()}
            rows = db.execute("SELECT h.class_id, h.json, h.saved_at, u.name FROM classroom_history h "
                              "LEFT JOIN users u ON u.id = h.saved_by ORDER BY h.id DESC").fetchall()
        classes = {}
        for row in rows:
            entry = classes.setdefault(row["class_id"], {"id": row["class_id"], "name": None, "count": 0,
                                                         "last": row["saved_at"], "by": row["name"],
                                                         "deleted": row["class_id"] not in current})
            entry["count"] += 1
            if entry["name"] is None and row["json"]:
                entry["name"] = json.loads(row["json"]).get("name")
        return auth.page("admin_history.html", classes=sorted(classes.values(), key=lambda c: -c["last"]))

    def class_history(class_id):
        with database.transaction() as db:
            rows = db.execute("SELECT h.id, h.revision, h.json, h.saved_at, u.name FROM classroom_history h "
                              "LEFT JOIN users u ON u.id = h.saved_by WHERE h.class_id = ? ORDER BY h.id DESC",
                              (class_id,)).fetchall()
            exists = db.execute("SELECT 1 FROM classrooms WHERE id = ?", (class_id,)).fetchone() is not None
        entries = []
        for row in rows:
            state = json.loads(row["json"]) if row["json"] else None
            entries.append({"id": row["id"], "saved_at": row["saved_at"], "by": row["name"],
                            "name": state.get("name") if state else None,
                            "students": len(state.get("S", [])) if state else None})
        return entries, exists

    @app.get("/admin/history/<class_id>")
    @auth.admin_required
    def history_of(class_id):
        entries, exists = class_history(class_id)
        if not entries:
            abort(404)
        return auth.page("admin_class_history.html", class_id=class_id, entries=entries, exists=exists)

    @app.post("/admin/history/<class_id>/restore")
    @auth.admin_required
    def restore(class_id):
        """Saves an earlier version as the classroom's newest one, or brings back a deleted classroom."""
        auth.check_form_token()
        with database.transaction() as db:
            row = db.execute("SELECT json FROM classroom_history WHERE id = ? AND class_id = ? AND json IS NOT NULL",
                             (request.form.get("entry", type=int), class_id)).fetchone()
            if not row:
                abort(404)
            current = db.execute("SELECT revision FROM classrooms WHERE id = ?", (class_id,)).fetchone()
            if current:
                revision = current["revision"] + 1
                db.execute("UPDATE classrooms SET json = ?, revision = ? WHERE id = ?", (row["json"], revision, class_id))
            else:
                revision = 1
                db.execute("INSERT INTO classrooms VALUES (?, ?, 1)", (class_id, row["json"]))
            db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)",
                       (class_id, revision, row["json"], g.user["id"], int(time.time())))
            auth.audit(db, "class.restored", class_id, {"entry": request.form.get("entry", type=int)})
        entries, exists = class_history(class_id)
        return auth.page("admin_class_history.html", class_id=class_id, entries=entries, exists=exists,
                         notice="Restored. Open dashboards will show this version within a few seconds.")

    return app
