#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py seed_games
if [ "$DJANGO_DEBUG" != "True" ]; then
  python manage.py collectstatic --noinput
fi

exec "$@"
