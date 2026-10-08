# 單一容器版：nginx（前端靜態檔＋反向代理）和 gunicorn（Django）跑在同一個容器裡。
# 給 Render 這類「一個服務一個容器」的平台用；資料庫使用外部的託管 PostgreSQL（DATABASE_URL）。
# 建置內容（context）是 repo 根目錄。本機測試：
#   docker build -f deploy/render/Dockerfile -t nihongo-quest-render .
#   docker run --rm -p 10000:10000 -e DJANGO_SECRET_KEY=... -e DATABASE_URL=postgresql://... nihongo-quest-render

FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY scratch-games /app/scratch-games
COPY frontend ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 DJANGO_DEBUG=False
RUN apt-get update && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend ./
COPY --from=frontend /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/site.conf.template
COPY deploy/render/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 10000
CMD ["/start.sh"]
