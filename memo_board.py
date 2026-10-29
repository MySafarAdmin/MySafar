"""The memorisation progress board: every student's memo record on one page, for staff and for a whiteboard.

Signed-in staff open it at /board: admins see every class, teachers their own. An admin can also make a read-only
link (/board/<token>) for a classroom whiteboard or to share, for the whole school, Primary or Secondary Years, or one
class. A link shows first names and surname initials only, and can leave out fails and tester feedback. As with TV
links, the token is stored only as a SHA-256 hash and an admin can turn a link off at any time.

Each student is marked by the weeks since their last pass, the Memo tab's rule for a late student: on track
(passed this week or last), slowing down (two weeks), needs support (three weeks or more, or no pass yet), or not
started (nothing recorded).
"""
import json
import re
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, abort, g, jsonify, request

import auth
import tv

bp = Blueprint("memo_board", __name__)
SEEN_EVERY = 300
LATE_WEEKS = 3  # keep in step with late() in src/page.html
SCOPES = {"": "Whole school", "primary": "Primary Years", "secondary": "Secondary Years"}
FIRST_ITEM = 197  # the number of the item before the first one after the book (198 An-Naba)


def target_label(n, levels, items):
    """A memo target's name as the dashboard writes it: 'L3 T5', an item after the book, or 'Quran complete'."""
    book = sum(levels)
    if n <= book:
        for level, count in enumerate(levels, 1):
            if n <= count:
                return f"L{level} T{n}"
            n -= count
    if n > book + items:
        return "Quran complete"
    return f"Item {n - book + FIRST_ITEM}"


def day_of(ms):
    return datetime.fromtimestamp(ms / 1000, auth.LONDON).date()


def monday(day):
    return day - timedelta(days=day.weekday())


def year_of(student, class_name):
    """The year group as a number (0 for Reception), from the Safar year group, the class name or the school year."""
    for text in (student.get("year", ""), class_name, student.get("sy", "")):
        if re.search(r"\breception\b", text or "", re.I):
            return 0
        match = tv.YEAR.search(text or "")
        if match:
            return int(match.group(1))
    return None


def student_row(s, state, today, fails=True):
    log, kinds = s.get("log") or [], s.get("lt") or []
    labels, failed = s.get("lx") or [], sorted(s.get("fl") or [])
    tests = [t for t in s.get("tests") or [] if t.get("k") == "m"]
    passes = max(s.get("passes") or 0, len(log))
    levels, items = state.get("L") or [], state.get("Q", 0)
    last = max(range(len(log)), key=lambda k: log[k], default=None)
    passed = day_of(log[last]) if last is not None else None
    failed_on = day_of(failed[-1]) if failed else None
    tested = max([d for d in (passed, failed_on) if d] + [datetime.strptime(t["d"], "%Y-%m-%d").date() for t in tests],
                 default=None)
    weeks = (monday(today) - monday(passed)).days // 7 if passed else None
    if not passes and not failed:
        status = "none"
    elif weeks is None or weeks >= LATE_WEEKS:
        status = "behind"
    else:
        status = "on" if weeks <= 1 else "slow"
    note = next((t for t in reversed(tests) if (t.get("fb") or "").strip()), None)
    target = s.get("target") or 1
    row = {
        "status": status, "weeks": weeks, "passes": passes,
        "level": (labels[last] if last is not None and last < len(labels) and labels[last] else
                  target_label(kinds[last], levels, items) if last is not None and last < len(kinds) else None),
        "levelDate": passed and passed.isoformat(),
        "tested": tested and tested.isoformat(),
        "target": None if target <= 1 and not log and not failed else target_label(target, levels, items),
    }
    if fails:
        row.update(fails=len(failed), rate=round(100 * passes / (passes + len(failed))) if passes + len(failed) else None,
                   failDate=failed_on and failed_on.isoformat(),
                   feedback=note and note["fb"].strip(), feedbackDate=note and note["d"], feedbackOk=note and note["ok"])
    return row


def board(rows, now=None, short=False, fails=True, scope=""):
    """Every student in these classrooms with their memo figures. short: first names and surname initials only."""
    now = now or datetime.now(auth.LONDON)
    today = now.date()
    students, classes = [], []
    for row in rows:
        state = json.loads(row["json"])
        class_name = state.get("name") or row["id"]
        label = tv.class_label(class_name)
        stages, mine = [], []
        for s in state.get("S", []):
            name = (tv.short_name if short else str.strip)(s.get("name", ""))
            if not name:
                continue
            stage = tv.school_stage(s, class_name)
            stages.append(stage)
            mine.append(dict(student_row(s, state, today, fails), name=name, cid=row["id"], house=s.get("house", ""),
                             year=year_of(s, class_name), stage=stage))
        stage = tv.class_stage(class_name, [x for x in stages if x])
        if scope in ("primary", "secondary") and stage != scope:
            continue
        for x in mine:
            x["class"] = label
            x["stage"] = x["stage"] or stage
        students += mine
        classes.append({"id": row["id"], "label": label, "stage": stage})
    classes.sort(key=lambda c: tv.natural(c["label"]))
    students.sort(key=lambda x: (x["name"].lower(), tv.natural(x["class"])))
    return {"students": students, "classes": classes, "fails": fails, "short": short, "today": today.isoformat(),
            "updated": now.strftime("%H:%M")}


def read_rows(class_ids=None):
    with auth.db().transaction() as tx:
        if class_ids is None:
            return tx.execute("SELECT id, json FROM classrooms").fetchall()
        return [r for r in tx.execute("SELECT id, json FROM classrooms").fetchall() if r["id"] in class_ids]


def page():
    return tv.ROOT.joinpath("static", "board.html").read_text(encoding="utf-8"), 200, {"Content-Type": "text/html; charset=utf-8"}


@bp.get("/board")
def staff_page():
    return page()


@bp.get("/api/board")
def staff_data():
    admin = g.user["role"] == "admin"
    mine = None
    if not admin:
        with auth.db().transaction() as tx:
            mine = {r["class_id"] for r in tx.execute("SELECT class_id FROM classroom_members WHERE user_id = ?",
                                                      (g.user["id"],)).fetchall()}
    return jsonify(dict(board(read_rows(mine)), admin=admin, mode="staff"))


def link(token):
    """The board link this token belongs to, if it is still turned on."""
    if len(token) > 100:
        return None
    t = auth.now()
    with auth.db().transaction() as tx:
        row = tx.execute("SELECT id, name, scope, fails, last_seen_at FROM board_links WHERE token_hash = ? AND revoked_at IS NULL",
                         (auth.token_hash(token),)).fetchone()
        if row and t - (row["last_seen_at"] or 0) >= SEEN_EVERY:
            tx.execute("UPDATE board_links SET last_seen_at = ? WHERE id = ?", (t, row["id"]))
    return row


@bp.get("/board/<token>")
def link_page(token):
    if not link(token):
        return auth.page("board_off.html", 404)
    return page()


@bp.get("/board/<token>/data")
def link_data(token):
    row = link(token)
    if not row:
        return jsonify(error="This board's link has been turned off."), 404
    scope = row["scope"] or ""
    rows = read_rows({scope[6:]} if scope.startswith("class:") else None)
    data = board(rows, short=True, fails=bool(row["fails"]), scope=scope if scope in SCOPES else "")
    return jsonify(dict(data, admin=False, mode="link", title=row["name"], fixedClass=scope.startswith("class:"),
                        scope=None if scope.startswith("class:") else SCOPES.get(scope, SCOPES[""])))


def scope_label(scope, labels):
    if scope.startswith("class:"):
        return labels.get(scope[6:], "A class that has since been deleted")
    return SCOPES.get(scope, "Whole school")


def links_page(status=200, **context):
    with auth.db().transaction() as tx:
        links = [dict(r) for r in tx.execute(
            "SELECT b.id, b.name, b.scope, b.fails, b.created_at, b.last_seen_at, u.name AS created_by FROM board_links b "
            "LEFT JOIN users u ON u.id = b.created_by WHERE b.revoked_at IS NULL ORDER BY b.created_at").fetchall()]
        rooms = tx.execute("SELECT id, json FROM classrooms").fetchall()
    labels = {r["id"]: tv.class_label(json.loads(r["json"]).get("name") or r["id"]) for r in rooms}
    for item in links:
        item["shows"] = scope_label(item["scope"] or "", labels)
    classes = sorted(labels.items(), key=lambda c: tv.natural(c[1]))
    return auth.page("admin_board.html", status, links=links, classes=classes, scopes=SCOPES, **context)


@bp.get("/admin/board")
@auth.admin_required
def admin_links():
    return links_page()


@bp.post("/admin/board/new")
@auth.admin_required
def admin_new_link():
    auth.check_form_token()
    name = " ".join(request.form.get("name", "").split())[:80] or "Whiteboard"
    scope = request.form.get("scope", "")
    if scope not in SCOPES:
        if not scope.startswith("class:"):
            return links_page(400, error="Choose which students the board shows.")
        with auth.db().transaction() as tx:
            if not tx.execute("SELECT 1 FROM classrooms WHERE id = ?", (scope[6:],)).fetchone():
                return links_page(400, error="That class no longer exists. Choose another.")
    fails = 1 if request.form.get("fails") else 0
    token = secrets.token_urlsafe(32)
    with auth.db().transaction() as tx:
        link_id = tx.insert("INSERT INTO board_links (name, token_hash, scope, fails, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                            (name, auth.token_hash(token), scope, fails, g.user["id"], auth.now()))
        auth.audit(tx, "board.created", detail={"link": link_id, "name": name, "scope": scope, "fails": fails})
    return links_page(notice=f"Link made for {name}.", link=auth.public_url("/board/" + token), link_for=name)


@bp.post("/admin/board/<int:link_id>/off")
@auth.admin_required
def admin_link_off(link_id):
    auth.check_form_token()
    with auth.db().transaction() as tx:
        row = tx.execute("SELECT name FROM board_links WHERE id = ? AND revoked_at IS NULL", (link_id,)).fetchone()
        if not row:
            abort(404)
        tx.execute("UPDATE board_links SET revoked_at = ? WHERE id = ?", (auth.now(), link_id))
        auth.audit(tx, "board.revoked", detail={"link": link_id, "name": row["name"]})
    return links_page(notice=f"Turned off the link for {row['name']}. It stops showing the board within two minutes.")
