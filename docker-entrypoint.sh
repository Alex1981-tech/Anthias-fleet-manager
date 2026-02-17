#!/bin/bash
set -e

echo "Waiting for database..."
while ! python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'fleet_manager.settings')
django.setup()
from django.db import connection
connection.ensure_connection()
" 2>/dev/null; do
    echo "Database unavailable, waiting 2s..."
    sleep 2
done
echo "Database ready!"

# Only run migrations and collectstatic for the web (gunicorn/daphne) container
if [[ "$1" == "gunicorn" || "$1" == "daphne" ]]; then
    echo "Running migrations..."
    python manage.py migrate --noinput

    echo "Collecting static files..."
    python manage.py collectstatic --noinput
fi

exec "$@"
