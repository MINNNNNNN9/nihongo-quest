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
| 遊戲事件、複習作答、領取任務 | 240／分 | `THROTTLE_GAME_EVENTS` |

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
| GET | `/auth/password/forgot/` | `{enabled}`：伺服器有沒有設定寄信 |
| POST | `/auth/password/forgot/` | `{email}` → 204。信箱存在就寄出重設連結（2 小時有效）；不存在也回 204 |
| POST | `/auth/password/reset/` | `{uid, token, new_password}` → 204；連結無效或過期回 400 |

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
    "progress": { "level": 1, "title": "見習騎士", "total_exp": 50, "exp_into_level": 50, "exp_for_next_level": 100 } },
  "feedback": {                   // 僅 QUESTION_ANSWERED：給玩家看的解說
    "prompt": "私（？）エンジニアです。", "prompt_ruby": [["私", "わたし"], ["（？）エンジニアです。", ""]],
    "context": "…", "context_ruby": [], "choice": "が", "correct_answer": "も",
    "hint_zh": "…", "topic": "mo", "topic_label": "も（也）", "note": "文法重點說明" } }
```

請求中任何 `exp`、`score` 之類的欄位都會被忽略：EXP 只由後端依關卡設定決定。
`*_ruby` 是假名標註，格式為 `[文字, 假名]` 片段的陣列（不需標音的片段假名為空字串）。

### 錯題複習

不經過 Scratch 的網頁小測驗：出題與判定都在後端，前端在作答前拿不到正解。
題庫除了遊戲內的 75 題，還有只在複習出現的補充題（を・へ・と・の，`Question.in_game=false`）。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/review/` | 待複習題數、今天已拿的複習 EXP、各助詞的題數與待複習數 |
| GET | `/review/next/?mode=mixed｜mistakes&topic=` | 抽一輪（最多 10 題）。`mistakes` 只出待複習的題；`mixed` 出全部題目、答錯過的機率較高。回傳不含正解，選項順序隨機 |
| POST | `/review/answer/` | `{question_id, choice}` → `{is_correct, exp_awarded, debt, feedback, progress}` |

「待複習」的算法：每一題答錯 +1（上限 3）、答對 −1，大於 0 就是待複習；遊戲內的作答也會計入。
複習答對一題 +2 EXP，每天上限 40。

### 每日任務與成就

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/player/quests/` | `{streak, quests, achievements}`：連續學習天數、今日三個任務的進度、所有成就與進度（達成條件的成就在這次呼叫中解鎖，`is_new=true`） |
| POST | `/player/quests/{key}/claim/` | 領取已完成任務的 EXP；未完成或已領過回 `409` |

進度都由作答紀錄即時算出。任務每天依伺服器時區（Asia/Taipei）換日。

### 班級

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/classes/` | 我教的與我加入的班級 |
| POST | `/classes/` | `{name}` → 建立班級，回傳 6 碼加入代碼。只有老師帳號（`is_teacher`，由管理員在後台設定）或管理員可以建立，其他人回 403 |
| POST | `/classes/join/` | `{code}` → 加入班級（不分大小寫；限流同登入） |
| GET | `/classes/{code}/` | 班內排行榜；老師另外會拿到 `report`（學生名單、各助詞正確率、最常答錯題目） |
| DELETE | `/classes/{code}/` | 刪除班級（僅老師）→ 204 |
| POST | `/classes/{code}/leave/` | 退出班級 → 204 |

不是老師也不是成員的人查詢一律回 `404`。學生之間只看得到暱稱、等級與 EXP。

### 玩家資料

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/player/profile/` | 同 `/auth/me/` |
| GET | `/player/experience/` | 經驗值紀錄（分頁） |
| GET | `/player/dashboard/` | 儀表板統計：遊玩次數、學習時間、正確率、各助詞正確率、關卡完成率、最常答錯題目、14 天 EXP 成長、最近遊玩 |

### 排行榜

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/leaderboard/?board=exp` | 累積 EXP 前 20 名 + 我的名次（還沒有 EXP 的玩家也會列出） |
| GET | `/leaderboard/?board=levels` | 通過關卡數前 20 名 + 我的名次 |
| GET | `/leaderboard/?board=score&game={slug}` | 全破場次最高總評價前 20 名 + 我的名次 |

每筆只包含 `rank`、`display_name`、`level`、`value`、`is_me`。
關閉「公開於英雄榜」的玩家不會出現在榜上，自己查詢時 `hidden=true`、`me=null`。

### 其他

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/health/` | 健康檢查（含資料庫連線） |
