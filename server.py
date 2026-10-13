"""Authenticated Railway host with shared class records.

Records are kept in PostgreSQL when DATABASE_URL is set (on Railway, a reference
to the PostgreSQL service's DATABASE_URL). Without it they are kept in a SQLite
file in DATA_DIR, which is meant for running locally.

Each classroom is one row of the `classrooms` table. Classrooms are created from
the dashboard (CSV upload), so a new database starts empty. A `classes` table
left by the earlier version, which shipped with fixed classes, is deleted at
startup.
"""
import hmac
import json
import os
import re
import sqlite3
import time
from contextlib import contextmanager
from datetime import date
from pathlib import Path

import psycopg
from flask import Flask, Response, abort, jsonify, request
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parent
DB_ERRORS = (sqlite3.Error, psycopg.Error)
CLASS_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
MAX_CLASSES = 500


def valid_state(state):
    """Validate the structure consumed by the dashboard before replacing a class."""
    if not isinstance(state, dict):
        return False
    if not isinstance(state.get("name"), str) or not state["name"].strip():
        return False
    try:
        date.fromisoformat(state["fcd"])
    except (KeyError, TypeError, ValueError):
        return False
    levels = state.get("L")
    if not isinstance(levels, list) or not levels or not all(type(n) is int and n > 0 for n in levels):
        return False
    # Numbered Juz items that follow the book (198 An-Naba onwards). Older records have none.
    juz_items = state.get("Q", 0)
    if type(juz_items) is not int or juz_items < 0:
        return False
    students = state.get("S")
    if not isinstance(students, list):
        return False
    for student in students:
        if not isinstance(student, dict) or not isinstance(student.get("name"), str):
            return False
        if not all(type(student.get(k)) is int and student[k] >= 0 for k in ("target", "passes", "merits", "warn")):
            return False
        if not 1 <= student["target"] <= sum(levels) + juz_items + 1 or student["warn"] > 3:
            return False
        for key in ("log", "lt", "ml"):
            if not isinstance(student.get(key), list) or not all(type(n) in (int, float) and n >= 0 for n in student[key]):
                return False
        # Fails are dated like passes but never change the target or the pass count.
        fails = student.get("fl", [])
        if not isinstance(fails, list) or not all(type(n) in (int, float) and n >= 0 for n in fails):
            return False
        if not isinstance(student.get("lx"), list) or not all(isinstance(x, str) for x in student["lx"]):
            return False
        # Details from the CSV upload: Student ID, gender, Safar year group, school year group,
        # Islamic Studies teacher.
        if not all(isinstance(student.get(k, ""), str) for k in ("sid", "gender", "year", "sy", "ist")):
            return False
        if len(student["log"]) != len(student["lt"]) or len(student["log"]) != len(student["lx"]):
            return False
        # The Quran tab scores out of 5, starting at 0.
        if not isinstance(student.get("q"), dict) or not all(type(v) is int and 0 <= v <= 5 for v in student["q"].values()):
            return False
    return True


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        DATABASE_URL=os.environ.get("DATABASE_URL", ""),
        DATA_DIR=os.environ.get("DATA_DIR", str(ROOT / ".local-data")),
        DASHBOARD_USERNAME=os.environ.get("DASHBOARD_USERNAME", ""),
        DASHBOARD_PASSWORD=os.environ.get("DASHBOARD_PASSWORD", ""),
    )
    if test_config:
        app.config.update(test_config)
    username = app.config["DASHBOARD_USERNAME"]
    password = app.config["DASHBOARD_PASSWORD"]
    if not username or not password or password == "replace-with-a-long-unique-password":
        raise RuntimeError("Set DASHBOARD_USERNAME and a unique DASHBOARD_PASSWORD before starting.")
    if ":" in username:
        raise RuntimeError("DASHBOARD_USERNAME must not contain a colon.")
    database_url = app.config["DATABASE_URL"].strip()

    if database_url:
        def connect():
            return psycopg.connect(database_url, connect_timeout=10, row_factory=dict_row)

        def sql(query):
            return query.replace("?", "%s")
    else:
        data_dir = Path(app.config["DATA_DIR"]).resolve()
        # Fail rather than silently save student records on Railway's temporary disk.
        if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not app.config.get("TESTING"):
            mount = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")
            if not mount or (Path(mount).resolve() != data_dir and Path(mount).resolve() not in data_dir.parents):
                raise RuntimeError("Set DATABASE_URL to your PostgreSQL service's DATABASE_URL "
                                   "(or attach a Railway volume at DATA_DIR).")
        data_dir.mkdir(parents=True, exist_ok=True)
        database = data_dir / "dashboard.sqlite3"

        def connect():
            db = sqlite3.connect(database, timeout=10)
            db.row_factory = sqlite3.Row
            return db

        def sql(query):
            return query

    @contextmanager
    def transaction():
        db = connect()
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def initialise():
        with transaction() as db:
            if not database_url:
                db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY, json TEXT NOT NULL, revision INTEGER NOT NULL)")
            if database_url:
                old = db.execute("SELECT to_regclass('classes') AS t").fetchone()["t"]
            else:
                old = db.execute("SELECT name AS t FROM sqlite_master WHERE type = 'table' AND name = 'classes'").fetchone()
            if old:
                db.execute("DROP TABLE classes")
                print("Deleted the classes table left by the earlier version of the dashboard.", flush=True)

    # The database service can still be starting when the app boots.
    for attempt in range(10):
        try:
            initialise()
            break
        except psycopg.OperationalError:
            if attempt == 9:
                raise
            time.sleep(3)

    @app.before_request
    def require_login():
        if request.path == "/healthz" and request.method in ("GET", "HEAD"):
            return None
        auth = request.authorization
        if not (auth and auth.type == "basic"
                and hmac.compare_digest((auth.username or "").encode(), username.encode())
                and hmac.compare_digest((auth.password or "").encode(), password.encode())):
            return Response("Sign in to the Safar dashboard.", 401,
                            {"WWW-Authenticate": 'Basic realm="Safar Dashboard", charset="UTF-8"'})
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            # JSON plus this custom header require a CORS preflight cross-origin.
            # No CORS access is granted by this server.
            if not request.is_json or request.headers.get("X-Dashboard-Request") != "1":
                abort(403)
            if request.headers.get("Sec-Fetch-Site") == "cross-site":
                abort(403)

    @app.after_request
    def private_responses(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        return response

    @app.get("/healthz")
    def health():
        try:
            with transaction() as db:
                db.execute("SELECT COUNT(*) FROM classrooms").fetchone()
            return jsonify(status="ok")
        except DB_ERRORS:
            return jsonify(status="unavailable"), 503

    @app.get("/")
    @app.get("/Master_Dashboard_standalone.html")
    def dashboard():
        html = (ROOT / "Master_Dashboard_standalone.html").read_text(encoding="utf-8")
        html = html.replace("<script>", "<script>window.RAILWAY=true;</script>\n<script>", 1)
        html = html.replace("<header>", "<header inert>").replace("<main>", "<main inert>")
        html = html.replace("</body>", '<script src="/railway-storage.js"></script></body>')
        return Response(html, mimetype="text/html")

    @app.get("/railway-storage.js")
    def storage_script():
        return Response((ROOT / "railway-storage.js").read_text(encoding="utf-8"), mimetype="text/javascript")

    @app.get("/api/classes")
    def read_classes():
        with transaction() as db:
            return jsonify({row["id"]: {"json": row["json"], "revision": row["revision"]}
                            for row in db.execute("SELECT id, json, revision FROM classrooms ORDER BY id").fetchall()})

    @app.put("/api/classes/<class_id>")
    def write_class(class_id):
        """Revision 0 creates a classroom; otherwise it must match the stored revision."""
        document = request.get_json()
        if not CLASS_ID.fullmatch(class_id) or not isinstance(document, dict) or not isinstance(document.get("json"), str) \
                or type(document.get("revision")) is not int or document["revision"] < 0:
            abort(400)
        try:
            state = json.loads(document["json"])
            if not valid_state(state):
                abort(400)
            encoded = json.dumps(state, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        except (TypeError, ValueError):
            abort(400)
        with transaction() as db:
            if document["revision"] == 0:
                exists = db.execute(sql("SELECT 1 FROM classrooms WHERE id = ?"), (class_id,)).fetchone()
                if not exists and db.execute("SELECT COUNT(*) AS n FROM classrooms").fetchone()["n"] >= MAX_CLASSES:
                    return jsonify(error=f"The dashboard holds at most {MAX_CLASSES} classrooms."), 400
                cursor = db.execute(sql("INSERT INTO classrooms VALUES (?, ?, 1) ON CONFLICT (id) DO NOTHING"),
                                    (class_id, encoded))
            else:
                cursor = db.execute(sql("UPDATE classrooms SET json = ?, revision = revision + 1 WHERE id = ? AND revision = ?"),
                                    (encoded, class_id, document["revision"]))
            if cursor.rowcount:
                return jsonify(revision=document["revision"] + 1)
            current = db.execute(sql("SELECT json, revision FROM classrooms WHERE id = ?"), (class_id,)).fetchone()
            if current is None:
                abort(404)
            # A lost response may cause an identical write to be retried.
            if json.loads(current["json"]) == state:
                return jsonify(revision=current["revision"])
            return jsonify(error="This class changed in another browser. Reload before editing again."), 409

    @app.delete("/api/classes/<class_id>")
    def delete_class(class_id):
        """Deletes a classroom if it is still at the revision the browser last saw."""
        document = request.get_json()
        if not CLASS_ID.fullmatch(class_id) or not isinstance(document, dict) or type(document.get("revision")) is not int:
            abort(400)
        with transaction() as db:
            cursor = db.execute(sql("DELETE FROM classrooms WHERE id = ? AND revision = ?"), (class_id, document["revision"]))
            # Deleting a classroom that is already gone succeeds, so a retried request is harmless.
            if cursor.rowcount or db.execute(sql("SELECT 1 FROM classrooms WHERE id = ?"), (class_id,)).fetchone() is None:
                return jsonify(deleted=True)
            return jsonify(error="This class changed in another browser. Reload before deleting it."), 409

    return app
