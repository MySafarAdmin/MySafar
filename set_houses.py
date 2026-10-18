"""One-off: give every student the house worked out for them in October 2026.

data/houses.csv lists each student's name, their Quran and Memorisation class and their house. Siblings
share a house, and each class is split between the three houses as evenly as possible.

An admin opens /admin/set-houses to see, class by class, whose house would change and which names on
either side don't match; nothing changes until they confirm. Students are matched by name within their
class, ignoring spaces and punctuation and allowing a longer surname initial, so anyone on the dashboard but not in the file keeps the house they have. The version of each
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
    """{class key: {student key: (name, house)}} from the file, and {class key: class name}."""
    out, names = {}, {}
    with FILE.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            house = row["House"].strip()
            assert house in HOUSES, house
            name = " ".join(row["Student Name"].split())
            cls = " ".join(row["Current Teacher [Quran and Memorisation]"].split())
            names[_key(cls)] = cls
            out.setdefault(_key(cls), {})[_key(name)] = (name, house)
    return out, names


def _words(text):
    return re.findall(r"[a-z0-9]+", str(text or "").lower())


def pair(students, listed):
    """{student index: list key}. The same name first; then a student whose first name is in the listed name and
    whose surname starts the same way ("Aadam Za" is "Aadam Z", "Musa Un" is "Md Musa U"), when only one fits."""
    hits, used = {}, set()
    for i, s in enumerate(students):
        k = _key(s.get("name"))
        if k in listed and k not in used:
            hits[i] = k
            used.add(k)
    for i, s in enumerate(students):
        w = _words(s.get("name"))
        if i in hits or len(w) < 2:
            continue
        fits = [k for k, (n, _) in listed.items() if k not in used and w[0] in _words(n)[:-1]
                and (w[-1].startswith(_words(n)[-1]) or _words(n)[-1].startswith(w[-1]))]
        if len(fits) == 1:
            hits[i] = fits[0]
            used.add(fits[0])
    return hits


def plan(db):
    """[(class_id, revision, name, new state, changes [(student, old, new)], not on the dashboard, not in the file)]
    for every class, plus the file's classes that match no class on the dashboard. A class is found by its name,
    or else by which class on the list holds most of its students."""
    (want, names), out, seen = wanted(), [], set()
    rows = [(r["id"], r["revision"], json.loads(r["json"])) for r in
            db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall()]
    chosen = {}
    for class_id, _, state in rows:
        if _key(state.get("name", class_id)) in want:
            chosen[class_id] = _key(state.get("name", class_id))
    for class_id, _, state in rows:
        students = state.get("S", [])
        if class_id in chosen or not students:
            continue
        best = max(((len(pair(students, v)), c) for c, v in want.items() if c not in chosen.values()), default=(0, None))
        if best[0] * 2 >= len(students):
            chosen[class_id] = best[1]
    for class_id, revision, state in rows:
        if class_id not in chosen:
            continue
        listed = want[chosen[class_id]]
        seen.add(chosen[class_id])
        students = state.get("S", [])
        hits = pair(students, listed)
        changes, extra = [], []
        for i, s in enumerate(students):
            if i not in hits:
                extra.append(s.get("name", ""))
                continue
            house = listed[hits[i]][1]
            if s.get("house", "") != house:
                changes.append((s.get("name", ""), s.get("house", ""), house))
                s["house"] = house
        missing = [n for k, (n, _) in listed.items() if k not in hits.values()]
        out.append((class_id, revision, state.get("name", class_id), state, changes, missing, extra))
    unmatched = sorted(names[c] for c in want if c not in seen)
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
    return auth.page("admin_houses.html", classes=classes, missing=sum(len(c["missing"]) for c in classes), unmatched=unmatched, counts=counts,
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
