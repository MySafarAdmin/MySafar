import os
import re

from gunicorn.glogging import Logger

bind = "0.0.0.0:" + os.environ.get("PORT", "8080")
workers = 1
threads = 4
timeout = 30
accesslog = "-"
errorlog = "-"

# Invite and reset links carry a one-time token in the path. Railway keeps these logs, so the token is
# hidden wherever it appears in a log line: the request line, the path, and the Referer of pages it loads.
# Keep in step with auth.hide_link_tokens, which does the same for the app's own error log.
LINK_TOKEN = re.compile(r"(/(?:invite|reset)/)[^/?#\s\"]+")


class HideLinkTokens(Logger):
    def atoms(self, resp, req, environ, request_time):
        atoms = super().atoms(resp, req, environ, request_time)
        return {k: LINK_TOKEN.sub(r"\1[hidden]", v) if isinstance(v, str) else v for k, v in atoms.items()}


logger_class = HideLinkTokens
