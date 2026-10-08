import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { api, ApiError } from '../../lib/api';
import type { EventResult, Feedback, GameSession, Reward } from '../../lib/types';
import { ME_KEY } from '../auth/AuthContext';
import { parseGameMessage, type GameMessage } from './protocol';

export type PlayerStatus = 'loading' | 'ready' | 'playing' | 'error';

export interface RunState {
  sessionId: string | null;
  levelKey: string | null;
  correct: number;
  wrong: number;
  expEarned: number;
  clearedLevels: string[];
  outcome: 'cleared' | 'failed' | null;
  result: GameSession | null;
  /** 最近一次作答的解說 */
  lastAnswer: { feedback: Feedback; isCorrect: boolean } | null;
}

export interface Notice {
  id: number;
  tone: 'reward' | 'info' | 'warn';
  text: string;
}

const EMPTY_RUN: RunState = {
  sessionId: null,
  levelKey: null,
  correct: 0,
  wrong: 0,
  expEarned: 0,
  clearedLevels: [],
  outcome: null,
  result: null,
  lastAnswer: null,
};

const GAME_ORIGIN = import.meta.env.VITE_GAME_ORIGIN ?? window.location.origin;
const RETRIES = 3;

/** 網路或伺服器暫時性錯誤時重試。事件帶有序號，重送不會被重複計算。 */
async function withRetry<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      const transient = error instanceof ApiError && (error.status === 0 || error.status >= 500);
      if (!transient || attempt >= RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
}

/**
 * 接收播放器 iframe 的遊戲事件，依序送到後端，並把結果整理成畫面要用的狀態。
 */
export function useGameBridge(game: string, iframeRef: RefObject<HTMLIFrameElement | null>) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>(EMPTY_RUN);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [levelUp, setLevelUp] = useState<Reward | null>(null);

  // 事件必須照順序處理（先建立 session 才能送事件），所以串成一條 promise 佇列
  const queue = useRef<Promise<void>>(Promise.resolve());
  const session = useRef<{ id: string; seq: number } | null>(null);
  const noticeId = useRef(0);

  const notify = useCallback((tone: Notice['tone'], text: string) => {
    noticeId.current += 1;
    const id = noticeId.current;
    setNotices((list) => [...list.slice(-3), { id, tone, text }]);
    setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), 4500);
  }, []);

  const refreshPlayerData = useCallback(() => {
    for (const key of ['games', 'levels', 'dashboard', 'leaderboard', 'records', 'quests', 'review']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);

  const handle = useCallback(
    async (message: GameMessage) => {
      switch (message.type) {
        case 'PLAYER_READY':
          setStatus('ready');
          return;
        case 'GAME_ERROR':
          if (!session.current) {
            setStatus('error');
            setErrorMessage(message.payload.message);
          }
          return;
        case 'GAME_STARTED': {
          const created = await withRetry(() => api.post<GameSession>('/game-sessions/', { game }));
          session.current = { id: created.id, seq: 0 };
          setStatus('playing');
          setRun({ ...EMPTY_RUN, sessionId: created.id });
          return;
        }
        case 'GAME_FINISHED': {
          const current = session.current;
          if (!current) return;
          session.current = null;
          const result = await withRetry(() =>
            api.post<GameSession>(`/game-sessions/${current.id}/complete/`, {
              outcome: message.payload.outcome,
              ...(message.payload.battle_score === null ? {} : { battle_score: message.payload.battle_score }),
            }),
          );
          setRun((r) => ({ ...r, outcome: message.payload.outcome, result }));
          refreshPlayerData();
          return;
        }
        default: {
          const current = session.current;
          if (!current) return;
          current.seq += 1;
          const seq = current.seq;
          const body = { seq, type: message.type, ...message.payload };
          const result = await withRetry(() => api.post<EventResult>(`/game-sessions/${current.id}/events/`, body));
          if (result.duplicate) return;

          if (message.type === 'LEVEL_STARTED') {
            setRun((r) => ({ ...r, levelKey: message.payload.level_key }));
          } else if (message.type === 'QUESTION_ANSWERED') {
            const correct = result.is_correct ?? message.payload.is_correct;
            setRun((r) => ({
              ...r,
              correct: r.correct + (correct ? 1 : 0),
              wrong: r.wrong + (correct ? 0 : 1),
              lastAnswer: result.feedback ? { feedback: result.feedback, isCorrect: correct } : r.lastAnswer,
            }));
          } else if (result.reward) {
            const reward = result.reward;
            setRun((r) => ({
              ...r,
              expEarned: r.expEarned + reward.exp_awarded,
              clearedLevels: [...r.clearedLevels, message.payload.level_key],
            }));
            queryClient.setQueryData(ME_KEY, (me: unknown) =>
              me ? { ...(me as object), total_exp: reward.progress.total_exp, progress: reward.progress } : me,
            );
            notify('reward', `關卡 ${message.payload.level_key} 過關！+${reward.exp_awarded} EXP`);
            if (reward.leveled_up) setLevelUp(reward);
            refreshPlayerData();
          }
        }
      }
    },
    [game, notify, queryClient, refreshPlayerData],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = parseGameMessage(event, {
        allowedOrigin: GAME_ORIGIN,
        expectedSource: iframeRef.current?.contentWindow ?? null,
        game,
      });
      if (!message) return;
      queue.current = queue.current
        .then(() => handle(message))
        .catch((error: unknown) => {
          // 伺服器拒絕（例如通關時間異常）時遊戲照常進行，只是這筆不計入
          const text = error instanceof ApiError ? error.message : '紀錄遊戲進度時發生錯誤';
          notify('warn', `這筆進度沒有被記錄：${text}`);
        });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [game, handle, iframeRef, notify]);

  return { status, errorMessage, run, notices, levelUp, dismissLevelUp: () => setLevelUp(null) };
}
