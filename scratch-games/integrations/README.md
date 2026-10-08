# 遊戲整合設定

每個資料夾對應一款 Scratch 遊戲，資料夾名稱就是後端 `Game.slug`。

`adapter.json` 用「宣告」的方式告訴播放器（`frontend/public/player/`）如何把這款遊戲裡
**已經存在**的廣播訊息與背景切換，翻譯成平台的標準事件。原始 `.sb3` 完全不需要修改。

| 欄位 | 說明 |
| --- | --- |
| `bundle` | `scratch-games/original/` 底下的 `.sb3` 檔名 |
| `lobbyBackdrops` | 出現這些背景代表玩家回到大廳／主選單，當前這一局視為結束 |
| `levelBackdrops` | 背景名稱 = 關卡代號（需與後端 `GameLevel.key` 一致） |
| `runStartBackdrop` | 切到這個背景代表新的一局開始（`GAME_STARTED`） |
| `clearedBackdrop` / `failedBackdrop` | 通關／Game Over（`GAME_FINISHED`） |
| `correctBroadcast` / `wrongBroadcast` | 答對／答錯時遊戲發出的廣播（`QUESTION_ANSWERED`） |
| `levelCompleteBroadcasts` | 過關時遊戲發出的廣播（`LEVEL_COMPLETED`） |
| `questionList` | 存放「目前題號」的清單，第 1 項即當前題目 |
| `battleScoreVariable` | 結算時讀取的戰鬥評價變數 |

新增遊戲的步驟見 `docs/architecture.md` 的「加入新的 Scratch 遊戲」。
