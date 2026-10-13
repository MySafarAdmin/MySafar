"""The TV dashboard: a read-only screen for the admin area.

A TV can't sign in like staff, so an admin makes it a screen link on the TV
screens page. The link holds a long random token (stored only as a SHA-256 hash)
and shows the dashboard and nothing else: whole-school totals and short names
(first name and surname initial), never student records, and no way to change
anything. An admin can turn a link off at any time. Signed-in staff can open
the same dashboard at /tv.
"""
import json
import re
import secrets
from datetime import datetime, timedelta
from pathlib import Path

from flask import Blueprint, Response, abort, current_app, g, jsonify, request

import auth

ROOT = Path(__file__).resolve().parent
HOUSES = ("Makkah", "Al-Aqsa", "Madinah")
# Keep in step with TOKEN_POINTS in server.py and TOK in src/page.html.
TOKEN_POINTS = {"tg": 5, "tb": 20, "tr": 50}  # green, blue, red (book completion)
YEAR = re.compile(r"(?:year|yr)\s*(\d+)", re.I)
SEEN_EVERY = 300  # record a screen's last visit at most every 5 minutes

bp = Blueprint("tv", __name__)


def short_name(name):
    """'Aisha Khan' -> 'Aisha K.'"""
    words = name.split()
    if not words:
        return ""
    return words[0] + (" " + words[-1][0].upper() + "." if len(words) > 1 else "")


def school_stage(student, class_name):
    """'primary' for Reception to Year 6, 'secondary' for Year 7 onwards, None if unknown.

    The Safar year group decides, then the classroom name (Yr7-B-...), then the school year group."""
    for text in (student.get("year", ""), class_name, student.get("sy", "")):
        if re.search(r"\breception\b", text or "", re.I):
            return "primary"
        match = YEAR.search(text or "")
        if match:
            return "primary" if int(match.group(1)) <= 6 else "secondary"
    return None


def natural(text):
    """Sorts Yr3 before Yr11."""
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", text.lower())]


def since(times, start):
    return sum(1 for t in times if t >= start)


def summary(rows, now=None):
    """Everything the TV shows, worked out from the classroom records."""
    now = now or datetime.now(auth.LONDON)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # The dashboard records times in milliseconds.
    month = day.replace(day=1).timestamp() * 1000
    week = (day - timedelta(days=day.weekday())).timestamp() * 1000
    houses = dict.fromkeys(HOUSES, 0)
    books, stars, passes = [], [], {"primary": [], "secondary": []}
    for row in rows:
        state = json.loads(row["json"])
        class_name = state.get("name") or row["id"]
        best = None
        for s in state.get("S", []):
            name = short_name(s.get("name", ""))
            if not name:
                continue
            if s.get("house") in houses:
                houses[s["house"]] += sum(len(s.get(k, [])) * v for k, v in TOKEN_POINTS.items())
            # A red token is given for completing a book.
            if since(s.get("tr", []), month):
                books.append({"name": name, "class": class_name, "house": s.get("house", "")})
            # Star of the week: the most passes and merits since Monday.
            week_passes, week_merits = since(s.get("log", []), week), since(s.get("ml", []), week)
            score = (week_passes + week_merits, week_passes, week_merits)
            if score[0] and (best is None or score > best[0]):
                best = (score, name, s.get("house", ""))
            stage = school_stage(s, class_name)
            month_passes = since(s.get("log", []), month)
            if stage and month_passes:
                passes[stage].append({"name": name, "class": class_name, "passes": month_passes})
        stars.append({"class": class_name, "name": best[1] if best else None, "house": best[2] if best else "",
                      "passes": best[0][1] if best else 0, "merits": best[0][2] if best else 0})
    for stage in passes:
        passes[stage] = sorted(passes[stage], key=lambda p: (-p["passes"], p["name"]))[:3]
    return {
        "houses": sorted(({"house": h, "points": p} for h, p in houses.items()), key=lambda h: -h["points"]),
        "books": sorted(books, key=lambda b: b["name"]),
        "stars": sorted(stars, key=lambda s: natural(s["class"])),
        "passes": passes,
        "month": now.strftime("%B"),
    }


def data():
    with auth.db().transaction() as tx:
        rows = tx.execute("SELECT id, json FROM classrooms").fetchall()
    return jsonify(summary(rows))


def page():
    return Response((ROOT / "static" / "tv.html").read_text(encoding="utf-8"), mimetype="text/html")


def screen(token):
    """The screen this token belongs to, if it is still turned on."""
    if len(token) > 100:
        return None
    t = auth.now()
    with auth.db().transaction() as tx:
        row = tx.execute("SELECT id, last_seen_at FROM tv_screens WHERE token_hash = ? AND revoked_at IS NULL",
                         (auth.token_hash(token),)).fetchone()
        if row and t - (row["last_seen_at"] or 0) >= SEEN_EVERY:
            tx.execute("UPDATE tv_screens SET last_seen_at = ? WHERE id = ?", (t, row["id"]))
    return row


@bp.get("/tv")
def staff_page():
    return page()


@bp.get("/api/tv")
def staff_data():
    return data()


@bp.get("/tv/<token>")
def screen_page(token):
    if not screen(token):
        return auth.page("tv_off.html", 404)
    return page()


@bp.get("/tv/<token>/data")
def screen_data(token):
    if not screen(token):
        return jsonify(error="This screen's link has been turned off."), 404
    return data()


def screens_page(status=200, **context):
    with auth.db().transaction() as tx:
        screens = [dict(row) for row in tx.execute(
            "SELECT s.id, s.name, s.created_at, s.last_seen_at, u.name AS created_by FROM tv_screens s "
            "LEFT JOIN users u ON u.id = s.created_by WHERE s.revoked_at IS NULL ORDER BY s.created_at").fetchall()]
    return auth.page("admin_tv.html", status, screens=screens, **context)


@bp.get("/admin/tv")
@auth.admin_required
def admin_screens():
    return screens_page()


@bp.post("/admin/tv/new")
@auth.admin_required
def admin_new_screen():
    auth.check_form_token()
    name = " ".join(request.form.get("name", "").split())[:80] or "TV"
    token = secrets.token_urlsafe(32)
    with auth.db().transaction() as tx:
        screen_id = tx.insert("INSERT INTO tv_screens (name, token_hash, created_by, created_at) VALUES (?, ?, ?, ?)",
                              (name, auth.token_hash(token), g.user["id"], auth.now()))
        auth.audit(tx, "tv.created", detail={"screen": screen_id, "name": name})
    return screens_page(notice=f"Link made for {name}.", link=auth.public_url("/tv/" + token), link_for=name)


@bp.post("/admin/tv/<int:screen_id>/off")
@auth.admin_required
def admin_screen_off(screen_id):
    auth.check_form_token()
    with auth.db().transaction() as tx:
        row = tx.execute("SELECT name FROM tv_screens WHERE id = ? AND revoked_at IS NULL", (screen_id,)).fetchone()
        if not row:
            abort(404)
        tx.execute("UPDATE tv_screens SET revoked_at = ? WHERE id = ?", (auth.now(), screen_id))
        auth.audit(tx, "tv.revoked", detail={"screen": screen_id, "name": row["name"]})
    return screens_page(notice=f"Turned off the link for {row['name']}. That TV stops showing the dashboard within a minute.")
