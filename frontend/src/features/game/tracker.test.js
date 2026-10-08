import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createTracker } from '../../../public/player/tracker.js';

// 直接用正式的整合設定來測，確保設定檔與狀態機一致（測試從 frontend/ 執行）
const adapterPath = resolve(process.cwd(), '../scratch-games/integrations/yuanze-knight/adapter.json');
const adapter = JSON.parse(readFileSync(adapterPath, 'utf8'));

function setup() {
  const events = [];
  const state = { question: 72, sender: '(正解)ga2', battle: 120 };
  const tracker = createTracker(adapter, (type, payload) => events.push([type, payload]), {
    questionNumber: () => state.question,
    sender: () => state.sender,
    variable: () => state.battle,
  });
  return { tracker, events, state };
}

describe('元智騎士事件追蹤', () => {
  it('大廳與選單不會產生事件', () => {
    const { tracker, events } = setup();
    ['LOAD', 'INS', 'MAIN', 'LOBBY'].forEach(tracker.onBackdrop);
    tracker.onBroadcast('回答正確');
    expect(events).toEqual([]);
  });

  it('一關的完整流程：開始 → 答錯 → 答對 → 過關', () => {
    const { tracker, events, state } = setup();
    tracker.onBackdrop('LOBBY');
    tracker.onBackdrop('1-1');
    tracker.onBackdrop('ANS 1-1');
    state.sender = 'wo';
    tracker.onBroadcast('回答錯誤');
    state.sender = '(正解)ga2';
    tracker.onBroadcast('回答正確');
    tracker.onBroadcast('答題成功');
    tracker.onBackdrop('1-1'); // 答完題後遊戲把背景切回同一關
    tracker.onBackdrop('1-2');

    expect(events).toEqual([
      ['GAME_STARTED', {}],
      ['LEVEL_STARTED', { level_key: '1-1' }],
      ['QUESTION_ANSWERED', { level_key: '1-1', question_key: 'Q72', choice: 'wo', is_correct: false }],
      ['QUESTION_ANSWERED', { level_key: '1-1', question_key: 'Q72', choice: '(正解)ga2', is_correct: true }],
      ['LEVEL_COMPLETED', { level_key: '1-1' }],
      ['LEVEL_STARTED', { level_key: '1-2' }],
    ]);
  });

  it('題號補零成題庫代號', () => {
    const { tracker, events, state } = setup();
    tracker.onBackdrop('1-1');
    state.question = 3;
    tracker.onBroadcast('回答正確');
    expect(events.at(-1)[1].question_key).toBe('Q03');
  });

  it('魔王戰過關與通關結算', () => {
    const { tracker, events } = setup();
    tracker.onBackdrop('1-1');
    tracker.onBackdrop('2-X');
    tracker.onBroadcast('擊倒魔王');
    tracker.onBackdrop('THE END');
    expect(events.slice(-2)).toEqual([
      ['LEVEL_COMPLETED', { level_key: '2-X' }],
      ['GAME_FINISHED', { outcome: 'cleared', battle_score: 120 }],
    ]);
  });

  it('Game Over 後回大廳再進第一關，是新的一局', () => {
    const { tracker, events } = setup();
    tracker.onBackdrop('1-1');
    tracker.onBackdrop('GAME OVER');
    tracker.onBackdrop('GAME OVER');
    tracker.onBackdrop('LOBBY');
    tracker.onBackdrop('1-1');
    expect(events.map(([type]) => type)).toEqual([
      'GAME_STARTED', 'LEVEL_STARTED', 'GAME_FINISHED', 'GAME_STARTED', 'LEVEL_STARTED',
    ]);
    expect(events[2][1].outcome).toBe('failed');
  });

  it('沒有從第一關開始的進度不會開局', () => {
    const { tracker, events } = setup();
    tracker.onBackdrop('1-X');
    tracker.onBroadcast('擊倒魔王');
    expect(events).toEqual([]);
  });
});
