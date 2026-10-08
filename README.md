# Nihongo Quest — 日文冒險學習平台

把 Scratch 日文助詞遊戲 **《元智騎士》**（[原專案](https://scratch.mit.edu/projects/731822830)）升級成有會員、學習紀錄、
經驗值與排行榜的 Web 學習平台。平台是「包在遊戲外面」的：原始 Scratch 專案原封不動保留在 `scratch-games/original/`，
實際載入的是由腳本產生的小幅修改版（見 `scratch-games/integrations/README.md`）。

- **會員系統**：註冊、登入、登出、個人資料、修改密碼
- **遊戲大廳**：等級徽章、經驗值進度條、遊戲卡片、繼續上次冒險
- **Scratch 整合**：自行託管 TurboWarp scaffolding 執行 `.sb3`，以 JavaScript Bridge 取得答題與過關事件
- **學習紀錄**：每一局、每一關、每一次作答都存進 PostgreSQL，換裝置登入也看得到
- **RPG 成長**：EXP 由後端計算與防重複發放，升級演出、稱號
- **修行紀錄**：各助詞正確率、關卡完成率、最常答錯的題目、EXP 成長圖
- **英雄榜**：累積 EXP 與最高評價排行（只顯示暱稱，可自行關閉）
- **作答解說**：在遊戲裡答題後，旁邊即時顯示句子的中文意思、正解與文法重點；漢字可標假名
- **錯題複習**：不用進遊戲的網頁小測驗，答錯過的題目優先出現，手機也能練；另有を・へ・と・の補充題
- **每日任務與成就**：連續學習天數、每天三個任務、十個成就徽章
- **班級**：老師建立班級後，學生用代碼加入；老師可看全班各助詞正確率與最常答錯的題目

## 技術

| 層 | 使用 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite 6、Tailwind CSS 4、React Router、TanStack Query、Recharts、zod |
| 後端 | Python 3.12、Django 5.2 LTS、Django REST Framework、drf-spectacular |
| 資料庫 | PostgreSQL 16 |
| 遊戲 | Scratch 3 `.sb3` + `@turbowarp/scaffolding` 0.4.0 |
| 維運 | Docker、Docker Compose、nginx、gunicorn、GitHub Actions |
| 測試 | pytest-django、Vitest、React Testing Library |

## 快速開始

需要 Docker（含 Docker Compose）。

```bash
git clone https://github.com/MINNNNNNN9/nihongo-quest.git
cd nihongo-quest
cp .env.example .env
docker compose up --build
```

第一次建置需要幾分鐘。完成後：

| 網址 | 內容 |
| --- | --- |
| <http://localhost:5173> | 平台首頁（先註冊一個帳號） |
| <http://localhost:5173/api/docs/> | API 文件（Swagger UI） |
| <http://localhost:5173/admin/> | Django 後台（需先 `docker compose exec backend python manage.py createsuperuser`） |

後端啟動時會自動套用 migration 並建立遊戲資料（18 個關卡、75 題助詞題與 32 題複習用補充題）。
若 5173／8010 埠已被占用，改 `.env` 裡的 `FRONTEND_PORT`／`BACKEND_PORT`。

### 驗證是否正常

1. 註冊後進入大廳，點《元智騎士》→「▶ 冒険を始める」。
2. 在遊戲裡進入第一關（大廳往上走到門口按空白鍵），打倒怪物後回答助詞題。
3. 右側面板會即時顯示目前關卡、答對／答錯數；過關時跳出「+50 EXP」，右上角經驗條增加。
4. 到「修行紀錄」可看到剛才的作答統計；重新整理或換瀏覽器登入，紀錄仍在。

### 執行測試

```bash
docker compose run --rm --entrypoint "" backend pytest     # 後端 52 個測試（使用 PostgreSQL）
cd frontend && npm install && npm run typecheck && npm test # 前端 22 個測試
```

### 不用 Docker 跑前端

```bash
cd frontend
npm install
npm run dev        # 預設把 /api 代理到 http://localhost:8010，可用 API_PROXY_TARGET 覆寫
```

## 文件

| 文件 | 內容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 系統架構、原 Scratch 專案分析、整合方式比較、事件協定、**信任模型與防作弊的界線**、如何加入新遊戲 |
| [docs/database.md](docs/database.md) | ERD、關聯、唯一限制、索引 |
| [docs/api.md](docs/api.md) | 回應格式、所有端點、遊戲事件格式、限流 |
| [docs/deployment.md](docs/deployment.md) | 環境變數、正式環境部署、HTTPS、雲端平台、備份、上線檢查表 |

## 已知限制

- **排行榜為榮譽制**：遊戲在瀏覽器裡執行，後端能擋住重送、亂序與不合理的事件，但無法阻止精心偽造的過關紀錄。
  EXP 的「金額」一定由後端決定；詳見 `docs/architecture.md` 的信任模型。
- **橋接層依賴 Scratch VM 的內部介面**（`runtime.startHats`），因此 scaffolding 鎖定版本，升級需重新驗證。
- **手機玩遊戲靠虛擬按鍵**：原 Scratch 專案是鍵盤與滑鼠操作，觸控裝置上會顯示搖桿與互動鈕、點畫面瞄準射擊，
  但小螢幕上按鍵會擋到部分畫面，操作手感不如鍵盤滑鼠；錯題複習則完全適合手機。
- **遊戲無法存檔**：冒險途中離開，這一局就作廢（離開前會跳出提醒）。
- **排行榜沒有納入複習成績**；班級功能沒有「老師移除學生」與轉移老師。
- **尚未自動部署**：已有 CI 與正式環境的 Docker 設定，但還沒有部署到任何雲端主機。
- 沒有忘記密碼（寄信）流程；限流計數在單一行程的記憶體內，多實例部署需改用 Redis。

## 版本規則

採用 Semantic Versioning：`vMAJOR.MINOR.PATCH`（版本號記於 `frontend/package.json` 的 `version`，每次發版同步更新並於下方「更新項目」記錄）。

- **PATCH**：不影響既有使用方式的修正、文件更新、設定調整（例 v0.1.0 → v0.1.1）
- **MINOR**：向下相容的新功能（例 v0.1.0 → v0.2.0）
- **MAJOR**：不相容變更，如 API 欄位規格、路由或資料格式重大改版（例 v0.9.0 → v1.0.0）

## 更新項目

### v0.4.0 (2026-10-08)

- **遊戲本體 v1.4**（由 `scratch-games/tools/build_patched.sh` 從原檔產生，原檔不動）：
  - **每一關的怪物都不同**：原本每關都是同樣三隻怪；現在由一張關卡表決定各關的怪物種類、數量、血量、移動與射擊方式（只有蝙蝠的一關、坦克泥怪、會衝向主角的蝙蝠、扇形彈幕……）。怪物改為分身，可同時出現多隻。
  - **第三章**：新增 3-1～3-5 與最終魔王 3-X（7 題），場景由第二章地圖換色而成，怪物有新的色調與攻擊方式（會放電的蝙蝠等）。全遊戲從 12 關變成 18 關。
  - **演出**：每關開頭顯示關卡標題；怪物出場的光圈、被打中的火花、死亡的煙霧；主角跑動揚塵、受傷時畫面邊緣閃紅並短暫無敵。
  - **調整**：過關回復 25 HP；修正第二章「大眼仔最後才死會卡關」的問題；主角的子彈現在會被大眼仔擋下。
- **平台**：關卡資料、冒險地圖與事件轉接設定加入第三章（EXP：關卡 110、最終魔王 350）。
- **帳號管理**：老師身分由管理員在後台（`/admin/`）設定，只有老師能建立班級；後台可重設使用者密碼；登入頁新增「忘記密碼」（需設定寄信）。
- **音量控制**：遊戲頁可調整音量與靜音（預設為一半），設定記在瀏覽器裡。
- **Render 部署**：單一容器映像與 `render.yaml`，支援 `DATABASE_URL`；步驟見 `docs/deployment.md`。

### v0.3.0 (2026-10-08)

- **作答解說**：遊戲事件 API 在作答後回傳題目、玩家的選擇、中文提示、正解與文法重點；遊戲頁右側即時顯示（答錯時先給提示，按下按鈕才顯示正解）。
- **錯題複習**（`/review`）：伺服器出題與判定的網頁小測驗，每輪 10 題，可只練答錯的題目或指定助詞；答對 +2 EXP（每日上限 40）。
- **補充題庫**：新增を・へ・と・の共 32 題，只在複習模式出現（`Question.in_game=false`），原 Scratch 專案不變。
- **假名標註**：題目的漢字上方顯示假名，可隨時開關；詞表在 `backend/apps/games/furigana.py`，測試會檢查有沒有漏標。
- **每日任務、連續學習天數、成就**：進度由作答紀錄即時算出；任務獎勵需手動領取，同一天不會重複發放。
- **班級**（`/classes`）：6 碼加入代碼、班內排行榜、老師專用的學習報告。
- **視覺改版**：改為和モダン風格——Noto Serif／Noto Sans 字體、留白的淺色版面、朱色單一強調色、線條圖示；右上角可切換深色。色票與元件樣式集中在 `frontend/src/index.css`。
- **遊戲本體 v1.3**（`scratch-games/patched/`，由 `tools/build_patched.sh` 從原檔產生）：題目泡泡一直顯示到答對（原本 10 秒後消失）、同一局不重複出題、移除作弊鍵 8／9、壓縮圖檔（22 MB → 15 MB）；下載時顯示進度百分比。
- **遊戲體驗**：第一次進遊戲頁的新手教學、冒險途中離開前的提醒、觸控裝置的虛擬搖桿與互動鈕。
- **修正**：正式環境直接開啟或重新整理 `/games/<slug>` 會得到 nginx 404。
- **統計**：修行紀錄的正確率、各助詞正確率與最常答錯題目改為遊戲與複習合併計算。
- **測試**：後端 52 個、前端 22 個。

### v0.2.0 (2026-10-08)

- **React 前端**：日式 RPG 風格介面（鳥居、青海波紋樣、像素字體）；登入／註冊、冒險大廳、遊戲頁、修行紀錄、英雄榜、冒險者證，支援桌面、平板與手機版面。
- **Scratch 遊戲播放器與 JavaScript Bridge**：以 `@turbowarp/scaffolding` 自行載入《元智騎士》`.sb3`，從 VM 外部觀察廣播與背景切換並轉成標準事件，原專案完全不需修改；每款遊戲的對應規則寫在 `scratch-games/integrations/<slug>/adapter.json`。
- **事件管線**：React 驗證 postMessage 的來源、視窗與格式後依序送往後端，暫時性錯誤自動重試；過關即時顯示 EXP 與升級演出。
- **學習儀表板**：各助詞正確率、EXP 成長圖、最常答錯的題目（附正解與中文提示）、各關卡完成率、最近學習歷史。
- **Docker 與部署**：前端 Dockerfile（開發／正式）、nginx 反向代理與 CSP、`docker-compose.prod.yml`、GitHub Actions CI（後端測試、前端型別檢查／測試／建置、正式映像建置）。
- **文件**：新增架構、資料庫、API、部署四份文件與完整 README。
- **測試**：新增前端 17 個 Vitest 測試（訊息驗證、事件狀態機、登入流程、經驗條）。

### v0.1.0 (2026-10-08)

- **專案骨架**：建立 Monorepo（`backend/`、`frontend/`、`scratch-games/`、`docs/`）與 Docker Compose 開發環境（PostgreSQL 16、Django 5.2）。
- **保留原始 Scratch 遊戲**：以 `scratch-games/tools/fetch_sb3.py` 將《元智騎士 v1.2》（Scratch 專案 731822830）原封不動打包成 `.sb3`；`extract_questions.py` 從專案積木抽出 75 題助詞題、中文提示與正解，作為題庫種子資料。
- **會員 API**：註冊、登入、登出、個人資料、修改密碼；Session Cookie + CSRF 驗證，密碼以 Django PBKDF2 雜湊。
- **遊戲與學習紀錄 API**：遊戲／關卡／題庫模型，遊玩工作階段與事件端點（關卡開始、作答、過關、結束）。
- **經驗值系統**：EXP 只由後端依關卡設定計算；以資料庫鎖、事件序號與唯一限制避免重複發獎；重玩已通關關卡只給三成。
- **統計與排行榜 API**：學習儀表板（各助詞正確率、關卡完成率、最常答錯題目、EXP 成長）、累積 EXP 與最高評價排行榜（只公開暱稱，可自行關閉）。
- **測試**：後端 36 個 pytest 測試（於 PostgreSQL 上執行）。
