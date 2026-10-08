// 把「遊戲裡觀察到的背景切換與廣播」轉成平台標準事件的狀態機。
// 不依賴瀏覽器或 Scratch VM，方便單元測試；實際的 VM 掛鉤在 bridge.js。

/**
 * @param {object} adapter  scratch-games/integrations/<slug>/adapter.json 的內容
 * @param {(type: string, payload: object) => void} emit
 * @param {{ questionNumber: () => (number|null), sender: () => (string|null), variable: (name: string) => (number|null) }} read
 */
export function createTracker(adapter, emit, read) {
  const lobby = new Set(adapter.lobbyBackdrops);
  const levels = new Set(adapter.levelBackdrops);
  const completes = new Set(adapter.levelCompleteBroadcasts);
  let backdrop = null;
  let run = null; // 進行中的一局：{ level: 目前關卡代號 }

  const finish = (outcome) => {
    if (!run) return;
    run = null;
    emit('GAME_FINISHED', { outcome, battle_score: read.variable(adapter.battleScoreVariable) });
  };

  return {
    onBackdrop(name) {
      if (name === backdrop) return;
      backdrop = name;
      if (lobby.has(name)) {
        run = null; // 回到大廳：這一局不再計入（伺服器會在下一局開始時標記為中途離開）
      } else if (name === adapter.clearedBackdrop) {
        finish('cleared');
      } else if (name === adapter.failedBackdrop) {
        finish('failed');
      } else if (levels.has(name)) {
        const isRunStart = name === adapter.runStartBackdrop;
        // 答完題後遊戲會把背景切回同一關，那不是新的一局
        if (isRunStart && (!run || run.level !== name)) {
          run = { level: null };
          emit('GAME_STARTED', {});
        }
        if (run && run.level !== name) {
          run.level = name;
          emit('LEVEL_STARTED', { level_key: name });
        }
      }
    },

    onBroadcast(name) {
      if (!run || !run.level) return;
      if (name === adapter.correctBroadcast || name === adapter.wrongBroadcast) {
        const number = read.questionNumber();
        if (number === null) return;
        emit('QUESTION_ANSWERED', {
          level_key: run.level,
          question_key: adapter.questionKeyPrefix + String(number).padStart(2, '0'),
          choice: read.sender() || '',
          is_correct: name === adapter.correctBroadcast,
        });
      } else if (completes.has(name)) {
        emit('LEVEL_COMPLETED', { level_key: run.level });
      }
    },
  };
}
