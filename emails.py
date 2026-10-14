"""The dashboard's emails: what each one says, rendered from templates/email/.

Each email has an HTML part (templates/email/<name>.html, built on _layout.html)
and a plain-text part (<name>.txt) with the same words. Subjects are here.

| Email            | Sent when                                                               |
| ---------------- | ----------------------------------------------------------------------- |
| invite           | An admin invites someone, or sends a new invite to someone who never    |
|                  | accepted theirs; also from "Forgotten your password?" in that case.      |
| reset            | Someone asks for a reset link, or an admin sends one.                   |
| password_changed | A password is changed on the Account page or with a reset link.         |
| test             | An admin sends a test email from Manage users.                          |

PREVIEWS holds sample details for each email, for the admin preview pages and the tests.
"""
import time

from flask import current_app, render_template

import auth  # auth imports this module too; only use auth's names inside functions

SUBJECTS = {
    "invite": "You're invited to the Safar Academy dashboard",
    "reset": "Reset your Safar Academy dashboard password",
    "password_changed": "Your Safar Academy dashboard password was changed",
    "test": "Test email from the Safar Academy dashboard",
}
TAGS = {"invite": "invite", "reset": "password_reset", "password_changed": "security", "test": "test"}


def hours(n):
    return f"{n} hour{'s' if n != 1 else ''}"


def render(template, **context):
    """Returns (subject, text, html) for one email. The context's `name` is the recipient's name."""
    context = dict(context, site=auth.public_url("/"), logo=auth.public_url("/logo.png"),
                   signin=auth.public_url("/login"), forgot=auth.public_url("/forgot"),
                   support_email=current_app.config.get("SUPPORT_EMAIL", ""),
                   invite_hours=hours(auth.INVITE_TTL // auth.HOUR), reset_hours=hours(auth.RESET_TTL // auth.HOUR))
    return (SUBJECTS[template], render_template(f"email/{template}.txt", **context).strip() + "\n",
            render_template(f"email/{template}.html", **context))


def send(template, to, background=False, **context):
    """Returns True when the email was sent (or, with background=True, a send was started)."""
    mailer = current_app.config["MAILER"]
    if not mailer.enabled:
        return False
    subject, text, html = render(template, **context)
    return mailer.send(to, subject, text, html=html, tag=TAGS[template], background=background)


# Sample details for previews. Names are made up.
PREVIEWS = {
    "invite": lambda: {"name": "Sr Maryam", "email": "maryam@example.com", "role": "teacher", "by": "Br Ahmed",
                       "rooms": ["Yr3-A-QM-Sr Maryam", "Yr4-B-QM-Sr Maryam"],
                       "link": auth.public_url("/invite/example-link")},
    "reset": lambda: {"name": "Sr Maryam", "email": "maryam@example.com", "by": None,
                      "link": auth.public_url("/reset/example-link")},
    "password_changed": lambda: {"name": "Sr Maryam", "email": "maryam@example.com", "how": "reset",
                                 "at": int(time.time())},
    "test": lambda: {"name": "Br Ahmed", "email": "ahmed@example.com", "at": int(time.time())},
}
