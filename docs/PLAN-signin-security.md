# Plan: sign-in page, security and backend improvements

Written 2026-10-13 from a review of this repository, the Railway project
`triumphant-renewal` and the GitHub repository `MySafarAdmin/MySafar`.

## Decisions (2026-10-13)

- Own email-and-password sign-in, not Google sign-in. The sign-in page is the
  start page.
- Invite and password-reset links are emailed (Resend, over HTTPS, since
  Railway's Hobby plan blocks SMTP). Test emails go to
  faeez.aullyar@safaracademy.org via `MAIL_REDIRECT_TO`.
- Roles: administrators see everything; teachers see only their own
  classrooms. There is no viewer role.
- History and activity are kept for 14 days. Backups go to this account's
  Google Drive, keeping 14 days.
- Deploy-failure alerts go to the account's email.
- The custom domain comes later.

## Progress

- Done on branch `claude/website-signin-security-plan-f13fxj`, not yet merged:
  - Sign-in page, staff accounts, sessions, roles and per-teacher classrooms
  - Invites and password resets
  - Rate limits, CSRF and origin checks
  - Class history with restore, and the activity log
  - Numbered migrations
  - HSTS, a non-root Docker image, and Flask 3.1.3
  - GitHub Actions CI, Dependabot and SECURITY.md
- Not yet done:
  - Railway clean-up (deleting the leftover import service)
  - Google Drive backups
  - Branch protection
  - Removing `'unsafe-inline'` from the dashboard's CSP
  - Two-factor sign-in for admins

## 1. Where things stand today

### What is already good

- Postgres has no public TCP proxy; it is reachable only on Railway's private
  network. The dashboard is the only public service.
- `server.py` compares credentials in constant time, sends `no-store`,
  `X-Frame-Options: DENY`, `nosniff`, a CSP, and protects writes with a JSON body
  plus a custom `X-Dashboard-Request` header (forces a CORS preflight, which is
  never granted). `Sec-Fetch-Site: cross-site` writes are refused.
- Writes are validated (`valid_state`) and use optimistic concurrency
  (`revision`), so one browser cannot silently overwrite another.
- Request bodies are capped at 2 MB, classrooms at 500, and SQL is
  parameterised throughout.
- The last two days of HTTP logs (201 requests from 7 IPs) show no attack
  traffic. The 401s are browsers fetching icons before the login prompt.

### Gaps found

| # | Area | Finding | Risk |
| --- | --- | --- | --- |
| G1 | Sign-in | One shared username/password for all staff, via the browser's HTTP Basic popup. No real sign-out, no per-person accounts, and leavers can't be removed without changing everyone's password. | High |
| G2 | Sign-in | No rate limiting or lockout on failed logins. | Medium |
| G3 | Authorisation | Every signed-in person can delete any classroom and upload CSVs that move students. | High |
| G4 | Audit | No record of who changed or deleted what. A bad save or a deleted classroom can only be recovered from a backup, if there is one. | High |
| G5 | Data protection | The database holds children's personal data (names, student IDs, gender, school year). UK GDPR applies, so access control, audit and retention need to be deliberate. | High |
| G6 | Railway | The `safar-one-off-import` function finished its job but is still deployed with a full `DATABASE_URL`. | Medium |
| G7 | Railway | No backups are configured for `postgres-volume` beyond the volume itself, and no restore has been tested. | High |
| G8 | Railway | Every push to `main` deploys straight to production (`checkSuites: false`), and there is no staging environment. | Medium |
| G9 | GitHub | No CI workflows, `main` is unprotected, and there is no Dependabot or secret scanning. | Medium |
| G10 | Frontend | CSP allows `'unsafe-inline'` scripts, and the page builds HTML with 22 `innerHTML` assignments. `esc()` does not escape `'`. CSV data is untrusted, so one missed escape is stored XSS with full session power. | Medium |
| G11 | Headers | No `Strict-Transport-Security`. | Low |
| G12 | Backend | Schema changes are ad hoc inside `initialise()`, with no migrations. Each request opens a new DB connection (no pool). | Low |
| G13 | Container | The Docker image runs as root. | Low |
| G14 | Docs | `RAILWAY.md` names the old repository (`raedeifan-oss/supreme-octo-succotash`) and branch. | Low |
| G15 | Railway | The service's dashboard settings say `RAILPACK`, but `railway.json` says Dockerfile. The file wins today; set both the same to avoid surprises. | Low |
| G16 | Accounts | The GitHub and Railway owner is a shared `mysafaradmin` account. Shared logins can't be audited and are hard to protect with 2FA. | Medium |

## 2. Goals

1. A branded **sign-in page** with individual staff accounts, real sign-out, and
   session expiry, replacing the shared Basic-auth login.
2. **Roles**: admins manage users and classrooms; teachers record passes, merits,
   warnings and Quran scores.
3. **Accountability and recovery**: an audit log, and a history of every
   classroom save that can be restored without a full database restore.
4. **Safe delivery**: CI on GitHub, a staging environment on Railway, and
   production deploys only after checks pass.
5. **Resilience**: tested backups, alerts on failed deploys, and no stale
   credentials.

Non-goals for now: public sign-up, parent or student logins, multi-school
tenancy.

## 3. Design of the sign-in system

### 3.1 Approach

Build the sign-in inside the existing Flask app with server-side sessions stored
in Postgres. This adds two small dependencies (`argon2-cffi`, and `pyotp` later)
and no new services, so it fits the current single-service setup.

Alternatives considered:
- **Google or Microsoft sign-in (OIDC)**: best if every staff member already has
  a school Google Workspace or Microsoft 365 account. It can be added in phase 5
  next to passwords (see open question Q1).
- **A hosted auth provider (Clerk, Auth0, Supabase)**: more moving parts, a
  third party holding staff identities, and a monthly cost. Not justified at
  this scale.

### 3.2 Data model (new tables)

```sql
users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,          -- stored lower-case
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','teacher','viewer')),
  password_hash TEXT,                          -- argon2id; NULL until the invite is accepted
  totp_secret   TEXT,                          -- phase 5, encrypted with SECRET_KEY
  disabled_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
)
sessions (
  token_hash    BYTEA PRIMARY KEY,             -- SHA-256 of the cookie value; raw token never stored
  user_id       BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  ip TEXT, user_agent TEXT
)
user_tokens (                                  -- invite and password-reset links
  token_hash BYTEA PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite','reset')),
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
)
login_attempts (email TEXT, ip TEXT, at TIMESTAMPTZ NOT NULL, ok BOOLEAN NOT NULL)
audit_log (
  id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT REFERENCES users, action TEXT NOT NULL,   -- login, logout, class.save, class.delete, csv.import, user.invite ...
  class_id TEXT, detail JSONB, ip TEXT
)
classroom_history (                            -- every saved revision, for undo/restore
  class_id TEXT NOT NULL, revision INTEGER NOT NULL, json TEXT NOT NULL,
  saved_by BIGINT REFERENCES users, saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, revision)
)
```

SQLite (local development) keeps working; the same SQL is used with
`?`-placeholder rewriting as today.

### 3.3 Pages and endpoints

| Route | Purpose |
| --- | --- |
| `GET /login` | Sign-in page: Safar logo and template styles, email, password, "Keep me signed in on this device", generic error message. |
| `POST /login` | Checks credentials and rate limits, starts a session, redirects to `next` (same-origin paths only). |
| `POST /logout` | Ends this session. |
| `POST /logout-everywhere` | Ends all of the user's sessions. |
| `GET/POST /invite/<token>` | New staff member sets their name and password (one-time link, valid 72 h). |
| `GET/POST /reset/<token>` | Choose a new password (one-time link, valid 1 h). Ends all existing sessions. |
| `GET /account` | Change password, see active sessions, sign out of them. |
| `GET /admin/users` | Admin only: invite, change role, disable, generate a reset link. |
| `GET /api/me` | Current user's name and role, for the dashboard header. |

Without an email provider, admins copy invite and reset links from
`/admin/users` and send them through the school's usual channel. Sending them
by email (Resend or Postmark) is an optional add-on (Q2).

### 3.4 Session and cookie rules

- Cookie `__Host-safar_session`: 256-bit random token, `Secure`, `HttpOnly`,
  `SameSite=Lax`, `Path=/`, no `Domain`.
- Idle timeout 8 hours. Absolute lifetime 12 hours, or 30 days with "keep me
  signed in".
- The session ID is rotated at sign-in, and all sessions end on a password
  change or reset.
- `last_seen_at` is written at most once a minute, because the 10-second
  polling would otherwise write on every request.

### 3.5 Passwords and brute-force protection

- argon2id (`argon2-cffi` defaults), with rehash on login when parameters change.
- At least 12 characters, no composition rules, and a check against a bundled
  list of common passwords. An optional "Have I Been Pwned" range check needs
  outbound HTTPS.
- Rate limits are kept in `login_attempts`:
  - 5 failures per email in 15 minutes locks that email for 15 minutes.
  - 20 failures per IP in 15 minutes blocks that IP for 15 minutes.
  - Every failure gets a constant ~300 ms delay.
- Responses never reveal whether an email exists. The same rules apply to
  `/reset` and `/invite`.
- The real client IP comes from Railway's `X-Forwarded-For`. Only the right-most
  proxy hop is trusted (Werkzeug `ProxyFix(x_for=1)`).

### 3.6 CSRF

- API writes keep the existing JSON + `X-Dashboard-Request` header check, and
  gain a strict `Origin` check against the app's own host.
- HTML form posts (`/login`, `/logout`, `/invite`, `/reset`, `/admin/*`) carry
  a CSRF token tied to the session (or, before sign-in, to a short-lived
  pre-session cookie). They also get the `Origin` check.

### 3.7 Authorisation

| Action | viewer | teacher | admin |
| --- | --- | --- | --- |
| View dashboards | ✓ | ✓ | ✓ |
| Record passes, fails, merits, warnings, Quran scores, memo | | ✓ | ✓ |
| Add or edit a student by hand | | ✓ | ✓ |
| Rename a classroom or change its first class day | | | ✓ |
| Upload a CSV, create or delete a classroom | | | ✓ |
| Manage users, view the audit log, restore history | | | ✓ |

- The server is the source of truth: `PUT /api/classes/<id>` compares the old
  and new state and refuses changes outside the user's role. The frontend only
  hides controls it would refuse anyway.
- Phase 4 option (Q3): restrict teachers to their own classrooms through a
  `classroom_members (class_id, user_id)` table that admins fill in. Staff
  could also be matched to the CSV "Current Teacher" column.

### 3.8 Dashboard changes

- `railway-storage.js`: a `401` means the session expired. Pending changes stay
  in memory, and a banner says "You've been signed out — sign in again" with a
  link that opens `/login` in a new tab. When the user returns, the pending
  saves are retried, so no edits are lost. A `403` shows "Your role can't make
  this change".
- Header: the signed-in user's name, a role badge, "Account" and "Sign out".
- `src/login.html`, built by `tools/build.py` with the same template CSS and
  logo, so the sign-in page matches the dashboard.

### 3.9 Migration from the shared login (no lock-out)

1. Deploy with both logins working. If `users` is empty at startup, an admin is
   created from `ADMIN_EMAIL` plus the existing `DASHBOARD_PASSWORD`, and that
   admin must change the password on first sign-in.
2. The admin invites every staff member. Basic auth stays accepted for 7 days
   behind `LEGACY_BASIC_AUTH=1`, and every use is logged.
3. Turn off `LEGACY_BASIC_AUTH`, then delete `DASHBOARD_USERNAME` and
   `DASHBOARD_PASSWORD` from Railway.
4. Rollback: redeploy the previous Railway deployment. The new tables are
   additive, and the `classrooms` table and its format are unchanged.

## 4. Backend improvements

1. **Migrations**: `migrations/NNN_name.sql` files are applied in order at
   startup inside a transaction and recorded in a `schema_migrations` table. A
   Postgres advisory lock makes sure only one process runs them. This replaces
   the ad-hoc code in `initialise()`.
2. **Connection pool**: `psycopg_pool.ConnectionPool(min_size=1, max_size=4)`,
   matched to Gunicorn's 4 threads.
3. **History and audit**: every successful `PUT`/`DELETE` also writes
   `classroom_history` and `audit_log` in the same transaction. Admins get a
   "History" view with a "Restore this version" action, which saves the old
   revision as a new one. History is kept for 1 year and then pruned (Q4).
4. **Module layout**: split `server.py` into `app/__init__.py` (factory),
   `app/db.py`, `app/auth.py`, `app/classes.py`, `app/admin.py` and
   `app/security.py`. Keep `create_app()` as the Gunicorn entry point.
5. **Security headers**: add `Strict-Transport-Security: max-age=31536000`.
   Move the dashboard script into a served `.js` file so the CSP can drop
   `'unsafe-inline'` from `script-src` (`style-src` can keep it for now).
   Replace inline `onclick=` attributes.
6. **XSS audit**: review all 22 `innerHTML` assignments in `src/page.html`.
   Make `esc()` also escape `'`, or switch the riskiest ones (student and
   teacher names, classroom names, memo text) to `textContent` and DOM nodes.
   Add a test that uploads a CSV containing `<img src=x onerror=…>` and `'"`
   in every field.
7. **Structured logs**: JSON lines with request ID, user ID, route, status and
   duration, with no student data in logs.
8. **Docker**: run as a non-root user, add a `HEALTHCHECK`, pin the base image
   digest, and add `--no-compile`/`--require-hashes` installs (hashes from
   `pip-compile`).
9. **Dependencies**: add `argon2-cffi`, `psycopg_pool` and, in phase 5, `pyotp`.
   Pin with hashes in `requirements.txt`, generated from `requirements.in`.

## 5. Railway changes

These are made with the Railway tools in this session. Destructive steps are
confirmed with you first.

| Step | Action | When |
| --- | --- | --- |
| R1 | Delete the `safar-one-off-import` service. Its migration ran, it holds a `DATABASE_URL`, and it does nothing else. | Phase 0 |
| R2 | Enable backups on `postgres-volume` (daily, keep ≥ 7) in the Postgres service's **Backups** tab, if the plan includes it. | Phase 0 |
| R3 | Add a nightly `pg_dump` cron (Railway Function) to a Railway bucket, keeping 30 days, as a second, logical backup copy. | Phase 1 |
| R4 | Add a project webhook for Deployment failed, crashed and OOM, sent to an email-to-webhook, Slack or Discord channel (Q5). | Phase 0 |
| R5 | Create a `staging` environment with its own Postgres, deploying a `staging` branch, and seed it with fake data. | Phase 1 |
| R6 | Turn on **Wait for CI** (`checkSuites`) so `main` deploys only after the GitHub Actions checks pass. | Phase 1 |
| R7 | Add `SECRET_KEY` (random, 64 bytes) and `ADMIN_EMAIL` variables. Remove `DASHBOARD_*` after cutover. | Phase 3 |
| R8 | Set the service builder to Dockerfile in settings, to match `railway.json` (G15). | Phase 1 |
| R9 | Confirm `DATABASE_URL` references the private `DATABASE_URL`, not `DATABASE_PUBLIC_URL`. | Phase 0 |
| R10 | Optional: a custom domain (for example `dashboard.<school domain>`) with Railway's managed TLS (Q6). | Any |
| R11 | Do a restore drill: restore last night's dump into staging and open the dashboard. Repeat each term. | Phase 2 |

Keep **1 replica**. With sessions in Postgres it is safe to add more later, but
not needed.

## 6. GitHub changes

| Step | Action |
| --- | --- |
| H1 | `.github/workflows/ci.yml` on PR and push. Lint with `ruff`. Run `unittest` against SQLite and against a Postgres 18 service container. Fail if `python tools/build.py` changes any tracked file. Run `pip-audit`. |
| H2 | Branch protection on `main`: require a PR and require CI to pass, no force pushes or deletions. |
| H3 | `.github/dependabot.yml` for pip, GitHub Actions and Docker, weekly. |
| H4 | Turn on secret scanning and push protection, plus CodeQL (Python and JavaScript) if the plan allows it for private repositories. |
| H5 | Delete the merged or stale branch `claude/surah-passes-school-year` after checking it is merged. |
| H6 | Add `SECURITY.md` (how to report a problem) and a PR template with a "touches student data?" checkbox. |
| H7 | Give each person who manages the code their own GitHub and Railway account with 2FA, invited as collaborators, instead of everyone sharing `mysafaradmin` (G16). |

## 7. Data protection (UK GDPR)

- Record what is held (student names, IDs, gender, school year, progress), why,
  and who can see it. A one-page record of processing and a short DPIA are
  enough at this scale.
- Railway region: the services run in `iad` (US East). Children's data stored
  outside the UK needs a transfer basis. Consider moving to Railway's EU West
  (Amsterdam) region (Q7). Moving means a dump and restore into a new Postgres.
- Retention: delete students who left more than N years ago, and prune
  `audit_log` and `classroom_history` after 1 year (Q4).
- Access reviews each term: the admin page lists users and their last sign-in.
  Disable leavers the same day.
- Export: admins can download a classroom's records (the existing JSON format)
  for subject-access requests.

## 8. Phases and order

Each phase is one PR into `main`, through staging first from phase 1 on.

| Phase | Contents | Size |
| --- | --- | --- |
| **0 — Hygiene (today, no code)** | R1, R2, R4, R9, H5, H7 | ~1 hour |
| **1 — Safe delivery** | H1–H4, H6, R3, R5, R6, R8, fix `RAILWAY.md` (G14) | 1 PR |
| **2 — Backend groundwork** | Migrations, connection pool, `classroom_history` and `audit_log` (logged as "shared login" for now), HSTS, non-root Docker, module split, restore drill R11 | 1–2 PRs |
| **3 — Sign-in page and accounts** | §3.2–3.6, §3.8, the user admin page, migration steps 1–2, R7 | 2 PRs (backend, then UI) |
| **4 — Roles and cutover** | §3.7 enforcement, history/restore UI, migration step 3 (remove the shared login) | 1 PR |
| **5 — Hardening** | XSS audit and CSP without `unsafe-inline` (§4.5–4.6), TOTP 2FA for admins, optional Google/Microsoft sign-in, optional email for invites, retention jobs, region move if chosen | 2–3 PRs |

Phases 0–2 can start immediately and do not depend on the open questions. The
answers to Q1–Q3 are needed before phase 3.

## 9. Testing

- Unit tests for each new route, covering:
  - wrong password, unknown email, and that the timing is the same for both
  - lockout and unlock
  - expired, used and reused invite and reset tokens
  - session idle and absolute expiry, logout, logout-everywhere
  - role enforcement on every write
  - `next=` open-redirect attempts
  - CSRF missing or mismatched
  - legacy Basic auth on and off
- The existing 16 tests keep passing, rewritten to sign in via a session
  instead of Basic auth.
- A Playwright smoke test in CI. It signs in, records a pass, signs out, and
  checks that an expired session keeps unsaved changes and retries after
  signing in again.
- Manual checks on staging before each production deploy:
  - phone and desktop
  - two browsers editing the same class
  - a CSV upload with hostile strings

## 10. Open questions for you

- **Q1. Sign-in method:** do all staff have school Google Workspace or
  Microsoft 365 accounts? If yes, "Sign in with Google/Microsoft" can be the
  main method, with passwords as a fallback.
- **Q2. Email:** should invite and reset links be emailed automatically? This
  needs a provider such as Resend or Postmark and a sending domain. The
  alternative is admins copying the links.
- **Q3. Teacher scope:** should teachers see and edit every classroom, as today,
  or only their own?
- **Q4. Retention:** how long should audit and history records, and records of
  students who have left, be kept?
- **Q5. Alerts:** where should deploy and crash alerts go (email, Slack,
  Discord, WhatsApp via a bridge)?
- **Q6. Domain:** is there a school domain to put the dashboard on?
- **Q7. Region:** move the Railway services from US East to EU West?
