#!/bin/sh
# 單一容器的啟動流程：準備資料庫 → nginx（背景）→ gunicorn（前景，掛掉時容器會重啟）
set -e

PORT="${PORT:-10000}"
# 沿用 frontend/nginx.conf，只把對外埠號換成平台指定的 PORT、後端位址換成同容器的 gunicorn
sed -e "s/listen 80;/listen ${PORT};/" -e "s#http://backend:8000#http://127.0.0.1:8000#g" \
  /etc/nginx/site.conf.template > /etc/nginx/conf.d/default.conf

python manage.py migrate --noinput
python manage.py seed_games
python manage.py collectstatic --noinput

nginx
# 免費方案記憶體只有 512 MB，開兩個 worker
exec gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 2 --timeout 60
