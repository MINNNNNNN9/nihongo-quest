# API

互動式文件（Swagger UI）：啟動後開啟 `/api/docs/`，OpenAPI 規格在 `/api/schema/`。

## 共通規則

- 基底路徑 `/api`，內容一律 JSON。
- **驗證**：Session Cookie。先 `GET /api/auth/csrf/` 取得 `csrftoken` cookie，之後所有非 GET 請求帶 `X-CSRFToken` 標頭。
- 除了 `auth/csrf`、`auth/register`、`auth/login`、`health` 之外都需要登入；未登入回 `403`。
- 所有與個人資料有關的端點都只作用於「目前登入者」，路徑與參數中沒有使用者 ID；
  存取別人的 game session 回 `404`。

### 回應信封

```jsonc
// 成功
{ "success": true, "data": { }, "error": null }
// 失敗
{ "success": false, "data": null,
  "error": { "code": "validation_error", "message": "輸入資料有誤", "details": { "email": ["這個電子郵件已被使用"] } } }
```

| 狀態碼 | `error.code` | 意義 |
| --- | --- | --- |
| 400 | `validation_error` | 欄位驗證失敗，`details` 為各欄位訊息 |
| 403 | `not_authenticated`／`permission_denied` | 未登入或 CSRF 驗證失敗 |
| 404 | `not_found` | 資源不存在（或不屬於你） |
| 409 | `conflict` | 目前狀態不允許（例：關卡尚未開始、通關時間異常） |
| 429 | `throttled` | 請求過於頻繁 |

分頁端點的 `data` 為 `{count, page, pages, results}`，可用 `?page=`、`?page_size=`（上限 100）。

### 限流

| 範圍 | 預設 | 環境變數 |
| --- | --- | --- |
| 未登入 | 60／分 | `THROTTLE_ANON` |
| 已登入 | 600／分 | `THROTTLE_USER` |
| 註冊／登入／改密碼 | 10／分 | `THROTTLE_AUTH` |
| 遊戲事件 | 240／分 | `THROTTLE_GAME_EVENTS` |

## 端點

### 帳號

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/auth/csrf/` | 設定 CSRF cookie |
| POST | `/auth/register/` | `{username, email, display_name, password}` → 建立帳號並登入 |
| POST | `/auth/login/` | `{username, password}` |
| POST | `/auth/logout/` | → 204 |
| GET | `/auth/me/` | 目前登入者（含等級進度） |
| PATCH | `/auth/me/` | 修改 `display_name`、`email`、`show_on_leaderboard` |
| POST | `/auth/password/` | `{current_password, new_password}` → 204 |

### 遊戲

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/games/` | 遊戲列表（含我的通關進度、上次遊玩時間） |
| GET | `/games/{slug}/` | 遊戲詳情（含題數、文法主題） |
| GET | `/games/{slug}/levels/` | 關卡列表（含我是否通關、通關次數） |

### 遊戲紀錄

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| POST | `/game-sessions/` | `{game: slug}` → 開始新的一局（同遊戲未結束的舊局標記為中途離開） |
| POST | `/game-sessions/{id}/events/` | 送出一個遊戲事件，見下 |
| POST | `/game-sessions/{id}/complete/` | `{outcome: cleared｜failed, battle_score?}` → 結束這一局（可重複呼叫） |
| GET | `/learning-records/` | 我的關卡學習紀錄（分頁，可 `?game=slug`） |

事件內容：

```jsonc
{ "seq": 3,                       // 這一局內遞增的序號；重送相同序號不會重複計算
  "type": "QUESTION_ANSWERED",    // LEVEL_STARTED｜QUESTION_ANSWERED｜LEVEL_COMPLETED
  "level_key": "1-1",
  "question_key": "Q72",          // 僅 QUESTION_ANSWERED
  "choice": "(正解)ga2",           // 玩家點的選項角色；後端用它對照題庫判定對錯
  "is_correct": true }            // 只有在後端認不得 choice 時才會採用
```

回應：

```jsonc
{ "duplicate": false,
  "is_correct": true,             // 後端判定的結果（QUESTION_ANSWERED）
  "reward": {                     // 僅 LEVEL_COMPLETED 成功時
    "exp_awarded": 50, "is_first_clear": true, "leveled_up": false, "level_before": 1,
    "progress": { "level": 1, "title": "見習騎士", "total_exp": 50, "exp_into_level": 50, "exp_for_next_level": 100 } } }
```

請求中任何 `exp`、`score` 之類的欄位都會被忽略：EXP 只由後端依關卡設定決定。

### 玩家資料

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/player/profile/` | 同 `/auth/me/` |
| GET | `/player/experience/` | 經驗值紀錄（分頁） |
| GET | `/player/dashboard/` | 儀表板統計：遊玩次數、學習時間、正確率、各助詞正確率、關卡完成率、最常答錯題目、14 天 EXP 成長、最近遊玩 |

### 排行榜

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/leaderboard/?board=exp` | 累積 EXP 前 20 名 + 我的名次 |
| GET | `/leaderboard/?board=score&game={slug}` | 全破場次最高總評價前 20 名 + 我的名次 |

每筆只包含 `rank`、`display_name`、`level`、`value`、`is_me`。
關閉「公開於英雄榜」的玩家不會出現在榜上，自己查詢時 `hidden=true`、`me=null`。

### 其他

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/health/` | 健康檢查（含資料庫連線） |
