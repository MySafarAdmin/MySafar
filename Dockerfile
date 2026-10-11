FROM python:3.13-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py gunicorn.conf.py railway-storage.js Master_Dashboard_standalone.html ./

EXPOSE 8080
CMD ["gunicorn", "--config", "gunicorn.conf.py", "server:create_app()"]
