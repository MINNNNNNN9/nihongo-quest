# 部署

## 環境變數

全部寫在 repo 根目錄的 `.env`（由 `.env.example` 複製；`.env` 不進版控）。

| 變數 | 說明 | 正式環境 |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Django 金鑰，沒有預設值 | **必填**，用 `python -c "import secrets; print(secrets.token_urlsafe(60))"` 產生 |
| `DJANGO_DEBUG` | 開發為 `True` | `docker-compose.prod.yml` 會強制為 `False` |
| `DJANGO_ALLOWED_HOSTS` | 允許的 Host，逗號分隔 | 填你的網域 |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 允許的來源，需含協定 | 例 `https://quest.example.com` |
| `POSTGRES_DB`／`USER`／`PASSWORD`／`HOST`／`PORT` | 資料庫連線 | 密碼務必更換 |
| `DJANGO_SECURE_SSL_REDIRECT` | 預設 `True`（非 DEBUG 時把 HTTP 轉到 HTTPS） | 只有本機用 HTTP 測試正式映像時設 `False` |
| `DJANGO_HSTS_SECONDS` | 預設一年 | 首次上線可先設小一點 |
| `THROTTLE_*` | 限流，見 `docs/api.md` | 視流量調整 |
| `FRONTEND_PORT`／`BACKEND_PORT`／`WEB_PORT` | 對外埠號 | |

`DEBUG=False` 時自動啟用：Secure Cookie、HSTS、`X-Content-Type-Options`、依 `X-Forwarded-Proto` 判斷 HTTPS。

## 開發環境

```bash
cp .env.example .env
docker compose up --build
```

- 前端 <http://localhost:5173>、API 文件 <http://localhost:5173/api/docs/>、後台 <http://localhost:5173/admin/>
- 後端容器啟動時會自動執行 `migrate` 與 `seed_games`（建立遊戲、12 個關卡、75 題）。
- 建立後台管理員：`docker compose exec backend python manage.py createsuperuser`

常用指令：

```bash
docker compose exec backend python manage.py makemigrations   # 改了 models 之後
docker compose exec backend python manage.py migrate
docker compose run --rm --entrypoint "" backend pytest         # 後端測試
cd frontend && npm install && npm test && npm run typecheck    # 前端測試
```

## 正式環境（單機 Docker）

```bash
cp .env.example .env        # 改 SECRET_KEY、資料庫密碼、ALLOWED_HOSTS、CSRF_TRUSTED_ORIGINS
docker compose -f docker-compose.prod.yml up -d --build
```

| 服務 | 內容 |
| --- | --- |
| `web` | nginx：提供編譯後的前端與遊戲檔，`/api`、`/admin`、`/static` 反向代理到 backend；設定 CSP 等安全標頭 |
| `backend` | gunicorn（3 workers）；啟動時 `migrate`、`seed_games`、`collectstatic` |
| `db` | PostgreSQL 16，資料存在 `pgdata` volume |

`web` 只聽 HTTP（預設 `8088` 埠）。**HTTPS 必須由它前面的服務終止**，並轉送 `X-Forwarded-Proto: https`，例如：

- 雲端平台的負載平衡器／託管憑證；
- 或主機上的 Caddy：`quest.example.com { reverse_proxy localhost:8088 }`（自動申請 Let's Encrypt 憑證）。

更新版本：`git pull && docker compose -f docker-compose.prod.yml up -d --build`（migration 會自動套用）。

備份：

```bash
docker compose -f docker-compose.prod.yml exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F).sql.gz
```

## 部署到雲端平台

映像是標準 Docker，以下平台都能用；共同重點是「前端與 API 要在同一個網域下」（驗證採同源 Cookie）。

| 平台類型 | 做法 |
| --- | --- |
| 一台雲端 VM（GCP Compute Engine、AWS EC2／Lightsail、Azure VM…） | 安裝 Docker，照上面「單機 Docker」＋ Caddy。最簡單，建議第一次部署用這個 |
| 容器平台（Render、Railway、Fly.io、Cloud Run…） | `web` 與 `backend` 各一個服務，資料庫改用平台的託管 PostgreSQL（設定 `POSTGRES_HOST` 等變數並移除 `db` 服務）；`frontend/nginx.conf` 裡的 `backend:8000` 改成平台的內部位址 |

多個 backend 實例時要注意：限流計數目前放在各行程的記憶體快取，需改用共用的 Redis
（設定 Django `CACHES`）才會跨實例準確。

## CI

`.github/workflows/ci.yml` 在每次 push／PR 執行：

1. **backend**：PostgreSQL 服務容器 → `makemigrations --check` → `pytest`
2. **frontend**：`npm ci` → `typecheck` → `vitest` → `build`
3. **docker**：建置正式映像

目前只有 CI（測試與建置），沒有自動部署（CD）；決定好雲端平台後可再加上。

## 上線前檢查

- [ ] `DJANGO_SECRET_KEY`、`POSTGRES_PASSWORD` 已換成隨機值
- [ ] `DJANGO_ALLOWED_HOSTS`、`DJANGO_CSRF_TRUSTED_ORIGINS` 只列出自己的網域
- [ ] 全站 HTTPS，且代理有送 `X-Forwarded-Proto`
- [ ] `docker compose -f docker-compose.prod.yml exec backend python manage.py check --deploy` 沒有嚴重警告
- [ ] 已建立資料庫備份排程
- [ ] 確認遊戲素材的授權：`.sb3` 內含原 Scratch 專案的圖片與音效，公開營運前請確認第三方素材的使用條件
