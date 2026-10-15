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


def between(times, start, end):
    return sum(1 for t in times if start <= t < end)


def podium(entries, key="n"):
    """The top three different totals, each with everyone on it (ties share a step)."""
    steps = []
    for entry in sorted((e for e in entries if e[key]), key=lambda e: (-e[key], natural(e.get("name") or e["class"]))):
        if steps and steps[-1]["n"] == entry[key]:
            steps[-1]["who"].append(entry)
        elif len(steps) < 3:
            steps.append({"place": len(steps) + 1, "n": entry[key], "who": [entry]})
        else:
            break
    return steps


def class_stage(class_name, stages):
    """A class's stage: from its name (Yr7-B, 9/10), otherwise what most of its students are."""
    stage = school_stage({}, class_name)
    if stage or not stages:
        return stage
    return max(("primary", "secondary"), key=stages.count)


def summary(rows, now=None):
    """Everything the TV shows, worked out from the classroom records."""
    now = now or datetime.now(auth.LONDON)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    first = day.replace(day=1)
    # The dashboard records times in milliseconds, and level tests and stars by day ("2026-10-06").
    month, month_key, today_key = first.timestamp() * 1000, first.strftime("%Y-%m-%d"), day.strftime("%Y-%m-%d")
    monday = day - timedelta(days=day.weekday())
    # Stars of the week: every week from the one the month starts in up to the end of last week.
    weeks, w = [], first - timedelta(days=first.weekday())
    while w < monday:
        weeks.append(w)
        w += timedelta(days=7)
    houses = dict.fromkeys(HOUSES, 0)
    books, stars, memo, qaidah = [], [], [], []
    tops = {kind: {"primary": [], "secondary": []} for kind in ("memo", "qaidah")}
    for row in rows:
        state = json.loads(row["json"])
        class_name = state.get("name") or row["id"]
        students, stages, class_memo, class_qaidah = [], [], 0, 0
        for s in state.get("S", []):
            name = short_name(s.get("name", ""))
            if not name:
                continue
            house = s.get("house", "")
            if house in houses:
                houses[house] += sum(len(s.get(k, [])) * v for k, v in TOKEN_POINTS.items())
            # A red token is given for completing a book.
            if since(s.get("tr", []), month):
                books.append({"name": name, "class": class_name, "house": house})
            passes = since(s.get("log", []), month)
            levels = sum(1 for t in s.get("tests") or [] if t.get("k") == "q" and t.get("ok")
                         and month_key <= str(t.get("d", "")) <= today_key)
            if passes:
                memo.append({"name": name, "class": class_name, "house": house, "n": passes})
            if levels:
                qaidah.append({"name": name, "class": class_name, "house": house, "n": levels})
            class_memo, class_qaidah = class_memo + passes, class_qaidah + levels
            stage = school_stage(s, class_name)
            if stage:
                stages.append(stage)
            students.append((s, name, house))
        stage = class_stage(class_name, stages)
        if stage:
            tops["memo"][stage].append({"class": class_name, "n": class_memo})
            tops["qaidah"][stage].append({"class": class_name, "n": class_qaidah})
        for week in weeks:
            key, start = week.strftime("%Y-%m-%d"), week.timestamp() * 1000
            end = (week + timedelta(days=7)).timestamp() * 1000
            # The teacher's pick from the Quran tab, otherwise the most passes and merits that week.
            star = next(((n, h) for s, n, h in students if key in (s.get("sw") or [])), None)
            if not star:
                best = max(((between(s.get("log", []), start, end) + between(s.get("ml", []), start, end),
                             between(s.get("log", []), start, end), n, h) for s, n, h in students), default=None)
                star = best and best[0] and (best[2], best[3])
            if star:
                stars.append({"name": star[0], "house": star[1], "class": class_name, "week": key,
                              "label": "Week of " + week.strftime("%-d %b")})
    return {
        "houses": sorted(({"house": h, "points": p} for h, p in houses.items()), key=lambda h: -h["points"]),
        "books": sorted(books, key=lambda b: b["name"]),
        "memo": podium(memo),
        "qaidah": podium(qaidah),
        "classes": {kind: {stage: podium(L) for stage, L in v.items()} for kind, v in tops.items()},
        "stars": sorted(stars, key=lambda s: (s["week"], natural(s["class"]))),
        "month": now.strftime("%B"),
    }


WINDOW = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def settings_of(row):
    try:
        settings = json.loads(row["settings"] or "{}")
    except (TypeError, ValueError, KeyError, IndexError):
        settings = {}
    return {k: v for k, v in settings.items() if k in ("qaidah", "memo") and isinstance(v, list) and len(v) == 2
            and all(isinstance(t, str) and WINDOW.match(t) for t in v) and v[0] != v[1]}


def focus(settings, now=None):
    """Which kinds of slide a screen plays now: its Qaidah or Memo window (both when they overlap), else everything."""
    t = (now or datetime.now(auth.LONDON)).strftime("%H:%M")
    on = [k for k in ("qaidah", "memo") if k in settings and (
        settings[k][0] <= t < settings[k][1] if settings[k][0] < settings[k][1]
        else t >= settings[k][0] or t < settings[k][1])]  # a window can run past midnight
    return on or None


def data(settings=None):
    with auth.db().transaction() as tx:
        rows = tx.execute("SELECT id, json FROM classrooms").fetchall()
    result = summary(rows)
    result["focus"] = focus(settings or {})
    return jsonify(result)


def page():
    return Response((ROOT / "static" / "tv.html").read_text(encoding="utf-8"), mimetype="text/html")


def screen(token):
    """The screen this token belongs to, if it is still turned on."""
    if len(token) > 100:
        return None
    t = auth.now()
    with auth.db().transaction() as tx:
        row = tx.execute("SELECT id, last_seen_at, settings FROM tv_screens WHERE token_hash = ? AND revoked_at IS NULL",
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
    row = screen(token)
    if not row:
        return jsonify(error="This screen's link has been turned off."), 404
    return data(settings_of(row))


def screens_page(status=200, **context):
    with auth.db().transaction() as tx:
        screens = [dict(row) for row in tx.execute(
            "SELECT s.id, s.name, s.created_at, s.last_seen_at, s.settings, u.name AS created_by FROM tv_screens s "
            "LEFT JOIN users u ON u.id = s.created_by WHERE s.revoked_at IS NULL ORDER BY s.created_at").fetchall()]
    for s in screens:
        s["windows"] = settings_of(s)
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


@bp.post("/admin/tv/<int:screen_id>/settings")
@auth.admin_required
def admin_screen_settings(screen_id):
    """The daily time windows when this screen plays only the Qaidah slides or only the Memo slides."""
    auth.check_form_token()
    windows = {}
    for kind in ("qaidah", "memo"):
        start, end = request.form.get(kind + "_from", "").strip(), request.form.get(kind + "_to", "").strip()
        if not start and not end:
            continue
        if not (WINDOW.match(start) and WINDOW.match(end)) or start == end:
            return screens_page(400, error="Give each time window a start and an end time, or leave both empty.")
        windows[kind] = [start, end]
    with auth.db().transaction() as tx:
        row = tx.execute("SELECT name FROM tv_screens WHERE id = ? AND revoked_at IS NULL", (screen_id,)).fetchone()
        if not row:
            abort(404)
        tx.execute("UPDATE tv_screens SET settings = ? WHERE id = ?", (json.dumps(windows), screen_id))
        auth.audit(tx, "tv.settings", detail={"screen": screen_id, "name": row["name"], **windows})
    return screens_page(notice=f"Saved the settings for {row['name']}. The TV picks them up within a minute.")
