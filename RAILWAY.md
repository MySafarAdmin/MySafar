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
  15 minutes. Closing the app signs you out: the sign-in cookie ends with the
  browser, and the server ends a sign-in 20 minutes after the dashboard was last
  open (an open dashboard checks in, even in a background tab), and after 12
  hours at most. There is no "Keep me signed in".

## TV dashboard

A TV in the admin area can show a live dashboard without anyone signing in on
it. An administrator opens **TV screens**, names the TV and makes a link, then
opens that link on the TV once and leaves it open. The link works on its own
and shows only the dashboard: it can't open the classrooms or change anything.
**Turn off link** stops it within a minute (the TV then shows a message); make
a new one if a link is lost or seen by someone it shouldn't be.

The dashboard changes slide every 30 seconds and updates every minute. Each
slide is a flat cartoon still from an Islamic place or story, kept moving: the
Kaaba in Makkah as it was in the Prophet's time (an open valley ringed by
mountains, people going round the Kaaba, the well of Zamzam, mud-brick houses
with washing tied out on the lines), Masjid an-Nabawi with its umbrellas opening
and closing, Masjid al-Aqsa and the Dome of the Rock, Cave Hira on Jabal al-Nour
under shooting stars, Cave Thawr with the spider's web and the dove's nest, the
Ark of Nuh after the flood, the sea parting for Musa, and the splitting of the
moon. Washing, palms, cypresses and the web move in a gusty wind with a little
physics and the Ark floats on the swell. House points is a festival with bunting
and fireworks. The podium steps rise in order: first, then second, then third.

Classes are shown by year group, class letter and teacher, with the title in
full: Sr, Sister, Ustadha and Mrs/Ms/Miss become Ustadha, every other title (Br,
Ustd...) Ustadh. `Yr3-A-QM-Br Faeez` shows as "Yr3A Ustadh Faeez", on the TV,
the Presenter and the dashboard (the stored name is unchanged, so Rename and the
CSV upload still use it). On the top-class podiums the teacher's name is the big
line and "Yr3A" sits under it.

- **Memorisation passes** is one board with the top three ranks: a band for
  each with everyone tied on it, in boxes of the same size. If they don't all
  fit, the board stays on first place for a while, moves on to second, then
  slowly through third, reaching the bottom 29 seconds in.
- **Podiums** (the top three totals this month; ties share a step): Qaidah
  levels passed (Quran level tests on the Record page), and the top classes for
  Qaidah and for memorisation, primary (Years 1 to 6) and secondary (Year 7
  onwards) separately. A class's stage comes from its name (`Yr7-...`),
  otherwise from most of its students' Safar or school year groups.
- **Stars of the week**: one page with each class's star for last week. A star
  is the teacher's pick on the Quran tab, otherwise the student with the most
  passes and merits that week.
- **Book passes** (red tokens this month) take turns a page at a time.
- **House points** comes last: a podium of all three houses with their rank,
  points and a black silhouette logo (the Kaaba for Makkah, Masjid an-Nabawi
  for Madinah, the Dome of the Rock for Al-Aqsa), at a festival.

Empty slides are skipped. **Settings** on each TV sets a daily time for
Qaidah slides only and one for Memo slides only (London time; a window can run
past midnight). Outside those times the TV plays every slide.

Students are shown by first name and surname initial (`Aisha K.`) with their
classroom. Signed-in staff can preview it at `/tv`.

### Presenter

**Presenter**, at the top of a class, shows that class's month on the big screen in the
same scenes, with the class's students riding through by name (the TV has no riders). Teachers
can present their own classes and admins any class. Its slides are podiums for the best Quran average
(students with 3 or more scores this month), Qaidah levels, house points earned,
the class's house race (with the house logos) and merits; memorisation passes as the
TV's top-three board; book passes taking turns; and the month's stars of the
week on one page. **Full screen** and **Close** show when the mouse moves;
Close (or Escape) goes back to the class.

## Variables for the MySafar service

| Variable | Value |
| --- | --- |
| `PORT` | `8080` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ADMIN_EMAIL` | The first administrator's email. Used only when there are no accounts yet. |
| `DASHBOARD_PASSWORD` | The first administrator's setup password. Used only when there are no accounts yet; they must choose a new one at first sign-in. Delete it from Railway once they have. |
| `RESEND_API_KEY` | A sending-only API key from [Resend](https://resend.com), limited to `mysafar.org`. Optional. |
| `MAIL_FROM` | The sender: `Safar Academy <dashboard@mysafar.org>`. Its domain must be verified in Resend. |
| `MAIL_REPLY_TO` | Where replies to the emails go. Optional; defaults to `SUPPORT_EMAIL`. Without either, replies go to the sending address, which doesn't receive mail. |
| `MAIL_REDIRECT_TO` | Testing only: every email goes to this address instead of the real recipient. Remove it to go live. |
| `PUBLIC_URL` | The site's address, used in email links and for the logo in emails: `https://mysafar.org`. Change it if the address changes. |
| `RETENTION_DAYS` | How long class history and the activity log are kept. Default `14`. |
| `SUPPORT_EMAIL` | The school office address staff should write to for password help, for example `office@safaracademy.org`. The password pages show an **Email** button for it. Optional; without it they say to ask an administrator. |

`DASHBOARD_USERNAME` is no longer used and can be deleted.

## Email

Railway's Hobby plan blocks outbound SMTP, so email is sent over HTTPS
through Resend, from the verified domain `mysafar.org`. Without
`RESEND_API_KEY` and `MAIL_FROM` everything still works; admins copy invite
and reset links from **Manage users**.

| Email | Sent when |
| --- | --- |
| Invite | An admin invites someone or sends a new invite. It names the admin, the role and a teacher's classrooms. |
| Password reset | Someone uses **Forgotten your password?**, or an admin sends a reset link. |
| Password changed | A password is changed on **Account** or with a reset link: a security notice, so someone finds out if it wasn't them. |
| Test email | An admin presses **Send me a test email** on **Manage users**. |

Each email has a designed HTML part and a plain-text part with the same
words. The wording is in `templates/email/` and the subjects in `emails.py`.
The **Email** section at the bottom of **Manage users** shows whether email is
on and the sending address, and links to a preview of every email.

- Keep click tracking **off** for `mysafar.org` in Resend. It would rewrite
  the one-time links, and Resend would see them.
- Each send is tagged (`category: invite`, `password_reset`, `security`,
  `test`), so Resend's **Emails** page can be filtered by kind.
- A send that Resend refuses for being busy or briefly down is retried once,
  without risk of a duplicate. Failures are written to the MySafar service's
  logs as `Email to ... was not sent`.
- Reset requests are emailed from a background thread, so the page takes as
  long whether or not the email has an account.

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
- **Spreadsheet** in the admin menu downloads every class's records as an Excel
  workbook (`export.py`): a Summary sheet, then Students, Classes, Quran scores,
  Memo passes and fails, Level tests, Rewards, Stars of the week, Warnings and
  Staff, each with filters and a frozen header row. Only admins can open it,
  and each download is listed in **Activity**.
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
