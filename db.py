"""Database access and schema migrations.

PostgreSQL is used when DATABASE_URL is set; otherwise a SQLite file in DATA_DIR,
which is meant for running locally. Queries are written with `?` placeholders and
rewritten for PostgreSQL.

Each migration runs once, in order, inside a transaction, and is recorded in
`schema_migrations`. Add new migrations to the end of MIGRATIONS; never edit one
that has already been deployed.
"""
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

DB_ERRORS = (sqlite3.Error, psycopg.Error)


def _types(postgres):
    return {"id": "BIGSERIAL PRIMARY KEY" if postgres else "INTEGER PRIMARY KEY AUTOINCREMENT",
            "ref": "BIGINT" if postgres else "INTEGER"}


def _m1_classrooms(db, postgres):
    db.execute("CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY, json TEXT NOT NULL, revision INTEGER NOT NULL)")
    # The earliest version shipped with fixed classes in a `classes` table.
    if postgres:
        old = db.execute("SELECT to_regclass('classes') AS t").fetchone()["t"]
    else:
        old = db.execute("SELECT name AS t FROM sqlite_master WHERE type = 'table' AND name = 'classes'").fetchone()
    if old:
        db.execute("DROP TABLE classes")
        print("Deleted the classes table left by the earlier version of the dashboard.", flush=True)


def _m2_accounts(db, postgres):
    t = _types(postgres)
    # Times are Unix seconds. Tokens are stored only as SHA-256 hashes.
    db.execute(f"""CREATE TABLE users (
        id {t['id']},
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'teacher')),
        password_hash TEXT,
        must_change INTEGER NOT NULL DEFAULT 0,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        last_login_at BIGINT)""")
    db.execute(f"""CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id {t['ref']} NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        csrf TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        ip TEXT,
        user_agent TEXT)""")
    db.execute("CREATE INDEX sessions_user ON sessions (user_id)")
    db.execute(f"""CREATE TABLE user_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id {t['ref']} NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        used_at BIGINT)""")
    db.execute(f"""CREATE TABLE attempts (
        id {t['id']},
        kind TEXT NOT NULL,
        email TEXT NOT NULL,
        ip TEXT NOT NULL,
        at BIGINT NOT NULL,
        ok INTEGER NOT NULL)""")
    db.execute("CREATE INDEX attempts_email ON attempts (kind, email, at)")
    db.execute("CREATE INDEX attempts_ip ON attempts (kind, ip, at)")
    db.execute(f"""CREATE TABLE classroom_members (
        class_id TEXT NOT NULL,
        user_id {t['ref']} NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        PRIMARY KEY (class_id, user_id))""")
    db.execute(f"""CREATE TABLE audit_log (
        id {t['id']},
        at BIGINT NOT NULL,
        user_id {t['ref']},
        action TEXT NOT NULL,
        class_id TEXT,
        detail TEXT,
        ip TEXT)""")
    db.execute("CREATE INDEX audit_log_at ON audit_log (at)")
    db.execute(f"""CREATE TABLE classroom_history (
        id {t['id']},
        class_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        json TEXT,
        saved_by {t['ref']},
        saved_at BIGINT NOT NULL)""")
    db.execute("CREATE INDEX classroom_history_class ON classroom_history (class_id, saved_at)")


def _m3_tv_screens(db, postgres):
    t = _types(postgres)
    # TV screen links (see tv.py). The token is stored only as a SHA-256 hash.
    db.execute(f"""CREATE TABLE tv_screens (
        id {t['id']},
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_by {t['ref']} REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL,
        last_seen_at BIGINT,
        revoked_at BIGINT)""")


def _m4_tv_settings(db, postgres):
    # Per-screen TV settings as JSON, such as the daily Qaidah and Memo time windows (see tv.py).
    db.execute("ALTER TABLE tv_screens ADD COLUMN settings TEXT")


def _m5_house_points(db, postgres):
    t = _types(postgres)
    # House points added by hand for a whole house, not a student (see house_extra.py): n coins of one colour.
    db.execute(f"""CREATE TABLE house_points (
        id {t['id']},
        house TEXT NOT NULL,
        coin TEXT NOT NULL,
        n INTEGER NOT NULL,
        note TEXT NOT NULL,
        given_by {t['ref']} REFERENCES users (id) ON DELETE SET NULL,
        given_at BIGINT NOT NULL)""")
    # The school's points from before the dashboard counted them, as the school gave them on 25 October 2026.
    note, at = "Historical points from before the dashboard", 1792922400000  # milliseconds
    for house, coins in (("Al-Aqsa", (("tb", 4), ("tg", 10))), ("Madinah", (("tb", 7), ("tg", 16))),
                         ("Makkah", (("tr", 1), ("tb", 6), ("tg", 14)))):
        for coin, n in coins:
            db.execute("INSERT INTO house_points (house, coin, n, note, given_at) VALUES (%s, %s, %s, %s, %s)" if postgres else
                       "INSERT INTO house_points (house, coin, n, note, given_at) VALUES (?, ?, ?, ?, ?)", (house, coin, n, note, at))


def _m6_help_requests(db, postgres):
    t = _types(postgres)
    # Help or Requests from staff, and the admins' replies (see helpdesk.py).
    db.execute(f"""CREATE TABLE help_requests (
        id {t['id']},
        kind TEXT NOT NULL CHECK (kind IN ('help', 'request')),
        user_id {t['ref']} REFERENCES users (id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        reply TEXT,
        replied_by {t['ref']} REFERENCES users (id) ON DELETE SET NULL,
        replied_by_name TEXT,
        replied_at BIGINT,
        emailed INTEGER NOT NULL DEFAULT 0,
        seen_at BIGINT)""")
    db.execute("CREATE INDEX help_requests_user ON help_requests (user_id, created_at)")
    db.execute("CREATE INDEX help_requests_created ON help_requests (created_at)")
    # One row per weekly summary email, so each week's is sent once even after a restart.
    db.execute("CREATE TABLE help_summaries (week TEXT PRIMARY KEY, sent_at BIGINT NOT NULL, items INTEGER NOT NULL)")


def _m7_avatars(db, postgres):
    t = _types(postgres)
    # Profile pictures (see avatars.py): one square JPEG per person, re-encoded on the server. users.avatar_at is
    # when it last changed, so pages can link to it with a version that changes with the picture.
    db.execute(f"""CREATE TABLE avatars (
        user_id {t['ref']} PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        image {"BYTEA" if postgres else "BLOB"} NOT NULL,
        updated_at BIGINT NOT NULL)""")
    db.execute("ALTER TABLE users ADD COLUMN avatar_at BIGINT")


def _m8_tutorial(db, postgres):
    # When a teacher finished or skipped the dashboard tutorial; until then it starts on its own.
    db.execute("ALTER TABLE users ADD COLUMN tour_done BIGINT")


def _m9_tutorial_again(db, postgres):
    # The tutorial now starts for admins too: everyone, old accounts included, sees it once more.
    db.execute("UPDATE users SET tour_done = NULL")


def _m10_board_links(db, postgres):
    t = _types(postgres)
    # Read-only links to the memorisation progress board (the board is gone; the table is left unused). The token is
    # stored only as a SHA-256 hash. scope: "" (whole school), "primary", "secondary" or "class:<classroom id>"; fails: 0 leaves out fails and
    # tester feedback.
    db.execute(f"""CREATE TABLE board_links (
        id {t['id']},
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scope TEXT NOT NULL DEFAULT '',
        fails INTEGER NOT NULL DEFAULT 1,
        created_by {t['ref']} REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL,
        last_seen_at BIGINT,
        revoked_at BIGINT)""")


def _m11_login_codes(db, postgres):
    t = _types(postgres)
    # The emailed code an admin types after their password (see auth.py). token_hash is the SHA-256 hash of the random
    # token in that browser's cookie, code_hash the code's; fails counts wrong codes, and the code stops working at
    # LOGIN_CODE_FAILS.
    db.execute(f"""CREATE TABLE login_codes (
        token_hash TEXT PRIMARY KEY,
        user_id {t['ref']} NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        fails INTEGER NOT NULL DEFAULT 0)""")


def _m12_stay_signed_in(db, postgres):
    # 1 for a sign-in made with "Stay signed in" (see auth.py): it lasts SESSION_STAY, not SESSION_SHORT.
    db.execute("ALTER TABLE sessions ADD COLUMN remember INTEGER NOT NULL DEFAULT 0")


def _m13_presenter_shares(db, postgres):
    t = _types(postgres)
    # A class's Presenter shared by link (mysafar.org/ustdfaeez, see tv.py). The link stays the same for the class;
    # its 4-character code changes every day and when the teacher asks for a new one, and stops working after
    # SHARE_FAILS wrong tries. Each tab that typed the right code holds a random view token (stored only as a SHA-256
    # hash) until the tab is closed or the teacher stops sharing.
    db.execute(f"""CREATE TABLE presenter_shares (
        class_id TEXT PRIMARY KEY REFERENCES classrooms (id) ON DELETE CASCADE,
        slug TEXT NOT NULL UNIQUE,
        code TEXT,
        code_expires_at BIGINT NOT NULL DEFAULT 0,
        fails INTEGER NOT NULL DEFAULT 0,
        created_by {t['ref']} REFERENCES users (id) ON DELETE SET NULL,
        created_at BIGINT NOT NULL)""")
    db.execute("""CREATE TABLE presenter_views (
        token_hash TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES presenter_shares (class_id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL)""")


def _m14_presenter_links(db, postgres):
    t = _types(postgres)
    # The teacher's Presenter, opened like a TV screen's link (see tv.py): each press of Presenter makes a new random
    # link (stored only as a SHA-256 hash) that the first tab to open it claims. That tab holds its own key (tab_hash)
    # in sessionStorage, so the link works there until the tab is closed, and nowhere else.
    db.execute(f"""CREATE TABLE presenter_links (
        token_hash TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classrooms (id) ON DELETE CASCADE,
        created_by {t['ref']} NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        tab_hash TEXT,
        last_seen_at BIGINT)""")


MIGRATIONS = [_m1_classrooms, _m2_accounts, _m3_tv_screens, _m4_tv_settings, _m5_house_points, _m6_help_requests,
              _m7_avatars, _m8_tutorial, _m9_tutorial_again, _m10_board_links, _m11_login_codes, _m12_stay_signed_in,
              _m13_presenter_shares, _m14_presenter_links]


class Database:
    def __init__(self, database_url, data_dir, testing=False):
        self.postgres = bool(database_url)
        if self.postgres:
            self._connect = lambda: psycopg.connect(database_url, connect_timeout=10, row_factory=dict_row)
        else:
            data_dir = Path(data_dir).resolve()
            # Fail rather than silently save student records on Railway's temporary disk.
            if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not testing:
                mount = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")
                if not mount or (Path(mount).resolve() != data_dir and Path(mount).resolve() not in data_dir.parents):
                    raise RuntimeError("Set DATABASE_URL to your PostgreSQL service's DATABASE_URL "
                                       "(or attach a Railway volume at DATA_DIR).")
            data_dir.mkdir(parents=True, exist_ok=True)
            path = data_dir / "dashboard.sqlite3"

            def connect():
                db = sqlite3.connect(path, timeout=10)
                db.row_factory = sqlite3.Row
                db.execute("PRAGMA foreign_keys = ON")
                return db
            self._connect = connect

    def sql(self, query):
        return query.replace("?", "%s") if self.postgres else query

    @contextmanager
    def transaction(self):
        db = self._connect()
        try:
            yield _Connection(db, self)
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def migrate(self):
        # The database service can still be starting when the app boots.
        for attempt in range(10):
            try:
                return self._migrate()
            except psycopg.OperationalError:
                if attempt == 9:
                    raise
                time.sleep(3)

    def _migrate(self):
        with self.transaction() as db:
            if self.postgres:
                # Only one process applies migrations at a time.
                db.execute("SELECT pg_advisory_xact_lock(726354)")
            else:
                db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)")
            done = {row["version"] for row in db.execute("SELECT version FROM schema_migrations").fetchall()}
            for version, migration in enumerate(MIGRATIONS, 1):
                if version not in done:
                    migration(db.raw, self.postgres)
                    db.execute("INSERT INTO schema_migrations VALUES (?, ?)", (version, int(time.time())))
                    print(f"Applied database migration {version}: {migration.__name__.split('_', 2)[-1]}.", flush=True)


class _Connection:
    """Wraps a connection so that queries can use `?` placeholders on both databases."""

    def __init__(self, raw, database):
        self.raw = raw
        self._database = database

    def execute(self, query, params=()):
        return self.raw.execute(self._database.sql(query), params)

    def insert(self, query, params=()):
        """Runs an INSERT and returns the new row's id."""
        if self._database.postgres:
            return self.raw.execute(self._database.sql(query) + " RETURNING id", params).fetchone()["id"]
        return self.raw.execute(query, params).lastrowid
