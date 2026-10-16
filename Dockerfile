FROM python:3.13-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py auth.py db.py mailer.py emails.py tv.py cleanup.py export.py helpdesk.py gunicorn.conf.py railway-storage.js Master_Dashboard_standalone.html ./
COPY templates ./templates
COPY static ./static
COPY src/logo.b64 src/tokens.css ./src/
# Run without root privileges.
RUN useradd --system --no-create-home --uid 10001 app
USER app

EXPOSE 8080
CMD ["gunicorn", "--config", "gunicorn.conf.py", "server:create_app()"]
