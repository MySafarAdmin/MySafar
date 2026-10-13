"""Sends invite and password-reset emails through Resend's HTTPS API.

Railway blocks outbound SMTP on the Hobby plan, so mail goes over HTTPS.
Without RESEND_API_KEY and MAIL_FROM nothing is sent, and admins copy the link
from the Manage users page instead.

MAIL_REDIRECT_TO, when set, sends every email to that one address instead of
the real recipient. Use it while testing so that no staff member is emailed.
"""
import json
import urllib.error
import urllib.request


class Mailer:
    def __init__(self, api_key, sender, redirect_to=""):
        self.api_key = api_key
        self.sender = sender
        self.redirect_to = redirect_to

    @property
    def enabled(self):
        return bool(self.api_key and self.sender)

    def send(self, to, subject, text):
        """Returns True when the email was accepted for delivery."""
        if not self.enabled:
            return False
        if self.redirect_to:
            text = f"[Test mode: this email was meant for {to}]\n\n" + text
            to = self.redirect_to
        request = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps({"from": self.sender, "to": [to], "subject": subject, "text": text}).encode(),
            headers={"Authorization": "Bearer " + self.api_key, "Content-Type": "application/json",
                     "User-Agent": "safar-dashboard"},
            method="POST")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return 200 <= response.status < 300
        except (urllib.error.URLError, TimeoutError) as error:
            detail = error.read().decode(errors="replace")[:300] if isinstance(error, urllib.error.HTTPError) else str(error)
            print(f"Email to {to} was not sent: {detail}", flush=True)
            return False
