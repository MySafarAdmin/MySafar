# Deploy the Safar dashboard on Railway

The Railway version adds a Flask/Gunicorn web server, a browser
username/password prompt, and shared class records stored in Railway
PostgreSQL. All signed-in staff use the same login and can edit every class.
The HTML files can still be used in Claude or opened locally with their
original storage behaviour.

## Connect the repository

1. In Railway, create a project/service using **Deploy from GitHub repo**, then
   select `raedeifan-oss/supreme-octo-succotash`. If the private repository is
   absent, its owner may need to grant the Railway GitHub app access to it.
2. Select the branch containing these changes (`claude/brave-mayer-pzforz`).
   Leave the root directory as `/`.
3. Add a **PostgreSQL** database to the same project (**+ Create → Database →
   PostgreSQL**). Leave the database's own volume and mount path as Railway set
   them up.
4. Open the **dashboard** service (not the database) and enter the variables
   below. The dashboard service does not need a volume. Keep **one replica**.
5. Deploy. Railway uses the `Dockerfile` and `railway.json` automatically. Leave
   custom Build and Start commands empty. Healthcheck: **`/healthz`**.
6. Go to **Settings → Networking → Public Networking → Generate Domain**.
   Set the target port to **`8080`**.
7. Open the generated HTTPS URL and enter your dashboard username and password.

## Variables for the dashboard service

Paste these into the dashboard service's **Variables → Raw Editor**:

```dotenv
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
DASHBOARD_USERNAME=safar
DASHBOARD_PASSWORD=replace-with-a-long-unique-password
```

- `DATABASE_URL` is a reference to the PostgreSQL service's own connection
  address, so no database password is copied by hand. `Postgres` is the name of
  the database service on the project canvas; if yours is named differently,
  use that name, or pick it with **Add Variable Reference**.
- Replace `DASHBOARD_PASSWORD` with your own long, unique password. The example
  placeholder is deliberately rejected at startup. You may also change
  `DASHBOARD_USERNAME`; it must not contain a colon. Do not commit your real
  password. These are server variables and are never embedded in the page.
- `DATA_DIR` is not used when `DATABASE_URL` is set. Remove it, and remove any
  volume you attached to the dashboard service for it.
- No Node variables, API key, or Railway token is required.

| Setting | Value |
| --- | --- |
| Internal application address | `0.0.0.0:8080` with the variables above |
| Networking target port | `8080` |
| Public browser URL | `https://<your-generated-domain>.up.railway.app` |
| Public HTTPS port | `443`, handled by Railway automatically |
| Healthcheck | `/healthz` |
| Records | table `classrooms` in the PostgreSQL service, one row per classroom |

Do not add `:8080` to the public HTTPS URL. Railway terminates HTTPS and
forwards the request to the application's internal HTTP port. If you choose a
different `PORT`, change the domain's target port to match. If you omit `PORT`,
the server uses the value supplied by Railway; locally it defaults to `8080`.

If the dashboard service starts without `DATABASE_URL`, it stops with
"Set DATABASE_URL to your PostgreSQL service's DATABASE_URL" rather than
saving student records on Railway's temporary disk.

## Records, migration, and backups

- The first startup creates an empty `classrooms` table. Classrooms and
  students are added from the dashboard by uploading a CSV (see README.md).
  Later startups and redeploys keep everything that has been added.
- A `classes` table from the earlier version of the dashboard, which shipped
  with fixed classes, is deleted at startup.
- Changes are shared across devices. Open dashboards refresh every 10 seconds
  when visible. A class being typed into is not replaced mid-edit. Conflicting
  saves are rejected so an older browser cannot overwrite newer records. The
  page lets you download its unsaved changes before reloading; reconcile that
  file manually with the latest records.
- Wait for **All changes saved online** before closing a tab. Failed saves
  stay in the tab's memory and can be retried/downloaded. The Railway page does
  not cache student records in browser localStorage.
- Back up the PostgreSQL service: enable backups on its volume in Railway, or
  run `pg_dump` against its connection URL. Deleting the database service or
  its volume deletes the live records. Redeploying or deleting the dashboard
  service does not touch them.
- `/healthz` exposes only service health. The page, script, and records require
  authentication; source files and the database are not served.
  The shared staff login does not provide individual staff roles or audit logs.

## Run and verify locally

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export DASHBOARD_USERNAME=safar
export DASHBOARD_PASSWORD='your-local-test-password'
export PORT=8080
# Either point at a PostgreSQL database...
export DATABASE_URL=postgresql://user:password@localhost:5432/safar
# ...or leave DATABASE_URL unset to keep records in a local SQLite file:
# export DATA_DIR=.local-data
.venv/bin/gunicorn --config gunicorn.conf.py 'server:create_app()'
```

Open `http://localhost:8080` and use the browser login prompt. `.env.example`
documents the variables; the server does not automatically load `.env` files.

```sh
python3 tools/build.py
.venv/bin/python -m unittest -v test_server
# Also run the tests against PostgreSQL. They work in a temporary schema
# that is dropped afterwards, so existing tables are not touched.
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/safar .venv/bin/python -m unittest -v test_server
```

Rebuild the two generated HTML files after editing `src/page.html`. The Docker
image uses the checked-in standalone page, so commit the generated files too.

Railway references: [GitHub deployments](https://docs.railway.com/deployments/github-autodeploys),
[PostgreSQL](https://docs.railway.com/databases/postgresql),
[variable references](https://docs.railway.com/variables#referencing-another-services-variable),
[public networking](https://docs.railway.com/networking/public-networking), and
[healthchecks](https://docs.railway.com/deployments/healthchecks).
