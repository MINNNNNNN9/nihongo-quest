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
| `DATABASE_URL` | 託管資料庫的連線網址；設定後取代 `POSTGRES_*` | Render 等平台使用 |
| `DJANGO_SUPERUSER_USERNAME`／`PASSWORD`／`EMAIL` | 啟動時若這個帳號不存在，就建立為超級管理員（已存在不會覆蓋密碼） | 沒有 Shell 的平台用它建立第一個管理員 |
| `BREVO_API_KEY` | Brevo 的 API 金鑰；設定後「找回密碼」才會寄信（走 HTTPS，不受免費方案擋 SMTP 的影響） | 選用 |
| `EMAIL_HOST`／`EMAIL_PORT`／`EMAIL_HOST_USER`／`EMAIL_HOST_PASSWORD`／`EMAIL_USE_TLS` | 改用 SMTP 寄信（沒有 `BREVO_API_KEY` 時） | 選用 |
| `DEFAULT_FROM_EMAIL` | 寄件者，例 `Nihongo Quest <you@example.com>`；用 Brevo 時必須是在 Brevo 驗證過的信箱 | 寄信時必填 |
| `FRONTEND_PORT`／`BACKEND_PORT`／`WEB_PORT` | 對外埠號 | |

`DEBUG=False` 時自動啟用：Secure Cookie、HSTS、`X-Content-Type-Options`、依 `X-Forwarded-Proto` 判斷 HTTPS。

## 管理後台

網址是 `/admin/`，用超級管理員登入（登入後網站右上角也會出現「後台」連結）。

- **建立老師帳號**：使用者 → 新增使用者，填帳號、電子郵件、密碼後儲存；在下一頁的「玩家資料」勾選「老師」。
  已經註冊的帳號可以在列表勾選後用動作「設為老師」。只有老師（與管理員）可以建立班級。
- **重設使用者密碼**：使用者 → 點進該帳號 → 密碼欄位下方的「這個表單」。
- **找回密碼**：登入頁的「忘記密碼？」會寄重設連結到註冊信箱，需要先設定寄信（見上表）；
  沒設定時頁面會請使用者聯絡管理員。

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

## 部署到 Render（免費方案）

不需要自己的主機，電腦關機也能用。整個網站跑在一個容器裡（`deploy/render/Dockerfile`：nginx＋gunicorn），
資料庫放在外部的託管 PostgreSQL。

> Render 自己的免費 PostgreSQL 建立 30 天後會到期並刪除資料，所以這裡改用 [Neon](https://neon.com) 的免費方案。

1. **建立資料庫**：在 Neon 註冊 → 建立 Project（Region 選 Singapore）→ 複製 **Connection string**
   （`postgresql://…?sslmode=require` 開頭的那一串，含密碼）。
2. **建立服務**：在 [Render](https://render.com) 註冊並連結 GitHub → **New → Blueprint** → 選這個 repo 與要部署的分支。
   Render 會讀取根目錄的 `render.yaml`，並要求輸入 `DATABASE_URL`，貼上第 1 步的連線網址。
3. 等第一次建置完成（約 5～10 分鐘），網址是 `https://<服務名稱>.onrender.com`。
4. （選用）建立後台管理員：免費方案沒有 Shell，可在本機用同一個 `DATABASE_URL` 執行
   `docker run --rm -it -e DJANGO_SECRET_KEY=x -e DATABASE_URL="<連線網址>" <映像> python manage.py createsuperuser`。

設定都在 `render.yaml`：`DJANGO_SECRET_KEY` 由 Render 自動產生；對外網域由 Render 提供的
`RENDER_EXTERNAL_HOSTNAME` 自動加入 `ALLOWED_HOSTS` 與 `CSRF_TRUSTED_ORIGINS`；健康檢查走 nginx 的 `/healthz`。

免費方案的限制：

- 15 分鐘沒有人使用就會休眠，下一位使用者要等約 1 分鐘喚醒（期間瀏覽器會一直轉圈）。
- 記憶體 512 MB、每月 750 小時；Neon 免費方案約 1 GB 儲存空間，閒置 5 分鐘後暫停、連線時自動喚醒。
- 之後每次 push 到部署的分支，Render 會自動重新建置並上線。

## 部署到其他雲端平台

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
