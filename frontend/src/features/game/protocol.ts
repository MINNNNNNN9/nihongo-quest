import { z } from 'zod';

/** 播放器（iframe）→ React 的訊息格式。與 public/player/bridge.js 對應。 */
export const GAME_MESSAGE_SOURCE = 'nihongo-quest-game';
export const PROTOCOL_VERSION = 1;

const levelKey = z.string().min(1).max(20);

const payloads = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PLAYER_READY'), payload: z.object({}) }),
  z.object({ type: z.literal('GAME_STARTED'), payload: z.object({}) }),
  z.object({ type: z.literal('LEVEL_STARTED'), payload: z.object({ level_key: levelKey }) }),
  z.object({
    type: z.literal('QUESTION_ANSWERED'),
    payload: z.object({
      level_key: levelKey,
      question_key: z.string().min(1).max(20),
      choice: z.string().max(40),
      is_correct: z.boolean(),
    }),
  }),
  z.object({ type: z.literal('LEVEL_COMPLETED'), payload: z.object({ level_key: levelKey }) }),
  z.object({
    type: z.literal('GAME_FINISHED'),
    payload: z.object({ outcome: z.enum(['cleared', 'failed']), battle_score: z.number().int().nullable() }),
  }),
  z.object({ type: z.literal('GAME_ERROR'), payload: z.object({ message: z.string().max(500) }) }),
]);

const envelope = z.object({
  source: z.literal(GAME_MESSAGE_SOURCE),
  version: z.literal(PROTOCOL_VERSION),
  game: z.string().regex(/^[a-z0-9-]+$/),
});

export type GameMessage = z.infer<typeof payloads> & { game: string };

export interface MessageContext {
  /** 允許的播放器來源（origin） */
  allowedOrigin: string;
  /** 我們自己嵌入的那個 iframe 的 window */
  expectedSource: MessageEventSource | null;
  /** 目前頁面的遊戲 slug */
  game: string;
}

/**
 * 驗證 postMessage：來源 origin、來源視窗、訊息結構三者都要符合，否則回傳 null。
 *
 * 注意：這只能擋掉「別的網頁／別的 iframe」亂送訊息，不是防作弊。
 * 玩家本人可以在自己的瀏覽器裡偽造完全合法的訊息，所以獎勵一律由後端重新判定。
 */
export function parseGameMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, ctx: MessageContext) {
  if (event.origin !== ctx.allowedOrigin) return null;
  if (!ctx.expectedSource || event.source !== ctx.expectedSource) return null;
  const head = envelope.safeParse(event.data);
  if (!head.success || head.data.game !== ctx.game) return null;
  const body = payloads.safeParse(event.data);
  if (!body.success) return null;
  return { ...body.data, game: head.data.game } as GameMessage;
}
