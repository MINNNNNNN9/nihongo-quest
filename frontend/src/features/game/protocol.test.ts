import { describe, expect, it } from 'vitest';

import { parseGameMessage } from './protocol';

const iframeWindow = {} as MessageEventSource;
const ctx = { allowedOrigin: 'http://localhost:5173', expectedSource: iframeWindow, game: 'yuanze-knight' };
const base = { source: 'nihongo-quest-game', version: 1, game: 'yuanze-knight' };
const event = (data: unknown, over: Partial<{ origin: string; source: MessageEventSource }> = {}) => ({
  origin: 'http://localhost:5173',
  source: iframeWindow,
  data,
  ...over,
});

describe('parseGameMessage', () => {
  it('接受格式正確、來源正確的訊息', () => {
    const payload = { level_key: '1-1', question_key: 'Q72', choice: '(正解)ga2', is_correct: true };
    const message = parseGameMessage(event({ ...base, type: 'QUESTION_ANSWERED', payload }), ctx);
    expect(message).toEqual({ game: 'yuanze-knight', type: 'QUESTION_ANSWERED', payload });
  });

  it('拒絕其他來源（origin）的訊息', () => {
    const data = { ...base, type: 'GAME_STARTED', payload: {} };
    expect(parseGameMessage(event(data, { origin: 'https://evil.example' }), ctx)).toBeNull();
  });

  it('拒絕不是由我們的 iframe 送出的訊息', () => {
    const data = { ...base, type: 'GAME_STARTED', payload: {} };
    expect(parseGameMessage(event(data, { source: {} as MessageEventSource }), ctx)).toBeNull();
    expect(parseGameMessage(event(data), { ...ctx, expectedSource: null })).toBeNull();
  });

  it('拒絕其他遊戲或其他程式的訊息', () => {
    expect(parseGameMessage(event({ ...base, game: 'other', type: 'GAME_STARTED', payload: {} }), ctx)).toBeNull();
    expect(parseGameMessage(event({ source: 'react-devtools', type: 'GAME_STARTED' }), ctx)).toBeNull();
    expect(parseGameMessage(event('hello'), ctx)).toBeNull();
    expect(parseGameMessage(event(null), ctx)).toBeNull();
  });

  it('拒絕結構不符的 payload', () => {
    const bad = [
      { type: 'LEVEL_STARTED', payload: {} },
      { type: 'QUESTION_ANSWERED', payload: { level_key: '1-1', question_key: 'Q01', choice: 'ga', is_correct: 'yes' } },
      { type: 'GAME_FINISHED', payload: { outcome: 'won', battle_score: 1 } },
      { type: 'GIVE_EXP', payload: { exp: 99999 } },
    ];
    for (const data of bad) expect(parseGameMessage(event({ ...base, ...data }), ctx)).toBeNull();
  });
});
