"""Server tests.

The SQLite tests always run. The same tests run against PostgreSQL when
TEST_DATABASE_URL is set; each test uses its own temporary schema, which is
dropped afterwards, so existing tables in that database are never touched.
"""
import base64
import json
import os
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg.conninfo import make_conninfo

from server import create_app


class DashboardTests:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = {"S": [], "name": "Yr3-A", "fcd": "2026-09-13", "L": [9]}
        self.config = {"TESTING": True, "DATA_DIR": Path(self.temp.name) / "store",
                       "DATABASE_URL": self.database_url(),
                       "DASHBOARD_USERNAME": "test-user", "DASHBOARD_PASSWORD": "test-password"}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.headers = {"Authorization": "Basic " + base64.b64encode(b"test-user:test-password").decode(),
                        "X-Dashboard-Request": "1"}

    def records(self, client=None):
        return (client or self.client).get("/api/classes", headers=self.headers).get_json()

    def write(self, name="Yr3-A", revision=0, headers=None, state=None, class_id="yr3-a"):
        state = dict(state or self.state, name=name)
        return self.client.put("/api/classes/" + class_id, json={"json": json.dumps(state), "revision": revision},
                               headers=self.headers if headers is None else headers)

    def delete(self, revision, class_id="yr3-a"):
        return self.client.delete("/api/classes/" + class_id, json={"revision": revision}, headers=self.headers)

    def test_requires_credentials(self):
        with self.assertRaises(RuntimeError):
            create_app(dict(self.config, DASHBOARD_PASSWORD=""))

    def test_starts_empty(self):
        self.assertEqual(self.records(), {})

    def test_health_public_but_dashboard_and_api_private(self):
        self.assertEqual(self.client.get("/healthz").get_json(), {"status": "ok"})
        for path in ("/", "/api/classes", "/railway-storage.js"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 401)
            self.assertIn("Basic", response.headers["WWW-Authenticate"])
        response = self.client.get("/", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"window.RAILWAY=true", response.data)
        self.assertIn(b"<main inert>", response.data)
        self.assertIn(b'/railway-storage.js', response.data)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        for path in ("/data/roster.csv", "/server.py", "/.env", "/Master_Dashboard.html"):
            self.assertEqual(self.client.get(path, headers=self.headers).status_code, 404)

    def test_create_classroom_and_retry_is_idempotent(self):
        self.assertEqual(self.write().get_json(), {"revision": 1})
        self.assertEqual(self.write().get_json(), {"revision": 1})
        self.assertEqual(self.write("Someone else's Yr3-A").status_code, 409)
        self.assertEqual(json.loads(self.records()["yr3-a"]["json"])["name"], "Yr3-A")

    def test_save_survives_restart(self):
        self.write()
        self.assertEqual(self.write("Renamed", revision=1).status_code, 200)
        document = self.records(create_app(self.config).test_client())["yr3-a"]
        self.assertEqual(json.loads(document["json"])["name"], "Renamed")
        self.assertEqual(document["revision"], 2)

    def test_conflicting_browser_cannot_overwrite_and_retry_is_idempotent(self):
        self.write()
        self.assertEqual(self.write("First edit", revision=1).status_code, 200)
        self.assertEqual(self.write("Stale edit", revision=1).status_code, 409)
        self.assertEqual(json.loads(self.records()["yr3-a"]["json"])["name"], "First edit")
        self.assertEqual(self.write("First edit", revision=1).status_code, 200)
        self.assertEqual(self.records()["yr3-a"]["revision"], 2)

    def test_delete_classroom(self):
        self.write()
        self.assertEqual(self.delete(0).status_code, 409)
        self.assertEqual(self.delete(1).status_code, 200)
        self.assertEqual(self.records(), {})
        self.assertEqual(self.delete(1).status_code, 200)
        self.assertEqual(self.write("Edited after delete", revision=1).status_code, 404)

    def test_quran_scores_from_zero_to_five(self):
        student = {"name": "A", "target": 1, "passes": 0, "merits": 0, "warn": 0,
                   "log": [], "lt": [], "lx": [], "ml": [], "q": {"2026-10-10": 0}}
        self.assertEqual(self.write(state=dict(self.state, S=[student])).status_code, 200)
        student["q"] = {"2026-10-10": 6}
        self.assertEqual(self.write(revision=1, state=dict(self.state, S=[student])).status_code, 400)

    def test_fails_and_surah_passes(self):
        student = {"name": "A", "target": 4, "passes": 2, "merits": 0, "warn": 0, "log": [1, 2], "lt": [3, 4],
                   "lx": ["", ""], "ml": [], "fl": [3], "q": {}}
        self.assertEqual(self.write(state=dict(self.state, S=[student])).status_code, 200)
        book_done = dict(student, target=10, lt=[3, 10], lx=["", "Surah Al-Mulk"])
        self.assertEqual(self.write(revision=1, state=dict(self.state, S=[book_done])).status_code, 200)
        student["fl"] = ["x"]
        self.assertEqual(self.write(revision=2, state=dict(self.state, S=[student])).status_code, 400)

    def test_targets_run_on_through_the_juz_items(self):
        levels = self.state["L"]
        student = {"name": "A", "target": sum(levels) + 1, "passes": 0, "merits": 0, "warn": 0, "log": [], "lt": [],
                   "lx": [], "ml": [], "q": {}}
        self.assertEqual(self.write(state=dict(self.state, S=[student])).status_code, 200)
        student["target"] = sum(levels) + 136
        self.assertEqual(self.write(revision=1, state=dict(self.state, S=[student])).status_code, 400)
        self.assertEqual(self.write(revision=1, state=dict(self.state, Q=135, S=[student])).status_code, 200)
        student["target"] = sum(levels) + 137
        self.assertEqual(self.write(revision=2, state=dict(self.state, Q=135, S=[student])).status_code, 400)
        self.assertEqual(self.write(revision=2, state=dict(self.state, Q="135", S=[student])).status_code, 400)

    def test_student_details_from_csv(self):
        student = {"name": "A", "target": 1, "passes": 0, "merits": 0, "warn": 0, "log": [], "lt": [], "lx": [],
                   "ml": [], "q": {}, "sid": "ST001", "gender": "Female", "year": "Year 3", "sy": "Year 4", "ist": "Yr3-A-AI-Sr Maryam"}
        self.assertEqual(self.write(state=dict(self.state, S=[student])).status_code, 200)
        saved = json.loads(self.records()["yr3-a"]["json"])["S"][0]
        self.assertEqual((saved["sid"], saved["year"], saved["sy"]), ("ST001", "Year 3", "Year 4"))
        student["sid"] = 1
        self.assertEqual(self.write(revision=1, state=dict(self.state, S=[student])).status_code, 400)
        student["sid"], student["sy"] = "ST001", 4
        self.assertEqual(self.write(revision=1, state=dict(self.state, S=[student])).status_code, 400)

    def test_write_validation_and_cross_origin_protection(self):
        auth_only = {"Authorization": self.headers["Authorization"]}
        self.assertEqual(self.write(headers=auth_only).status_code, 403)
        self.assertEqual(self.write(headers=dict(self.headers, **{"Sec-Fetch-Site": "cross-site"})).status_code, 403)
        self.assertEqual(self.write(headers={"X-Dashboard-Request": "1"}).status_code, 401)
        for class_id in ("Yr3-A", "-yr3", "a" * 65, "yr3_a"):
            self.assertEqual(self.write(class_id=class_id).status_code, 400)
        for document in ({}, {"json": "not json", "revision": 0}, {"json": "{}", "revision": 0},
                         {"json": json.dumps(self.state), "revision": -1},
                         {"json": json.dumps(dict(self.state, S=[{"name": "Invalid student"}])), "revision": 0}):
            response = self.client.put("/api/classes/yr3-a", json=document, headers=self.headers)
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.delete("/api/classes/yr3-a", headers=self.headers).status_code, 403)
        self.assertEqual(self.records(), {})

    def test_classroom_limit(self):
        with patch("server.MAX_CLASSES", 2):
            self.assertEqual(self.write(class_id="a").status_code, 200)
            self.assertEqual(self.write(class_id="b").status_code, 200)
            self.assertEqual(self.write(class_id="c").status_code, 400)
            self.assertEqual(self.write(revision=1, class_id="a").status_code, 200)

    def test_earlier_classes_table_is_deleted(self):
        self.execute("CREATE TABLE classes (id TEXT PRIMARY KEY, json TEXT NOT NULL, revision INTEGER NOT NULL)",
                     "INSERT INTO classes VALUES ('y1a', '{}', 4)")
        self.write()
        client = create_app(self.config).test_client()
        self.assertEqual(list(self.records(client)), ["yr3-a"])
        self.assertFalse(self.table_exists("classes"))
        create_app(self.config)  # later startups have nothing to delete


class SQLiteTest(DashboardTests, unittest.TestCase):
    def database_url(self):
        return ""

    def connect(self):
        return sqlite3.connect(Path(self.temp.name) / "store" / "dashboard.sqlite3")

    def execute(self, *statements):
        with closing(self.connect()) as db, db:
            for statement in statements:
                db.execute(statement)

    def table_exists(self, name):
        with closing(self.connect()) as db:
            return db.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)).fetchone() is not None

    def test_requires_database_on_railway(self):
        with patch.dict("os.environ", {"RAILWAY_ENVIRONMENT_ID": "test", "RAILWAY_VOLUME_MOUNT_PATH": ""}):
            with self.assertRaisesRegex(RuntimeError, "DATABASE_URL"):
                create_app(dict(self.config, TESTING=False))


@unittest.skipUnless(os.environ.get("TEST_DATABASE_URL"), "set TEST_DATABASE_URL to test PostgreSQL")
class PostgresTest(DashboardTests, unittest.TestCase):
    def database_url(self):
        url = os.environ["TEST_DATABASE_URL"]
        schema = "test_" + uuid.uuid4().hex
        with psycopg.connect(url, autocommit=True) as db:
            db.execute(f'CREATE SCHEMA "{schema}"')

        def drop():
            with psycopg.connect(url, autocommit=True) as db:
                db.execute(f'DROP SCHEMA "{schema}" CASCADE')
        self.addCleanup(drop)
        self.url = make_conninfo(url, options=f"-c search_path={schema}")
        return self.url

    def execute(self, *statements):
        with psycopg.connect(self.url) as db:
            for statement in statements:
                db.execute(statement)

    def table_exists(self, name):
        with psycopg.connect(self.url) as db:
            return db.execute("SELECT to_regclass(%s)", (name,)).fetchone()[0] is not None

    def test_no_volume_needed_on_railway(self):
        with patch.dict("os.environ", {"RAILWAY_ENVIRONMENT_ID": "test", "RAILWAY_VOLUME_MOUNT_PATH": ""}):
            client = create_app(dict(self.config, TESTING=False)).test_client()
        self.assertEqual(client.get("/healthz").get_json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
