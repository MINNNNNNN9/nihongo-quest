# 資料庫設計

PostgreSQL 16，全部以 Django ORM 定義（`backend/apps/*/models.py`），結構變更一律走 migration。

## ERD

```mermaid
erDiagram
  User ||--|| PlayerProfile : "1 對 1"
  User ||--o{ GameSession : "遊玩"
  User ||--o{ ExperienceTransaction : "獲得"
  Game ||--o{ GameLevel : "包含"
  Game ||--o{ Question : "題庫"
  Game ||--o{ GameSession : ""
  GameSession ||--o{ LearningRecord : "每關一筆"
  GameLevel ||--o{ LearningRecord : ""
  LearningRecord ||--o{ QuestionAttempt : "作答"
  Question ||--o{ QuestionAttempt : ""
  LearningRecord ||--o| ExperienceTransaction : "最多一筆獎勵"

  User { bigint id PK
         string username UK
         string email UK
         string password "PBKDF2 雜湊" }
  PlayerProfile { bigint id PK
                  bigint user_id FK,UK
                  string display_name UK
                  bool show_on_leaderboard
                  int total_exp "帳本加總的快取" }
  Game { bigint id PK
         string slug UK
         string title
         string bundle_path
         string adapter_path
         bool is_active }
  GameLevel { bigint id PK
              bigint game_id FK
              string key
              int order
              string kind "stage｜boss"
              int questions_required
              int exp_reward
              int min_seconds }
  Question { bigint id PK
             bigint game_id FK
             string key
             string topic
             string prompt
             string correct_answer
             json choices }
  GameSession { uuid id PK
                bigint user_id FK
                bigint game_id FK
                string status
                datetime started_at
                datetime ended_at
                int last_seq
                int answer_score
                int battle_score }
  LearningRecord { bigint id PK
                   uuid session_id FK
                   bigint level_id FK
                   datetime started_at
                   datetime completed_at
                   int correct_count
                   int wrong_count
                   bool is_first_clear }
  QuestionAttempt { bigint id PK
                    bigint record_id FK
                    bigint question_id FK
                    string choice
                    bool is_correct
                    bool verified }
  ExperienceTransaction { bigint id PK
                          bigint user_id FK
                          int amount
                          string reason
                          bigint learning_record_id FK,UK }
```

## 關聯

| 關聯 | 類型 | 刪除行為 |
| --- | --- | --- |
| PlayerProfile → User | One-to-One | CASCADE |
| GameLevel／Question → Game | Many-to-One | CASCADE |
| GameSession → User | Many-to-One | CASCADE |
| GameSession → Game | Many-to-One | PROTECT（有紀錄的遊戲不能刪） |
| LearningRecord → GameSession | Many-to-One | CASCADE |
| LearningRecord → GameLevel | Many-to-One | PROTECT |
| QuestionAttempt → LearningRecord | Many-to-One | CASCADE |
| QuestionAttempt → Question | Many-to-One | PROTECT |
| ExperienceTransaction → User | Many-to-One | CASCADE |
| ExperienceTransaction → LearningRecord | One-to-One（可為空） | PROTECT |

## 唯一限制與完整性限制

| 資料表 | 限制 | 目的 |
| --- | --- | --- |
| User | `username`、`email` 唯一 | 帳號不重複 |
| PlayerProfile | `user` 唯一、`display_name` 唯一 | 一人一個身分、暱稱不撞名 |
| Game | `slug` 唯一 | |
| GameLevel | `(game, key)`、`(game, order)` 唯一；`questions_required ≥ 1` | 關卡代號與順序不重複 |
| Question | `(game, key)` 唯一 | |
| GameSession | `ended_at ≥ started_at`；`(user, game)` 在 `status='in_progress'` 時唯一（部分唯一索引） | 同一人同一遊戲只有一局進行中 |
| LearningRecord | `(session, level)` 唯一 | 一局中一關只有一筆紀錄 |
| ExperienceTransaction | `learning_record` 唯一；`amount > 0`；`reason='level_clear'` 時必須有 `learning_record` | **同一筆通關不可能重複發獎** |

## 索引

| 索引 | 用途 |
| --- | --- |
| `session_user_recent_idx (user, -started_at)` | 最近遊玩紀錄 |
| `session_game_status_idx (game, status)` | 最高評價排行榜 |
| `record_level_done_idx (level, completed_at)` | 關卡完成率、是否首次通關 |
| `attempt_question_result_idx (question, is_correct)` | 最常答錯的題目 |
| `exp_user_recent_idx (user, -created_at)` | 經驗值紀錄、每日成長 |
| `profile_exp_rank_idx (-total_exp, id) WHERE show_on_leaderboard` | EXP 排行榜 |
| `Question.topic` | 各助詞正確率 |

## 避免互相矛盾的資料

- **等級不存資料庫**：一律由 `total_exp` 用 `gamification/leveling.py` 推算。
- **`PlayerProfile.total_exp`** 是 `ExperienceTransaction` 加總的快取，只會在 `award_level_clear()` 的同一筆交易內、
  鎖住 profile 資料列後更新；帳本才是事實來源。
- **`LearningRecord`** 不重複儲存 user／game（由 session 推得），EXP 也不存在紀錄上（由帳本關聯取得）。
- **`correct_count`／`wrong_count`** 是該關作答的計數快取，與新增 `QuestionAttempt` 在同一筆交易內更新，過關後不再變動。
- **`GameSession.answer_score`** 在結束時由後端依作答紀錄計算一次。
