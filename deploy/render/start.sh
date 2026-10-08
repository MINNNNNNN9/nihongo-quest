#!/bin/sh
# 單一容器的啟動流程：準備資料庫 → nginx（背景）→ gunicorn（前景，掛掉時容器會重啟）
# 靜態檔在建置映像時就收集好了（見 Dockerfile），啟動時不必再做
set -e

PORT="${PORT:-10000}"
# 沿用 frontend/nginx.conf，只把對外埠號換成平台指定的 PORT、後端位址換成同容器的 gunicorn
sed -e "s/listen 80;/listen ${PORT};/" -e "s#http://backend:8000#http://127.0.0.1:8000#g" \
  /etc/nginx/site.conf.template > /etc/nginx/conf.d/default.conf

# 沒有新的 migration 時跳過 migrate（它會額外做幾十次查詢，資料庫在遠端時很慢）
python manage.py migrate --check >/dev/null 2>&1 || python manage.py migrate --noinput
python manage.py seed_games

nginx
# 免費方案記憶體只有 512 MB：兩個 worker，各開幾條執行緒，等資料庫回應時還能處理其他人的請求
exec gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 2 --threads 6 --timeout 60
