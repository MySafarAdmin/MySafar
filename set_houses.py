"""One-off: give every student the house on the school's house list (data/houses.csv).

The list has each student's Student ID, their MySafar name and their house. Students are matched by Student
ID, so SE0264 and SE264 are the same student. An ID listed twice is matched only together with the
student's name.

An admin opens /admin/set-houses to see, class by class, whose house would change, which students on the
dashboard aren't on the list and which IDs on the list aren't on the dashboard; nothing changes until they
confirm. Anyone not on the list keeps their house. The version of each class from just before is kept in
Class history, so it can be restored from there. Remove this file once it has been used.
"""
import csv
import json
import re
import time
from collections import Counter
from pathlib import Path

from flask import Blueprint, current_app, g, request

import auth

FILE = Path(__file__).with_name("data") / "houses.csv"
HOUSES = ("Makkah", "Al-Aqsa", "Madinah")

bp = Blueprint("set_houses", __name__)


def sid_key(sid):
    """SE0264 and se264 are the same ID."""
    m = re.fullmatch(r"\s*([A-Za-z]*)\s*0*(\d+)\s*", str(sid or ""))
    return (m.group(1).upper() + m.group(2)) if m else str(sid or "").strip().upper()


def name_key(name):
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def wanted():
    """[(id key, Student ID, name, house)] from the file."""
    out = []
    with FILE.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            house = row["House"].strip()
            assert house in HOUSES, house
            out.append((sid_key(row["Student ID"]), row["Student ID"].strip(), " ".join(row["MySafar Name"].split()), house))
    return out


def plan(db):
    """([(class_id, revision, class name, new state, changes [(student, old, new)], not on the list)],
    IDs on the list that match nobody on the dashboard, IDs listed more than once)."""
    want = wanted()
    twice = {k for k, n in Counter(k for k, _, _, _ in want).items() if n > 1}
    by_id = {k: (sid, name, house) for k, sid, name, house in want if k not in twice}
    by_both = {(k, name_key(name)): (sid, name, house) for k, sid, name, house in want if k in twice}
    used, out = set(), []
    for row in db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall():
        state = json.loads(row["json"])
        changes, extra = [], []
        for s in state.get("S", []):
            k = sid_key(s.get("sid")) if s.get("sid") else ""
            hit = by_both.get((k, name_key(s.get("name")))) if k in twice else by_id.get(k)
            if not k or not hit:
                extra.append(s.get("name", "") + (f" ({s['sid']})" if s.get("sid") else ""))
                continue
            used.add((k, name_key(hit[1])))
            if s.get("house", "") != hit[2]:
                changes.append((s.get("name", ""), s.get("house", ""), hit[2]))
                s["house"] = hit[2]
        out.append((row["id"], row["revision"], state.get("name", row["id"]), state, changes, extra))
    missing = [f"{sid} {name}" for k, sid, name, _ in want if (k, name_key(name)) not in used]
    return out, missing, sorted({sid for k, sid, _, _ in want if k in twice})


def _page(**context):
    with current_app.config["DB"].transaction() as db:
        rows, missing, twice = plan(db)
    classes = [{"name": n, "changes": ch, "extra": ex} for _, _, n, _, ch, ex in rows]
    counts = dict.fromkeys(HOUSES, 0)
    for _, _, _, state, _, _ in rows:
        for s in state.get("S", []):
            if s.get("house") in counts:
                counts[s["house"]] += 1
    return auth.page("admin_houses.html", classes=classes, missing=missing, twice=twice, counts=counts,
                     total=sum(len(c["changes"]) for c in classes), **context)


@bp.get("/admin/set-houses")
@auth.admin_required
def preview():
    return _page()


@bp.post("/admin/set-houses")
@auth.admin_required
def apply():
    auth.check_form_token()
    if request.form.get("confirm", "").strip().lower() != "houses":
        return _page(error="Type HOUSES in the box to confirm.")
    t = int(time.time())
    with current_app.config["DB"].transaction() as db:
        done = 0
        for class_id, revision, _, state, changes, _ in plan(db)[0]:
            if not changes:
                continue
            current = db.execute("SELECT json FROM classrooms WHERE id = ?", (class_id,)).fetchone()["json"]
            encoded = json.dumps(state, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            # Keep the version from just before in Class history, then the new one.
            db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)",
                       (class_id, revision, current, g.user["id"], t))
            db.execute("UPDATE classrooms SET json = ?, revision = ? WHERE id = ?", (encoded, revision + 1, class_id))
            db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)",
                       (class_id, revision + 1, encoded, g.user["id"], t))
            auth.audit(db, "class.houses_set", class_id, {"students": len(changes)})
            done += len(changes)
    return _page(done=done)
