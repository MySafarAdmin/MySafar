# Deploy the Safar dashboard on Railway

The Railway version is a Flask/Gunicorn web server with a sign-in page, staff
accounts and shared class records in Railway PostgreSQL. The HTML files can
still be used in Claude or opened locally with their original storage
behaviour.

Current setup: project **triumphant-renewal**, service **MySafar** (deploys the
`main` branch of `MySafarAdmin/MySafar`) and service **Postgres**.

## Accounts and access

- The first page is the sign-in page. Everyone signs in with their own email
  and password.
- **Administrators** see and edit every classroom, upload CSVs, create and
  delete classrooms, and manage accounts (**Manage users**), the **Class
  history** and the **Activity** log.
- **Teachers** see and edit only the classrooms an administrator has ticked
  for them on **Manage users**. They can't upload CSVs, create classrooms or
  delete them. The server enforces this; the page only hides the buttons.
- New staff are invited from **Manage users**. They get a link (by email when
  email is set up, otherwise the admin copies it) to choose a password. Invite
  links expire after 72 hours, reset links after 1 hour; each works once.
- Forgotten passwords: **Forgotten your password?** on the sign-in page emails
  a reset link. An admin can also make one from **Manage users**
  (**Send password reset link**). Passwords are stored only as argon2 hashes,
  so nobody, admins included, can see one. The person's old password keeps
  working until they use the link, which then signs them out everywhere else.
- Invite and reset tokens are replaced with `[hidden]` in the request and
  error logs, so the Railway logs can't be used to take over an account.
- Turning off an account signs that person out everywhere at once.
- Sign-in is limited to 5 wrong passwords per email and 20 per IP address in
  15 minutes. Sessions end after 8 hours without use, and after 12 hours (or 30
  days with "Keep me signed in").

## Variables for the MySafar service

| Variable | Value |
| --- | --- |
| `PORT` | `8080` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ADMIN_EMAIL` | The first administrator's email. Used only when there are no accounts yet. |
| `DASHBOARD_PASSWORD` | The first administrator's setup password. Used only when there are no accounts yet; they must choose a new one at first sign-in. Delete it from Railway once they have. |
| `RESEND_API_KEY` | API key from [Resend](https://resend.com) for invite and reset emails. Optional. |
| `MAIL_FROM` | The sender, for example `Safar Dashboard <dashboard@safaracademy.org>`. Its domain must be verified in Resend. |
| `MAIL_REDIRECT_TO` | Testing only: every email goes to this address instead of the real recipient. Remove it to go live. |
| `PUBLIC_URL` | The site's address, used in invite and reset links: `https://mysafar-prod.up.railway.app`. Change it if the address changes (for example a custom domain). |
| `RETENTION_DAYS` | How long class history and the activity log are kept. Default `14`. |

`DASHBOARD_USERNAME` is no longer used and can be deleted.

Railway's Hobby plan blocks outbound SMTP, so email is sent over HTTPS
through Resend. Without `RESEND_API_KEY` and `MAIL_FROM` everything still
works; admins copy invite and reset links from **Manage users**.

## Records, history and backups

- Each classroom is a row of `classrooms`. Accounts, sessions and the history
  live in other tables of the same database (see `db.py`).
- Database changes are numbered migrations in `db.py`, applied once each at
  startup and recorded in `schema_migrations`. They only add tables; existing
  classroom records are left as they are.
- Every save is kept in **Class history** for `RETENTION_DAYS`. Saves by the
  same person within 15 minutes share one entry. An admin can restore any
  version, or bring back a deleted classroom (teachers then need to be ticked
  for it again).
- Back up the database too: turn on scheduled backups in the Postgres service's
  **Backups** tab. Deleting the Postgres service or its volume deletes the live
  records. Redeploying or deleting the MySafar service does not.

## Run and verify locally

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export ADMIN_EMAIL=you@example.com DASHBOARD_PASSWORD='a-local-setup-password'
export COOKIE_SECURE=0   # plain http://localhost; never set this on Railway
export PORT=8080
# Either point at a PostgreSQL database...
export DATABASE_URL=postgresql://user:password@localhost:5432/safar
# ...or leave DATABASE_URL unset to keep records in a local SQLite file in .local-data
.venv/bin/gunicorn --config gunicorn.conf.py 'server:create_app()'
```

```sh
python3 tools/build.py
.venv/bin/python -m unittest -v test_server
# Also run the tests against PostgreSQL. They work in a temporary schema
# that is dropped afterwards, so existing tables are not touched.
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/safar .venv/bin/python -m unittest -v test_server
```

GitHub Actions runs the same tests on every pull request and push to `main`
(`.github/workflows/ci.yml`).
