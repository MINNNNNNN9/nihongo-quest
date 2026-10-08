# 建置內容（context）是 repo 根目錄，因為要取用 scratch-games/ 裡的遊戲檔。
FROM node:20-alpine AS deps
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- 開發：Vite dev server（docker-compose.yml 使用）---
FROM deps AS dev
COPY scratch-games /app/scratch-games
COPY frontend ./
RUN npm run sync-assets
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0"]

# --- 正式：編譯後交給 nginx ---
FROM dev AS build
RUN npm run build

FROM nginx:1.27-alpine AS prod
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
