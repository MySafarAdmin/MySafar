"""One-off: clear every star of the week and every memorisation pass.

Removes each student's memo passes (with the pass count), the memo level tests
that recorded a pass on the Record page, and every star of the week. Targets,
memo fails, Quran scores and Qaidah tests, merits, warnings and house tokens
(including the blue tokens those tests gave) stay, as do students and classes.

An admin opens /admin/clear-test-data to see exactly what would go and download a
backup of every class first; nothing changes until they confirm. The version of
each class from just before the clear is kept in Class history, so it can be
restored from there. Remove this file once it has been used.
"""
import json
import time

from flask import Blueprint, Response, current_app, g, request

import auth

KINDS = (("passes", "Memo passes"), ("tests", "Memo level test passes"), ("stars", "Stars of the week"))
WHAT = "every memo pass and every star of the week"

bp = Blueprint("cleanup", __name__)


def clear_student(s):
    """Removes this student's memo passes and stars of the week, in place. Returns how many of each were removed."""
    n = {"passes": max(s.get("passes", 0), len(s.get("log", []))), "stars": len(s.get("sw", []))}
    s.update(passes=0, log=[], lt=[], lx=[], hit=None, sw=[])
    tests = s.get("tests", [])
    s["tests"] = [t for t in tests if not (t["k"] == "m" and t["ok"])]
    n["tests"] = len(tests) - len(s["tests"])
    return n


def plan(db):
    """What clearing would change: [(class_id, revision, name, cleared state, counts per kind)]."""
    out = []
    for row in db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall():
        state = json.loads(row["json"])
        counts = dict.fromkeys((k for k, _ in KINDS), 0)
        for s in state.get("S", []):
            for k, v in clear_student(s).items():
                counts[k] += v
        out.append((row["id"], row["revision"], state.get("name", row["id"]), state, counts))
    return out


def _page(**context):
    with current_app.config["DB"].transaction() as db:
        rows = plan(db)
    classes = [{"name": name, "counts": counts} for _, _, name, _, counts in rows if any(counts.values())]
    totals = {k: sum(c["counts"][k] for c in classes) for k, _ in KINDS}
    return auth.page("admin_clear.html", kinds=KINDS, classes=classes, totals=totals,
                     what=WHAT, **context)


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
            auth.audit(db, "class.memo_passes_and_stars_cleared", class_id, counts)
            cleared += 1
    return _page(done=cleared)
