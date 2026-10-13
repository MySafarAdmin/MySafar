"""Build Master_Dashboard.html and Master_Dashboard_standalone.html.

Usage: python3 tools/build.py

Reads src/page.html, src/tokens.css (shared with the admin pages), src/template.css and src/logo.b64. The dashboard starts
with no classrooms; they are created by uploading a CSV on its Master page.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"


def build_page():
    page = (SRC / "page.html").read_text(encoding="utf-8")
    css = (SRC / "tokens.css").read_text(encoding="utf-8").rstrip() + "\n\n" + (SRC / "template.css").read_text(encoding="utf-8").rstrip()
    html = page.replace("/*TEMPLATE_CSS*/", css)
    html = html.replace("__LOGO__", (SRC / "logo.b64").read_text().strip())
    (ROOT / "Master_Dashboard.html").write_text(html, encoding="utf-8")
    # The artifact host adds the document skeleton at publish time; the
    # standalone copy carries its own so it opens directly in a browser.
    head, body = html.split("</style>\n", 1)
    (ROOT / "Master_Dashboard_standalone.html").write_text(
        '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + "</style></head><body>\n" + body + "</body></html>\n", encoding="utf-8")


if __name__ == "__main__":
    build_page()
