"""The TV dashboard: a read-only screen for the admin area.

A TV can't sign in like staff, so an admin makes it a screen link on the TV
screens page. The link holds a long random token (stored only as a SHA-256 hash)
and shows the dashboard and nothing else: whole-school totals and short names
(first name and surname initial), never student records, and no way to change
anything. An admin can turn a link off at any time. Signed-in staff can open
the same dashboard at /tv.

Real achievements are celebrated on the screen as they happen: a book or a level test passed, a house or the whole
school reaching a points milestone, a new house in the lead and a teacher's star of the week. Each display (a screen
link, or a member of staff at /tv) remembers in `tv_displays` which of these it has already celebrated, so polling,
refreshing and reconnecting never replay one. A display seen for the first time starts from what is already there.
"""
import hashlib
import json
import os
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
RECENT_DAYS = 7  # how far back a display still celebrates a pupil's achievement it missed (it was off, say)
# Points milestones, changeable with TV_HOUSE_MILESTONES and TV_SCHOOL_MILESTONES (comma-separated numbers).
HOUSE_MILESTONES = "100,250,500,1000,1500,2000,3000,4000,5000,7500,10000"
SCHOOL_MILESTONES = "500,1000,2500,5000,10000,15000,20000,30000"

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


def milestones(name, default):
    try:
        return sorted({int(n) for n in os.environ.get(name, default).split(",") if n.strip()})
    except ValueError:
        return sorted(int(n) for n in default.split(","))


def event_id(*parts):
    # Ids never carry a full name: the TV is only ever sent short names.
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:20]


def summary(rows, now=None):
    """Everything the TV shows, worked out from the classroom records, plus the achievements it could celebrate."""
    now = now or datetime.now(auth.LONDON)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # The dashboard records times in milliseconds.
    month = day.replace(day=1).timestamp() * 1000
    monday = day - timedelta(days=day.weekday())
    week, week_key = monday.timestamp() * 1000, monday.strftime("%Y-%m-%d")
    recent = (day - timedelta(days=RECENT_DAYS)).timestamp() * 1000
    recent_day = (day - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%d")
    houses = dict.fromkeys(HOUSES, 0)
    books, stars, passes, events = [], [], {"primary": [], "secondary": []}, []
    for row in rows:
        state = json.loads(row["json"])
        class_name = state.get("name") or row["id"]
        best, chosen = None, None
        for s in state.get("S", []):
            full = s.get("name", "")
            name = short_name(full)
            if not name:
                continue
            house = s.get("house", "") if s.get("house") in houses else ""
            if house:
                houses[house] += sum(len(s.get(k, [])) * v for k, v in TOKEN_POINTS.items())
            # A red token is given for completing a book.
            if since(s.get("tr", []), month):
                books.append({"name": name, "class": class_name, "house": house})
            for t in s.get("tr", []):
                if t >= recent:
                    events.append({"id": event_id(row["id"], full, "book", t), "kind": "book", "at": t,
                                   "title": "Book completed!", "name": name, "detail": class_name, "house": house})
            for t in s.get("tests", []):
                if t.get("ok") and str(t.get("d", "")) >= recent_day:
                    what = f"Qaidah Level {t.get('n')}" if t.get("k") == "q" else "Memorisation test"
                    events.append({"id": event_id(row["id"], full, "test", t.get("d"), t.get("k"), t.get("n")),
                                   "kind": "level", "at": str(t.get("d")), "title": "Level complete!", "name": name,
                                   "detail": f"{what} · {class_name}", "house": house})
            week_passes, week_merits = since(s.get("log", []), week), since(s.get("ml", []), week)
            # Star of the week: the teacher's choice, otherwise the most passes and merits since Monday.
            if week_key in (s.get("sw") or []) and not chosen:
                chosen = (name, house, week_passes, week_merits)
                events.append({"id": event_id(row["id"], full, "star", week_key), "kind": "star", "at": week_key,
                               "title": "Star of the week", "name": name, "detail": class_name, "house": house})
            score = (week_passes + week_merits, week_passes, week_merits)
            if score[0] and (best is None or score > best[0]):
                best = (score, name, house)
            stage = school_stage(s, class_name)
            month_passes = since(s.get("log", []), month)
            if stage and month_passes:
                passes[stage].append({"name": name, "class": class_name, "passes": month_passes, "house": house})
        if chosen:
            stars.append({"class": class_name, "name": chosen[0], "house": chosen[1], "passes": chosen[2],
                          "merits": chosen[3], "chosen": True})
        else:
            stars.append({"class": class_name, "name": best[1] if best else None, "house": best[2] if best else "",
                          "passes": best[0][1] if best else 0, "merits": best[0][2] if best else 0, "chosen": False})
    for stage in passes:
        # The three highest numbers of passes make the podium; pupils with the same number share a place.
        ordered = sorted(passes[stage], key=lambda p: (-p["passes"], p["name"]))
        counts = sorted({p["passes"] for p in ordered}, reverse=True)
        for p in ordered:
            p["rank"] = counts.index(p["passes"]) + 1
        passes[stage] = [p for p in ordered if p["rank"] <= 3]
    standings = [{"house": h, "points": houses[h], "rank": 1 + sum(1 for p in houses.values() if p > houses[h])}
                 for h in sorted(HOUSES, key=lambda h: -houses[h])]
    top = standings[0]
    leader = top["house"] if top["points"] > 0 and standings[1]["points"] < top["points"] else None
    for h in HOUSES:
        reached = [m for m in milestones("TV_HOUSE_MILESTONES", HOUSE_MILESTONES) if houses[h] >= m]
        if reached:
            events.append({"id": f"house:{h}:{reached[-1]}", "kind": "house", "title": f"{reached[-1]:,} house points!",
                           "name": h, "detail": "A house milestone", "house": h})
    total = sum(houses.values())
    reached = [m for m in milestones("TV_SCHOOL_MILESTONES", SCHOOL_MILESTONES) if total >= m]
    if reached:
        events.append({"id": f"school:{reached[-1]}", "kind": "school", "title": f"{reached[-1]:,} points together!",
                       "name": "Safar Academy", "detail": "Every house helped", "house": ""})
    return {
        "houses": standings,
        "leader": leader,
        "total": total,
        "books": sorted(books, key=lambda b: b["name"]),
        "stars": sorted(stars, key=lambda s: natural(s["class"])),
        "passes": passes,
        "month": now.strftime("%B"),
        "events": sorted(events, key=lambda e: str(e.get("at", ""))),
    }


def leader_event(data):
    house = data["leader"]
    return {"id": f"leader:{house}:{data['houses'][0]['points']}", "kind": "leader", "title": "New house in the lead!", "name": house,
            "detail": f"{data['houses'][0]['points']:,} points", "house": house}


def display_state(tx, display):
    row = tx.execute("SELECT state FROM tv_displays WHERE display = ?", (display,)).fetchone()
    return json.loads(row["state"]) if row else None


def save_state(tx, display, state):
    tx.execute("INSERT INTO tv_displays (display, state, updated_at) VALUES (?, ?, ?) "
               "ON CONFLICT (display) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
               (display, json.dumps(state), auth.now()))


def data(display):
    with auth.db().transaction() as tx:
        rows = tx.execute("SELECT id, json FROM classrooms").fetchall()
        result = summary(rows)
        candidates = result.pop("events")
        state = display_state(tx, display)
        if state is None:
            # A new display starts from what is already there rather than replaying the school's history.
            save_state(tx, display, {"seen": [e["id"] for e in candidates], "leader": result["leader"]})
            events = []
        else:
            seen = set(state.get("seen", []))
            events = [e for e in candidates if e["id"] not in seen]
            if result["leader"] and result["leader"] != state.get("leader"):
                events.insert(0, leader_event(result))
    result["events"] = events
    return jsonify(result)


def seen(display):
    """The display has celebrated these events (their ids, from data())."""
    ids = (request.get_json(silent=True) or {}).get("ids")
    if not isinstance(ids, list) or len(ids) > 100 or not all(isinstance(i, str) and len(i) <= 80 for i in ids):
        return jsonify(error="Send the ids of the events shown."), 400
    with auth.db().transaction() as tx:
        rows = tx.execute("SELECT id, json FROM classrooms").fetchall()
        result = summary(rows)
        current = {e["id"] for e in result["events"]}
        state = display_state(tx, display) or {"seen": [], "leader": result["leader"]}
        for i in ids:
            if i.startswith("leader:") and i.split(":")[1] in HOUSES:
                state["leader"] = i.split(":")[1]
        # Only ids that could still come back are kept, so the list stays small.
        state["seen"] = sorted((set(state.get("seen", [])) | set(ids)) & current)
        save_state(tx, display, state)
    return jsonify(ok=True)


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
    return data(f"user:{g.user['id']}")


@bp.post("/api/tv/seen")
def staff_seen():
    return seen(f"user:{g.user['id']}")


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
    return data(f"screen:{row['id']}")


@bp.post("/tv/<token>/seen")
def screen_seen(token):
    row = screen(token)
    if not row:
        return jsonify(error="This screen's link has been turned off."), 404
    return seen(f"screen:{row['id']}")


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
