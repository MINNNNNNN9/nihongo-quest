# Nihongo Quest — 日文冒險學習平台

把 Scratch 日文助詞遊戲《元智騎士》升級成有會員、學習紀錄、經驗值與排行榜的 Web 學習平台。

> 文件撰寫中，完整的啟動與部署步驟會在後續版本補上。

## 版本規則

採用 Semantic Versioning：`vMAJOR.MINOR.PATCH`（版本號記於 `frontend/package.json` 的 `version`，每次發版同步更新並於下方「更新項目」記錄）。

- **PATCH**：不影響既有使用方式的修正、文件更新、設定調整（例 v0.1.0 → v0.1.1）
- **MINOR**：向下相容的新功能（例 v0.1.0 → v0.2.0）
- **MAJOR**：不相容變更，如 API 欄位規格、路由或資料格式重大改版（例 v0.9.0 → v1.0.0）

## 更新項目

### v0.1.0 (2026-10-08)

- **專案骨架**：建立 Monorepo（`backend/`、`frontend/`、`scratch-games/`、`docs/`）與 Docker Compose 開發環境（PostgreSQL 16、Django 5.2）。
- **保留原始 Scratch 遊戲**：以 `scratch-games/tools/fetch_sb3.py` 將《元智騎士 v1.2》（Scratch 專案 731822830）原封不動打包成 `.sb3`；`extract_questions.py` 從專案積木抽出 75 題助詞題、中文提示與正解，作為題庫種子資料。
- **會員 API**：註冊、登入、登出、個人資料、修改密碼；Session Cookie + CSRF 驗證，密碼以 Django PBKDF2 雜湊。
- **遊戲與學習紀錄 API**：遊戲／關卡／題庫模型，遊玩工作階段與事件端點（關卡開始、作答、過關、結束）。
- **經驗值系統**：EXP 只由後端依關卡設定計算；以資料庫鎖、事件序號與唯一限制避免重複發獎；重玩已通關關卡只給三成。
- **統計與排行榜 API**：學習儀表板（各助詞正確率、關卡完成率、最常答錯題目、EXP 成長）、累積 EXP 與最高評價排行榜（只公開暱稱，可自行關閉）。
- **測試**：後端 36 個 pytest 測試（於 PostgreSQL 上執行）。
