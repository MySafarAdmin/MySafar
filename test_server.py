"""Server tests.

The SQLite tests always run. The same tests run against PostgreSQL when
TEST_DATABASE_URL is set; each test uses its own temporary schema, which is
dropped afterwards, so existing tables in that database are never touched.
"""
import json
import os
import re
import sqlite3
import tempfile
import time
import unittest
import uuid
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg.conninfo import make_conninfo

import auth
from server import create_app

ADMIN = ("admin@example.com", "bootstrap-password-1")


class FakeMailer:
    enabled = True

    def __init__(self):
        self.sent = []

    def send(self, to, subject, text):
        self.sent.append((to, subject, text))
        return True

    def link(self):
        return re.search(r"https?://\S+(/(?:invite|reset)/\S+)", self.sent[-1][2]).group(1)


def csrf_of(response):
    return re.search(r'name="csrf" value="([^"]+)"', response.get_data(as_text=True)).group(1)


class DashboardTests:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = {"S": [], "name": "Yr3-A", "fcd": "2026-09-13", "L": [9]}
        self.config = {"TESTING": True, "DATA_DIR": Path(self.temp.name) / "store",
                       "DATABASE_URL": self.database_url(), "COOKIE_SECURE": False,
                       "ADMIN_EMAIL": ADMIN[0], "DASHBOARD_PASSWORD": ADMIN[1]}
        self.app = create_app(self.config)
        # The first admin chooses their own password at first sign-in; tested separately.
        with self.app.config["DB"].transaction() as tx:
            tx.execute("UPDATE users SET must_change = 0")
        self.client = self.sign_in(*ADMIN)
        self.headers = {"X-Dashboard-Request": "1"}

    def sign_in(self, email, password, app=None, remember=False):
        client = (app or self.app).test_client()
        page = client.get("/login")
        data = {"csrf": csrf_of(page), "email": email, "password": password}
        if remember:
            data["remember"] = "1"
        client.last = client.post("/login", data=data)
        return client

    def add_user(self, email, role="teacher", password="teacher-password-1", classes=()):
        with self.app.config["DB"].transaction() as tx:
            user_id = tx.insert("INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                                (email, email.split("@")[0].title(), role, auth.hasher.hash(password), 0))
            for class_id in classes:
                tx.execute("INSERT INTO classroom_members VALUES (?, ?)", (class_id, user_id))
        return user_id

    def query(self, sql, params=()):
        with self.app.config["DB"].transaction() as tx:
            return [dict(row) for row in tx.execute(sql, params).fetchall()]

    def records(self, client=None):
        return (client or self.client).get("/api/classes", headers=self.headers).get_json()

    def write(self, name="Yr3-A", revision=0, headers=None, state=None, class_id="yr3-a", client=None):
        state = dict(state or self.state, name=name)
        return (client or self.client).put("/api/classes/" + class_id, json={"json": json.dumps(state), "revision": revision},
                                           headers=self.headers if headers is None else headers)

    def delete(self, revision, class_id="yr3-a", client=None):
        return (client or self.client).delete("/api/classes/" + class_id, json={"revision": revision}, headers=self.headers)

    def form(self, client, page, action, **data):
        return client.post(action, data=dict(data, csrf=csrf_of(client.get(page))))

    def test_first_admin_needs_admin_email(self):
        with self.assertRaisesRegex(RuntimeError, "ADMIN_EMAIL"):
            create_app(dict(self.config, DATABASE_URL=self.database_url(), DATA_DIR=Path(self.temp.name) / "new",
                            ADMIN_EMAIL=""))

    def test_starts_empty(self):
        self.assertEqual(self.records(), {})

    def test_health_public_but_dashboard_and_api_private(self):
        anonymous = self.app.test_client()
        self.assertEqual(anonymous.get("/healthz").get_json(), {"status": "ok"})
        for path in ("/", "/railway-storage.js", "/account", "/admin/users"):
            response = anonymous.get(path)
            self.assertEqual(response.status_code, 302)
            self.assertTrue(response.headers["Location"].startswith("/login"))
        self.assertEqual(anonymous.get("/api/classes").status_code, 401)
        self.assertEqual(anonymous.get("/login").status_code, 200)
        self.assertEqual(anonymous.get("/logo.png").mimetype, "image/png")
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"window.RAILWAY=true", response.data)
        self.assertIn(b'"role": "admin"', response.data)
        self.assertIn(b"<main inert>", response.data)
        self.assertIn(b'/railway-storage.js', response.data)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        for path in ("/data/roster.csv", "/server.py", "/.env", "/Master_Dashboard.html", "/static/auth.css",
                     "/templates/login.html"):
            self.assertEqual(self.client.get(path).status_code, 404)

    def test_create_classroom_and_retry_is_idempotent(self):
        self.assertEqual(self.write().get_json(), {"revision": 1})
        self.assertEqual(self.write().get_json(), {"revision": 1})
        self.assertEqual(self.write("Someone else's Yr3-A").status_code, 409)
        self.assertEqual(json.loads(self.records()["yr3-a"]["json"])["name"], "Yr3-A")

    def test_save_survives_restart(self):
        self.write()
        self.assertEqual(self.write("Renamed", revision=1).status_code, 200)
        document = self.records(self.sign_in(*ADMIN, app=create_app(self.config)))["yr3-a"]
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
        self.assertEqual(self.write(headers={}).status_code, 403)
        self.assertEqual(self.write(headers=dict(self.headers, **{"Sec-Fetch-Site": "cross-site"})).status_code, 403)
        self.assertEqual(self.write(headers=dict(self.headers, Origin="https://evil.example")).status_code, 403)
        self.assertEqual(self.write(client=self.app.test_client()).status_code, 401)
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
        config = dict(self.config, DATABASE_URL=self.database_url(), DATA_DIR=Path(self.temp.name) / "earlier")
        self.execute(config, "CREATE TABLE classes (id TEXT PRIMARY KEY, json TEXT NOT NULL, revision INTEGER NOT NULL)",
                     "INSERT INTO classes VALUES ('y1a', '{}', 4)")
        create_app(config)
        self.assertFalse(self.table_exists(config, "classes"))
        create_app(config)  # later startups have nothing to delete

    def test_existing_records_are_kept_when_accounts_are_added(self):
        config = dict(self.config, DATABASE_URL=self.database_url(), DATA_DIR=Path(self.temp.name) / "upgrade")
        # The database as the shared-login version left it.
        self.execute(config, "CREATE TABLE classrooms (id TEXT PRIMARY KEY, json TEXT NOT NULL, revision INTEGER NOT NULL)",
                     "INSERT INTO classrooms VALUES ('yr3-a', '{\"name\": \"Yr3-A\"}', 7)")
        app = create_app(config)
        with app.config["DB"].transaction() as tx:
            tx.execute("UPDATE users SET must_change = 0")
        self.assertEqual(self.records(self.sign_in(*ADMIN, app=app))["yr3-a"]["revision"], 7)

    # --- Signing in ---

    def test_first_admin_must_choose_a_new_password(self):
        with self.app.config["DB"].transaction() as tx:
            tx.execute("UPDATE users SET must_change = 1")
        client = self.sign_in(*ADMIN)
        self.assertEqual(client.get("/").headers["Location"], "/account")
        self.assertEqual(client.get("/api/classes").status_code, 403)
        weak = self.form(client, "/account", "/account/password", current=ADMIN[1], password="short", confirm="short")
        self.assertEqual(weak.status_code, 400)
        good = self.form(client, "/account", "/account/password", current=ADMIN[1],
                         password="a brand new passphrase", confirm="a brand new passphrase")
        self.assertEqual(good.status_code, 200)
        self.assertEqual(client.get("/").status_code, 200)
        self.assertEqual(self.sign_in(*ADMIN).last.status_code, 401)
        self.assertEqual(self.sign_in(ADMIN[0], "a brand new passphrase").last.status_code, 302)

    def test_wrong_password_unknown_email_and_lockout(self):
        self.add_user("t@example.com")
        wrong = self.sign_in("t@example.com", "not the password")
        unknown = self.sign_in("nobody@example.com", "not the password")
        self.assertEqual((wrong.last.status_code, unknown.last.status_code), (401, 401))
        self.assertIn(b"don&#39;t match", wrong.last.data)
        self.assertIn(b"don&#39;t match", unknown.last.data)
        for _ in range(4):
            self.sign_in("t@example.com", "still wrong")
        # Locked out for 15 minutes, even with the right password.
        self.assertEqual(self.sign_in("t@example.com", "teacher-password-1").last.status_code, 429)
        self.assertEqual(self.sign_in(*ADMIN).last.status_code, 302)
        with self.app.config["DB"].transaction() as tx:
            tx.execute("UPDATE attempts SET at = at - 1000")
        self.assertEqual(self.sign_in("t@example.com", "teacher-password-1").last.status_code, 302)

    def test_sign_in_needs_the_form_token(self):
        client = self.app.test_client()
        response = client.post("/login", data={"email": ADMIN[0], "password": ADMIN[1]})
        self.assertEqual(response.status_code, 400)

    def test_sign_in_returns_to_the_page_asked_for_but_never_another_site(self):
        self.assertEqual(self.app.test_client().get("/admin/users").headers["Location"], "/login?next=/admin/users")
        for target, expected in (("/admin/users", "/admin/users"), ("//evil.example", "/"),
                                 ("https://evil.example", "/"), ("/\\evil.example", "/")):
            client = self.app.test_client()
            page = client.get("/login")
            response = client.post("/login", data={"csrf": csrf_of(page), "email": ADMIN[0], "password": ADMIN[1],
                                                   "next": target})
            self.assertEqual(response.headers["Location"], expected)

    def test_sign_out(self):
        response = self.form(self.client, "/account", "/logout")
        self.assertEqual(response.headers["Location"], "/login?out=1")
        self.assertEqual(self.client.get("/api/classes").status_code, 401)

    def test_sessions_expire(self):
        client = self.sign_in(*ADMIN)
        with self.app.config["DB"].transaction() as tx:
            tx.execute("UPDATE sessions SET last_seen_at = last_seen_at - ?", (auth.SESSION_IDLE + 1,))
        self.assertEqual(client.get("/api/classes").status_code, 401)
        client = self.sign_in(*ADMIN, remember=True)
        self.assertIn("Max-Age=2592000", client.last.headers["Set-Cookie"])
        with self.app.config["DB"].transaction() as tx:
            tx.execute("UPDATE sessions SET expires_at = ?", (int(time.time()) - 1,))
        self.assertEqual(client.get("/api/classes").status_code, 401)

    def test_behind_railways_proxy(self):
        app = create_app(dict(self.config, COOKIE_SECURE=True, TRUST_PROXY=True,
                              PUBLIC_URL="https://dash.example.org"))
        client = app.test_client()
        railway = {"X-Forwarded-Proto": "https", "X-Forwarded-Host": "dash.example.org", "X-Real-IP": "203.0.113.9"}
        page = client.get("/login", headers=railway)
        # The browser sends the public site as Origin; the app sees an internal Host.
        response = client.post("/login", headers=dict(railway, Origin="https://dash.example.org"),
                               data={"csrf": csrf_of(page), "email": ADMIN[0], "password": ADMIN[1]})
        self.assertEqual(response.status_code, 302)
        self.assertIn({"ip": "203.0.113.9"}, self.query("SELECT ip FROM sessions"))
        evil = client.put("/api/classes/yr3-a", json={}, headers=dict(railway, Origin="https://evil.example",
                                                                       **self.headers))
        self.assertEqual(evil.status_code, 403)

    def test_secure_cookies(self):
        app = create_app(dict(self.config, COOKIE_SECURE=True))
        client = app.test_client()
        page = client.get("/login", base_url="https://localhost")
        response = client.post("/login", base_url="https://localhost",
                               data={"csrf": csrf_of(page), "email": ADMIN[0], "password": ADMIN[1]})
        cookie = response.headers["Set-Cookie"]
        for part in ("__Host-safar=", "Secure", "HttpOnly", "SameSite=Lax", "Path=/"):
            self.assertIn(part, cookie)
        self.assertIn("max-age=31536000", response.headers["Strict-Transport-Security"])

    # --- Teachers and admins ---

    def test_teachers_see_and_edit_only_their_classrooms(self):
        self.write(class_id="yr3-a")
        self.write("Yr4-B", class_id="yr4-b")
        self.add_user("t@example.com", classes=["yr3-a"])
        teacher = self.sign_in("t@example.com", "teacher-password-1")
        self.assertEqual(list(self.records(teacher)), ["yr3-a"])
        self.assertIn(b'"role": "teacher"', teacher.get("/").data)
        self.assertEqual(self.write("Mine", revision=1, client=teacher).status_code, 200)
        self.assertEqual(self.write("Not mine", revision=1, class_id="yr4-b", client=teacher).status_code, 403)
        self.assertEqual(self.write("New", class_id="yr5-c", client=teacher).status_code, 403)
        self.assertEqual(self.delete(2, client=teacher).status_code, 403)
        for path in ("/admin/users", "/admin/history", "/admin/activity"):
            self.assertEqual(teacher.get(path).status_code, 403)
        self.assertEqual(json.loads(self.records()["yr4-b"]["json"])["name"], "Yr4-B")

    def test_invite_without_email(self):
        self.write()
        response = self.form(self.client, "/admin/users", "/admin/users/invite", name="Sr Maryam",
                             email="Maryam@Example.com", role="teacher", classes=["yr3-a", "not-a-class"])
        self.assertEqual(response.status_code, 200)
        link = re.search(r'value="https?://[^/"]+(/invite/[^"]+)"', response.get_data(as_text=True)).group(1)
        new = self.app.test_client()
        self.assertIn(b"Welcome, Sr Maryam", new.get(link).data)
        page = new.get(link)
        self.assertEqual(new.post(link, data={"csrf": csrf_of(page), "password": "short", "confirm": "short"}).status_code, 400)
        page = new.get(link)
        response = new.post(link, data={"csrf": csrf_of(page), "password": "olive tree morning", "confirm": "olive tree morning"})
        self.assertEqual(response.headers["Location"], "/")
        self.assertEqual(list(self.records(new)), ["yr3-a"])
        self.assertEqual(self.app.test_client().get(link).status_code, 410)
        self.assertEqual(self.sign_in("maryam@example.com", "olive tree morning").last.status_code, 302)
        duplicate = self.form(self.client, "/admin/users", "/admin/users/invite", name="Again",
                              email="maryam@example.com", role="teacher")
        self.assertEqual(duplicate.status_code, 400)

    def test_invite_and_reset_by_email(self):
        mailer = FakeMailer()
        self.app.config["MAILER"] = mailer
        response = self.form(self.client, "/admin/users", "/admin/users/invite", name="Br Ahmed",
                             email="ahmed@example.com", role="teacher")
        self.assertNotIn(b"/invite/", response.data)
        self.assertEqual(mailer.sent[-1][0], "ahmed@example.com")
        self.assertIn("72 hours", mailer.sent[-1][2])
        new = self.app.test_client()
        page = new.get(mailer.link())
        new.post(mailer.link(), data={"csrf": csrf_of(page), "password": "olive tree morning", "confirm": "olive tree morning"})
        # Forgotten password: the same answer whether or not there is an account.
        anonymous = self.app.test_client()
        unknown = self.form(anonymous, "/forgot", "/forgot", email="nobody@example.com")
        self.assertEqual(len(mailer.sent), 1)
        known = self.form(anonymous, "/forgot", "/forgot", email="Ahmed@example.com")
        self.assertEqual(unknown.data, known.data)
        self.assertEqual(len(mailer.sent), 2)
        self.assertIn("1 hour", mailer.sent[-1][2])
        page = anonymous.get(mailer.link())
        anonymous.post(mailer.link(), data={"csrf": csrf_of(page), "password": "river stone evening",
                                            "confirm": "river stone evening"})
        # Resetting signs out every other session.
        self.assertEqual(new.get("/api/classes").status_code, 401)
        self.assertEqual(self.sign_in("ahmed@example.com", "river stone evening").last.status_code, 302)
        for _ in range(3):
            self.form(anonymous, "/forgot", "/forgot", email="ahmed@example.com")
        self.assertEqual(len(mailer.sent), 4)  # limited to 3 a quarter of an hour

    def test_reset_links_expire(self):
        self.add_user("t@example.com")
        mailer = FakeMailer()
        self.app.config["MAILER"] = mailer
        self.form(self.app.test_client(), "/forgot", "/forgot", email="t@example.com")
        with self.app.config["DB"].transaction() as tx:
            tx.execute("UPDATE user_tokens SET expires_at = ?", (int(time.time()) - 1,))
        self.assertEqual(self.app.test_client().get(mailer.link()).status_code, 410)

    def test_turning_off_an_account_signs_it_out(self):
        user_id = self.add_user("t@example.com")
        teacher = self.sign_in("t@example.com", "teacher-password-1")
        self.form(self.client, "/admin/users", f"/admin/users/{user_id}/access", disable="1")
        self.assertEqual(teacher.get("/api/classes").status_code, 401)
        self.assertEqual(self.sign_in("t@example.com", "teacher-password-1").last.status_code, 401)
        self.form(self.client, "/admin/users", f"/admin/users/{user_id}/access", disable="0")
        self.assertEqual(self.sign_in("t@example.com", "teacher-password-1").last.status_code, 302)

    def test_the_last_admin_stays_an_admin(self):
        admin_id = self.query("SELECT id FROM users")[0]["id"]
        response = self.form(self.client, "/admin/users", f"/admin/users/{admin_id}/update", name="Me", role="teacher")
        self.assertEqual(response.status_code, 400)
        response = self.form(self.client, "/admin/users", f"/admin/users/{admin_id}/access", disable="1")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.query("SELECT role, disabled FROM users"), [{"role": "admin", "disabled": 0}])

    def test_change_classrooms_and_role(self):
        self.write()
        user_id = self.add_user("t@example.com")
        teacher = self.sign_in("t@example.com", "teacher-password-1")
        self.assertEqual(self.records(teacher), {})
        self.form(self.client, "/admin/users", f"/admin/users/{user_id}/update", name="T", role="teacher", classes=["yr3-a"])
        self.assertEqual(list(self.records(teacher)), ["yr3-a"])
        self.form(self.client, "/admin/users", f"/admin/users/{user_id}/update", name="T", role="admin")
        self.assertEqual(self.delete(1, client=teacher).status_code, 200)

    # --- History and activity ---

    def test_history_restores_an_earlier_version_and_a_deleted_classroom(self):
        self.write()
        self.write("Renamed", revision=1)
        # Saves by the same person within 15 minutes share one history entry.
        self.assertEqual(len(self.query("SELECT id FROM classroom_history")), 1)
        with self.app.config["DB"].transaction() as tx:
            tx.execute("UPDATE classroom_history SET saved_at = saved_at - 3600, json = ?", (json.dumps(self.state),))
        self.write("Renamed again", revision=2)
        self.assertEqual(self.delete(3).status_code, 200)
        self.assertEqual(self.records(), {})
        listing = self.client.get("/admin/history").get_data(as_text=True)
        self.assertIn("Deleted", listing)
        page = self.client.get("/admin/history/yr3-a")
        first = self.query("SELECT id FROM classroom_history ORDER BY id")[0]["id"]
        response = self.client.post("/admin/history/yr3-a/restore", data={"csrf": csrf_of(page), "entry": first})
        self.assertEqual(response.status_code, 200)
        record = self.records()["yr3-a"]
        self.assertEqual((json.loads(record["json"])["name"], record["revision"]), ("Yr3-A", 1))

    def test_activity_is_recorded_and_pruned(self):
        self.sign_in("someone@example.com", "wrong password")
        self.write()
        page = self.client.get("/admin/activity").get_data(as_text=True)
        for text in ("Signed in", "Wrong password", "someone@example.com", "Saved classroom"):
            self.assertIn(text, page)
        with self.app.config["DB"].transaction() as tx:
            tx.execute("UPDATE audit_log SET at = at - ?", (15 * auth.DAY,))
            tx.execute("UPDATE classroom_history SET saved_at = saved_at - ?", (15 * auth.DAY,))
        auth.prune(self.app.config["DB"], 14)
        self.assertEqual(self.query("SELECT id FROM audit_log"), [])
        self.assertEqual(self.query("SELECT id FROM classroom_history"), [])
        self.assertEqual(list(self.records()), ["yr3-a"])


class SQLiteTest(DashboardTests, unittest.TestCase):
    def database_url(self):
        return ""

    def connect(self, config):
        Path(config["DATA_DIR"]).mkdir(parents=True, exist_ok=True)
        return sqlite3.connect(Path(config["DATA_DIR"]) / "dashboard.sqlite3")

    def execute(self, config, *statements):
        with closing(self.connect(config)) as db, db:
            for statement in statements:
                db.execute(statement)

    def table_exists(self, config, name):
        with closing(self.connect(config)) as db:
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
        return make_conninfo(url, options=f"-c search_path={schema}")

    def execute(self, config, *statements):
        with psycopg.connect(config["DATABASE_URL"]) as db:
            for statement in statements:
                db.execute(statement)

    def table_exists(self, config, name):
        with psycopg.connect(config["DATABASE_URL"]) as db:
            return db.execute("SELECT to_regclass(%s)", (name,)).fetchone()[0] is not None

    def test_no_volume_needed_on_railway(self):
        with patch.dict("os.environ", {"RAILWAY_ENVIRONMENT_ID": "test", "RAILWAY_VOLUME_MOUNT_PATH": ""}):
            client = create_app(dict(self.config, TESTING=False)).test_client()
        self.assertEqual(client.get("/healthz").get_json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
