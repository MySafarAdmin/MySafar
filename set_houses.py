"""One-off: give every student the Student ID, Family ID and house on the school's list (data/houses.csv).

Students are matched by their MySafar name (see plan). Adam Or is on the list twice, in Yr3-A and Yr3-B.

An admin opens /admin/set-houses to see, class by class, how many houses, Family IDs and Student IDs would
change, which students on the dashboard aren't on the list and who on the list isn't on the dashboard;
nothing changes until they confirm. Anyone not on the list keeps their details. The version of each class from just before is kept in
Class history, so it can be restored from there. Remove this file once it has been used.
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


def sid_key(sid):
    """SE0264 and se264 are the same ID."""
    m = re.fullmatch(r"\s*([A-Za-z]*)\s*0*(\d+)\s*", str(sid or ""))
    return (m.group(1).upper() + m.group(2)) if m else str(sid or "").strip().upper()


def name_key(name):
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def wanted():
    """Rows of the file: {sid, name, fid, house}."""
    out = []
    with FILE.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            house = row["House"].strip()
            assert house in HOUSES, house
            out.append({"sid": (row.get("MySafar ID") or row.get("Student ID") or "").strip(),
                        "name": " ".join(row["MySafar Name"].split()), "cls": name_key(row.get("QM")),
                        "fid": row["Family ID"].strip(), "house": house})
    return out


def _set(s, field, value, changes, j):
    """Sets a detail as a change on the student's profile would: remembered in s.ed so a CSV upload leaves it,
    and a replaced Student ID kept in s.xid so the upload still finds the student."""
    old = s.get(field, "")
    if field == "sid" and sid_key(old) == sid_key(value) or field != "sid" and old == value:
        return
    if field == "sid" and old:
        s["xid"] = [x for x in s.get("xid", []) if sid_key(x) != sid_key(old)][-9:] + [old]
    s[field] = value
    s["ed"] = [x for x in s.get("ed", []) if x != field] + [field]
    changes.append((j, field, old, value))


def plan(db):
    """([(class_id, revision, class name, new state, changes [(student's place in the class, field, old, new)], not on the list)],
    students on the list that match nobody on the dashboard, names listed more than once).

    Students are matched by name, so a Student ID that differs from the list shows up as a change rather than
    giving the student someone else's details. A name listed twice is told apart by class, or else by
    Student ID. Each student then gets the list's Student ID, Family ID and house."""
    want = wanted()
    by_name = {}
    for i, r in enumerate(want):
        by_name.setdefault(name_key(r["name"]), []).append(i)
    used, out = set(), []
    for row in db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall():
        state = json.loads(row["json"])
        changes, extra = [], []
        for j, s in enumerate(state.get("S", [])):
            n = name_key(s.get("name"))
            fits = [i for i in by_name.get(n, []) if i not in used]
            if len(fits) > 1:
                # The same name in two classes: told apart by class, or else by Student ID.
                fits = [i for i in fits if want[i]["cls"] == name_key(state.get("name"))] or \
                    [i for i in fits if sid_key(want[i]["sid"]) == sid_key(s.get("sid"))]
            if len(fits) != 1:
                extra.append(s.get("name", "") + (f" ({s['sid']})" if s.get("sid") else ""))
                continue
            r = want[fits[0]]
            used.add(fits[0])
            for field in ("sid", "fid", "house"):
                if r[field]:
                    _set(s, field, r[field], changes, j)
        out.append((row["id"], row["revision"], state.get("name", row["id"]), state, changes, extra))
    missing = [f"{r['sid']} {r['name']}" for i, r in enumerate(want) if i not in used]
    return out, missing, sorted({want[v[0]]["name"] for v in by_name.values() if len(v) > 1})


def _page(**context):
    with current_app.config["DB"].transaction() as db:
        rows, missing, twice = plan(db)
    ids = [f"{state['S'][j].get('name', '')}: {old or 'none'} to {new}" for _, _, _, state, ch, _ in rows
           for j, field, old, new in ch if field == "sid"]
    classes = [{"name": n, "extra": ex, **{f: sum(1 for c in ch if c[1] == f) for f in ("house", "fid", "sid")}}
               for _, _, n, _, ch, ex in rows]
    counts = dict.fromkeys(HOUSES, 0)
    for _, _, _, state, _, _ in rows:
        for s in state.get("S", []):
            if s.get("house") in counts:
                counts[s["house"]] += 1
    return auth.page("admin_houses.html", ids=ids, classes=classes, missing=missing, twice=twice, counts=counts,
                     total=sum(len(ch) for _, _, _, _, ch, _ in rows), **context)


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
            done += len({c[0] for c in changes})
    return _page(done=done)
