"""One-off: clear the records entered while the dashboard was being tested.

Everything recorded from Monday 12 October 2026 (London time) onwards is test data:
Quran scores, memo passes and fails, level tests and their blue tokens, merits,
house tokens and stars of the week. Students, classes, accounts and TV screens stay.

Warnings (and missed breaks) carry no date, so each student gets back the warning
they had in the class's last saved version from before Monday, or none.

An admin opens /admin/clear-test-data to see exactly what would go and download a
backup of every class first; nothing changes until they confirm. The version of
each class from just before the clear is kept in Class history, so it can be
restored from there. Remove this file once it has been used.
"""
import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from flask import Blueprint, Response, current_app, g, request

import auth

CUTOFF = datetime(2026, 10, 12, tzinfo=ZoneInfo("Europe/London"))
CUTOFF_DAY = CUTOFF.date().isoformat()
CUTOFF_MS = int(CUTOFF.timestamp() * 1000)
TOKENS = ("tg", "tb", "tr")
KINDS = (("q", "Quran scores"), ("passes", "Memo passes"), ("fails", "Memo fails"), ("tests", "Level tests"),
         ("merits", "Merits"), ("tokens", "House tokens"), ("stars", "Stars of the week"),
         ("warnings", "Warnings and missed breaks"))

bp = Blueprint("cleanup", __name__)


def _key(student):
    return ("sid", student["sid"]) if student.get("sid") else ("name", student.get("name", "").strip().lower())


def clear_student(s, before):
    """Removes this student's records from CUTOFF onwards, in place. `before` is their record from the class's
    last version saved before CUTOFF, or None. Returns how many of each kind were removed."""
    n = dict.fromkeys((k for k, _ in KINDS), 0)
    new = [k for k, t in enumerate(s.get("log", [])) if t >= CUTOFF_MS]
    if new:
        n["passes"] = len(new)
        # The target the student was working on when they first passed after the cutoff.
        if not s["lx"][new[0]]:
            s["target"] = s["lt"][new[0]]
        keep = [k for k in range(len(s["log"])) if k not in new]
        for f in ("log", "lt", "lx"):
            s[f] = [s[f][k] for k in keep]
        s["passes"] = max(0, s["passes"] - len(new))
    s["hit"] = s["log"][-1] if s.get("log") else None
    fails = s.get("fl", [])
    s["fl"] = [t for t in fails if t < CUTOFF_MS]
    n["fails"] = len(fails) - len(s["fl"])
    merits = s.get("ml", [])
    s["ml"] = [t for t in merits if t < CUTOFF_MS]
    n["merits"] = len(merits) - len(s["ml"])
    s["merits"] = max(0, s["merits"] - n["merits"])
    for k in TOKENS:
        times = s.get(k, [])
        s[k] = [t for t in times if t < CUTOFF_MS]
        n["tokens"] += len(times) - len(s[k])
    scores = s.get("q", {})
    s["q"] = {d: v for d, v in scores.items() if d < CUTOFF_DAY}
    n["q"] = len(scores) - len(s["q"])
    tests = s.get("tests", [])
    gone = [t for t in tests if t["d"] >= CUTOFF_DAY]
    s["tests"] = [t for t in tests if t["d"] < CUTOFF_DAY]
    n["tests"] = len(gone)
    first_q = next((t for t in gone if t["k"] == "q" and t["ok"]), None)
    if first_q:
        s["qa"] = first_q.get("pq", 0)
    if before and (new or n["fails"] or any(t["k"] == "m" for t in gone)):
        # Back to the target they had before the cutoff.
        s["target"] = before["target"]
    stars = s.get("sw", [])
    s["sw"] = [d for d in stars if d < CUTOFF_DAY]
    n["stars"] = len(stars) - len(s["sw"])
    warn = before.get("warn", 0) if before else 0
    if s.get("warn", 0) != warn:
        n["warnings"] = 1
        s["warn"] = warn
    return n


def plan(db):
    """What clearing would change: [(class_id, revision, name, cleared state, counts per kind)]."""
    out = []
    for row in db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall():
        state = json.loads(row["json"])
        old = db.execute("SELECT json FROM classroom_history WHERE class_id = ? AND saved_at < ? AND json IS NOT NULL "
                         "ORDER BY saved_at DESC, id DESC LIMIT 1", (row["id"], int(CUTOFF.timestamp()))).fetchone()
        before = {_key(s): s for s in json.loads(old["json"]).get("S", [])} if old else {}
        counts = dict.fromkeys((k for k, _ in KINDS), 0)
        for s in state.get("S", []):
            for k, v in clear_student(s, before.get(_key(s))).items():
                counts[k] += v
        out.append((row["id"], row["revision"], state.get("name", row["id"]), state, counts))
    return out


def _page(**context):
    with current_app.config["DB"].transaction() as db:
        rows = plan(db)
    classes = [{"name": name, "counts": counts} for _, _, name, _, counts in rows if any(counts.values())]
    totals = {k: sum(c["counts"][k] for c in classes) for k, _ in KINDS}
    return auth.page("admin_clear.html", kinds=KINDS, classes=classes, totals=totals,
                     cutoff=CUTOFF.strftime("%A %-d %B %Y"), **context)


@bp.get("/admin/clear-test-data")
@auth.admin_required
def preview():
    return _page()


@bp.get("/admin/clear-test-data/backup.json")
@auth.admin_required
def backup():
    with current_app.config["DB"].transaction() as db:
        rows = db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall()
    body = json.dumps({"saved_at": int(time.time()),
                       "classrooms": {r["id"]: {"revision": r["revision"], "state": json.loads(r["json"])} for r in rows}},
                      ensure_ascii=False, indent=1)
    stamp = time.strftime("%Y-%m-%d-%H%M", time.gmtime())
    return Response(body, mimetype="application/json",
                    headers={"Content-Disposition": f'attachment; filename="mysafar-backup-{stamp}.json"'})


@bp.post("/admin/clear-test-data")
@auth.admin_required
def clear():
    auth.check_form_token()
    if request.form.get("confirm", "").strip().lower() != "clear":
        return _page(error="Type CLEAR in the box to confirm.")
    t = int(time.time())
    with current_app.config["DB"].transaction() as db:
        cleared = 0
        for class_id, revision, _, state, counts in plan(db):
            if not any(counts.values()):
                continue
            current = db.execute("SELECT json FROM classrooms WHERE id = ?", (class_id,)).fetchone()["json"]
            encoded = json.dumps(state, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            # Keep the version from just before the clear in Class history, then the cleared one.
            db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)",
                       (class_id, revision, current, g.user["id"], t))
            db.execute("UPDATE classrooms SET json = ?, revision = ? WHERE id = ?", (encoded, revision + 1, class_id))
            db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)",
                       (class_id, revision + 1, encoded, g.user["id"], t))
            auth.audit(db, "class.test_data_cleared", class_id, counts)
            cleared += 1
    return _page(done=cleared)
