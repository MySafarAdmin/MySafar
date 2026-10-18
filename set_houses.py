"""One-off: give every student the house worked out for them in October 2026.

data/houses.csv lists each student's name, their Quran and Memorisation class and their house. Siblings
share a house, and each class is split between the three houses as evenly as possible.

An admin opens /admin/set-houses to see, class by class, whose house would change and which names on
either side don't match; nothing changes until they confirm. Students are matched by name within their
class, ignoring spaces and punctuation, so anyone on the dashboard but not in the file keeps the house they have. The version of each
class from just before is kept in Class history, so it can be restored from there. Remove this file
once it has been used.
"""
import csv
import json
import re
import time
from pathlib import Path

from flask import Blueprint, current_app, g, request

import auth

FILE = Path(__file__).with_name("data") / "houses.csv"
HOUSES = ("Makkah", "Al-Aqsa", "Madinah")

bp = Blueprint("set_houses", __name__)


def _key(text):
    # Letters and digits only, so "Yr4-A-QM- Sr Thanisha" matches "Yr4-A-QM-Sr Thanisha".
    return re.sub(r"[^a-z0-9]", "", str(text or "").lower())


def wanted():
    """{class key: {student key: (name, house)}} from the file."""
    out = {}
    with FILE.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            house = row["House"].strip()
            assert house in HOUSES, house
            name = " ".join(row["Student Name"].split())
            out.setdefault(_key(row["Current Teacher [Quran and Memorisation]"]), {})[_key(name)] = (name, house)
    return out


def plan(db):
    """[(class_id, revision, name, new state, changes [(student, old, new)], not on the dashboard, not in the file)]
    for every class, plus the file's classes that match no class on the dashboard."""
    want, out, seen = wanted(), [], set()
    for row in db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall():
        state = json.loads(row["json"])
        name = state.get("name", row["id"])
        listed = want.get(_key(name))
        if listed is None:
            continue
        seen.add(_key(name))
        changes, found, extra = [], set(), []
        for s in state.get("S", []):
            hit = listed.get(_key(s.get("name")))
            if not hit:
                extra.append(s.get("name", ""))
                continue
            found.add(_key(s.get("name")))
            if s.get("house", "") != hit[1]:
                changes.append((s.get("name", ""), s.get("house", ""), hit[1]))
                s["house"] = hit[1]
        missing = [n for k, (n, _) in listed.items() if k not in found]
        out.append((row["id"], row["revision"], name, state, changes, missing, extra))
    unmatched = sorted({c for c in want if c not in seen})
    return out, unmatched


def _page(**context):
    with current_app.config["DB"].transaction() as db:
        rows, unmatched = plan(db)
    classes = [{"name": n, "changes": ch, "missing": mi, "extra": ex} for _, _, n, _, ch, mi, ex in rows]
    counts = {h: 0 for h in HOUSES}
    for _, _, _, state, _, _, _ in rows:
        for s in state.get("S", []):
            if s.get("house") in counts:
                counts[s["house"]] += 1
    return auth.page("admin_houses.html", classes=classes, unmatched=unmatched, counts=counts,
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
        for class_id, revision, _, state, changes, _, _ in plan(db)[0]:
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
