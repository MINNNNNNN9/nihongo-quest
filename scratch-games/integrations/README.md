# 遊戲整合設定

每個資料夾對應一款 Scratch 遊戲，資料夾名稱就是後端 `Game.slug`。

`adapter.json` 用「宣告」的方式告訴播放器（`frontend/public/player/`）如何把這款遊戲裡
**已經存在**的廣播訊息與背景切換，翻譯成平台的標準事件。整合本身不需要修改 `.sb3`。

《元智騎士》目前載入的是修改版 `patched/yuanze-knight-v1.4.sb3`：每關不同的怪物配置、新增第三章、打擊特效與關卡標題、
題目泡泡一直顯示到答對、同一局不重複出題、移除作弊鍵、壓縮圖檔。各關的怪物配置寫在 `tools/patch_project.mjs` 的 `LEVELS` 表，
改完重跑建置腳本即可。它由 `tools/build_patched.sh`（內含 `tools/patch_project.mjs`）從 `original/` 的原檔產生，
原檔沒有被改動；把 `adapter.json` 的 `bundle`／`bundleDir` 改回去就能換回原版。

| 欄位 | 說明 |
| --- | --- |
| `bundle` | `.sb3` 檔名 |
| `bundleDir` | `.sb3` 所在的資料夾（`scratch-games/` 底下），省略時是 `original` |
| `lobbyBackdrops` | 出現這些背景代表玩家回到大廳／主選單，當前這一局視為結束 |
| `levelBackdrops` | 背景名稱 = 關卡代號（需與後端 `GameLevel.key` 一致） |
| `runStartBackdrop` | 切到這個背景代表新的一局開始（`GAME_STARTED`） |
| `clearedBackdrop` / `failedBackdrop` | 通關／Game Over（`GAME_FINISHED`） |
| `correctBroadcast` / `wrongBroadcast` | 答對／答錯時遊戲發出的廣播（`QUESTION_ANSWERED`） |
| `levelCompleteBroadcasts` | 過關時遊戲發出的廣播（`LEVEL_COMPLETED`） |
| `questionList` | 存放「目前題號」的清單，第 1 項即當前題目 |
| `battleScoreVariable` | 結算時讀取的戰鬥評價變數 |

新增遊戲的步驟見 `docs/architecture.md` 的「加入新的 Scratch 遊戲」。
