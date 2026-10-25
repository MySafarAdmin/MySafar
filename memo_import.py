"""One-off admin page: add the school's sheet of memorisation passes (data/memo_passes.csv) to the students.

The sheet has a Date (dd/mm/yyyy hh:mm:ss, London time), a Name (the MySafar name) and a Target, written as the
Record page's "Item number and Surah" list writes it: "L1 Target 1", "212. Surah Al-Mulk" or "Fail". Each pass is
added as the Memo profile's "Add pass" adds one: a dated pass in s.log, s.lt and s.lx, with no token or house points.
The target becomes the one after the latest book target passed on the sheet (a few students go back in the book on
it), but never goes back from the target the student already has on the site. A surah pass keeps its label in s.lx
and leaves the target where it is, as on the Record page; a few surahs written by hand on the sheet are read as the
nearest item on the list (WRITTEN). A Fail is added to s.fl.

A pass the student already has for the same target, on the site or higher up the sheet, is left out, so the page
can be used again without adding anything twice. An admin opens /admin/import-memo-passes to see which rows match,
which don't and which need a choice (a name two students share); nothing changes until they type IMPORT. The version
of each class from just before is kept in Class history. Remove this file and the CSV once it has been used.
"""
import csv
import json
import re
import time
from datetime import datetime
from pathlib import Path

from flask import Blueprint, current_app, g, request

import auth
from set_houses import name_key

FILE = Path(__file__).with_name("data") / "memo_passes.csv"
SURAHS = ("197. Surah An-Naba'", "198. Surah An-Nazi'aat", "199. Surah Abasa", "200. Surah At-Takwir",
          "201. Surah Al-Infitaar", "202. Surah Al-Mutaffifin", "203. Surah Al-Inshiqaq", "204. Surah Al-Burooj",
          "205. Surah At-Tariq", "206. Surah Al-A'la", "207. Surah Al-Ghaashiyah", "208. Surah Al-Fajr",
          "209. Surah Al-Balad", "210. Surah Ash-Shams", "211. Surah Al-Lail", "212. Surah Al-Mulk",
          "213. Surah-Al Qalam", "214. Surah Al-Haaqqa", "215. Al-Maarij", "216. Surah Nooh", "217. Surah Al-Jinn",
          "218. Surah Al-Muzzammil", "219. Surah Al-Muddaththir", "220. Surah Al-Qiyama", "221. Surah Al-Insan",
          "222. Surah Al-Mursalat", "223. Last 10 verses of Surah Kahf", "224. Surah Ya-Sin", "225. Dahhar v1-12",
          "226. Surah Dahhar v13-22", "228. Surah Mursalaat 1-23", "229. Surah Mursalaat 24-40",
          "230. Surah Mursalaat 41-50")  # keep in step with SUR in src/page.html
# Surahs written by hand on the sheet, and the label each pass gets.
WRITTEN = {"surah qalam page 1": "213. Surah-Al Qalam, page 1", "qalam page 2": "213. Surah-Al Qalam, page 2",
           "surah haque - page 1": "214. Surah Al-Haaqqa, page 1", "haaqah 2nd half": "214. Surah Al-Haaqqa, 2nd half"}
BOOK_TARGET = re.compile(r"L(\d+)\s*Target\s*(\d+)", re.I)

bp = Blueprint("memo_import", __name__)


def rows():
    """The sheet's rows: {n: row number on the sheet, t: time in ms, day, name, target}."""
    out = []
    with FILE.open(newline="", encoding="utf-8-sig") as f:
        for n, row in enumerate(csv.DictReader(f), start=2):
            when = datetime.strptime(row["Date"].strip(), "%d/%m/%Y %H:%M:%S").replace(tzinfo=auth.LONDON)
            out.append({"n": n, "t": int(when.timestamp() * 1000), "day": when.strftime("%d %b %Y"),
                        "name": " ".join(row["Name"].split()), "target": " ".join(row["Target"].split())})
    return out


def read_target(text, levels):
    """("book", target number) | ("surah", label) | ("fail", None) | (None, why it can't be read)."""
    if text.lower() == "fail":
        return "fail", None
    m = BOOK_TARGET.fullmatch(text)
    if m:
        level, target = int(m.group(1)), int(m.group(2))
        if not 1 <= level <= len(levels) or not 1 <= target <= levels[level - 1]:
            return None, "not on the class's list of targets"
        return "book", sum(levels[:level - 1]) + target
    if text in SURAHS:
        return "surah", text
    if text.lower() in WRITTEN:
        return "surah", WRITTEN[text.lower()]
    return None, "not an item on the school's list"


def plan(db, picks=None):
    """([(class_id, revision, class name, new state, rows added)], report rows, choices for shared names).

    Each report row is the sheet row with "status" (add, fail, have, repeat, missing, choose, bad), "cls", "label"
    and "note". picks maps a shared name's key to the chosen "class_id|place in the class"."""
    picks = picks or {}
    classes, found = [], {}
    for row in db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall():
        state = json.loads(row["json"])
        classes.append([row["id"], row["revision"], state.get("name", row["id"]), state, 0])
        for j, s in enumerate(state.get("S", [])):
            for name in {s.get("name", "")} | set(s.get("xn", [])):
                found.setdefault(name_key(name), []).append((len(classes) - 1, j))
    for key in found:
        found[key] = list(dict.fromkeys(found[key]))
    report, choices, top, latest = [], {}, {}, {}
    for r in rows():
        key = name_key(r["name"])
        who = found.get(key, [])
        if len(who) > 1:
            choices[key] = {"name": r["name"], "options": [(f"{classes[c][0]}|{j}", classes[c][3]["S"][j].get("name", "") + " in "
                                                            + classes[c][2] + (f" ({classes[c][3]['S'][j]['sid']})" if classes[c][3]["S"][j].get("sid") else ""))
                                                           for c, j in who], "pick": picks.get(key, "")}
            who = [(c, j) for c, j in who if f"{classes[c][0]}|{j}" == picks.get(key)]
        r.update(status="add", cls="", label=r["target"], note="")
        report.append(r)
        if not who:
            r["status"] = "choose" if key in choices else "missing"
            continue
        c, j = who[0]
        cls, s = classes[c], classes[c][3]["S"][who[0][1]]
        r["cls"] = cls[2]
        kind, value = read_target(r["target"], cls[3].get("L") or [])
        if kind is None:
            r.update(status="bad", note=value)
            continue
        if kind == "fail":
            if any(abs(t - r["t"]) < 1000 for t in s.setdefault("fl", [])):
                r["status"] = "have"
                continue
            s["fl"] = sorted(s["fl"] + [r["t"]])
            r["status"] = "fail"
            cls[4] += 1
            continue
        lt, lx = (value, "") if kind == "book" else (s.get("target", 1), value)
        r["label"] = value if kind == "surah" else r["target"]
        if r["label"] != r["target"]:
            r["note"] = f"Written as \"{r['target']}\" on the sheet"
        same = [k for k in range(len(s.get("log", []))) if (s["lx"][k] == lx if lx else not s["lx"][k] and s["lt"][k] == lt)]
        if same:
            r["status"] = "repeat" if any(s["log"][k] in top.get((c, j), ()) for k in same) else "have"
            continue
        if kind == "book" and lt < max([s["lt"][k] for k in range(len(s["log"])) if not s["lx"][k]] or [0]):
            r["note"] = "Earlier in the book than a target they had already passed"
        merged = sorted(zip(s["log"] + [r["t"]], s["lt"] + [lt], s["lx"] + [lx]), key=lambda x: (x[0], x[1]))
        s["log"], s["lt"], s["lx"] = (list(x) for x in zip(*merged))
        s["passes"] = s.get("passes", 0) + 1
        s["hit"] = s["log"][-1]
        top.setdefault((c, j), set()).add(r["t"])
        if kind == "book" and r["t"] >= latest.setdefault((c, j), [0, s.get("target", 1)])[0]:
            # The one after the latest book target passed on the sheet, but never back from the target they had on the site.
            latest[(c, j)][0] = r["t"]
            s["target"] = max(latest[(c, j)][1], min(lt + 1, sum(cls[3]["L"]) + cls[3].get("Q", 0) + 1))
        cls[4] += 1
    return [tuple(c) for c in classes if c[4]], report, list(choices.items())


ORDER = ("missing", "choose", "bad", "repeat", "have", "fail", "add")


def _page(picks=None, **context):
    with current_app.config["DB"].transaction() as db:
        changed, report, choices = plan(db, picks)
    counts = {k: sum(1 for r in report if r["status"] == k) for k in ORDER}
    problems = [r for r in report if r["status"] in ("missing", "choose", "bad")]
    skipped = [r for r in report if r["status"] in ("repeat", "have")]
    noted = [r for r in report if r["status"] in ("add", "fail") and r["note"]]
    adding = [r for r in report if r["status"] in ("add", "fail")]
    return auth.page("admin_memo_import.html", counts=counts, total=len(report), problems=problems, skipped=skipped,
                     noted=noted, adding=adding, choices=choices, students=len({(r["cls"], r["name"]) for r in adding}),
                     **context)


def _picks():
    return {k[5:]: v for k, v in request.form.items() if k.startswith("pick-") and v}


@bp.get("/admin/import-memo-passes")
@auth.admin_required
def preview():
    return _page()


@bp.post("/admin/import-memo-passes")
@auth.admin_required
def apply():
    auth.check_form_token()
    picks = _picks()
    if request.form.get("confirm", "").strip().lower() != "import":
        return _page(picks, error="Type IMPORT in the box to confirm.")
    t = int(time.time())
    done = 0
    with current_app.config["DB"].transaction() as db:
        for class_id, revision, _, state, added in plan(db, picks)[0]:
            current = db.execute("SELECT json FROM classrooms WHERE id = ?", (class_id,)).fetchone()["json"]
            encoded = json.dumps(state, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            # Keep the version from just before in Class history, then the one with the passes.
            db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)",
                       (class_id, revision, current, g.user["id"], t))
            db.execute("UPDATE classrooms SET json = ?, revision = ? WHERE id = ?", (encoded, revision + 1, class_id))
            db.execute("INSERT INTO classroom_history (class_id, revision, json, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)",
                       (class_id, revision + 1, encoded, g.user["id"], t))
            auth.audit(db, "class.memo_passes_imported", class_id, {"rows": added})
            done += added
    return _page(picks, done=done)
