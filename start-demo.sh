#!/bin/sh
# Entrypoint of the single-container demo image.
# With PostgreSQL (e.g. a Render database) the schema is managed by Alembic;
# with the default SQLite file the app creates tables itself.
set -e
case "$DATABASE_URL" in
  postgres*) alembic upgrade head ;;
esac
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
