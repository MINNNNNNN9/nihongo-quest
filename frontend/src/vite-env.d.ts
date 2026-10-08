/// <reference types="vite/client" />

/** 建置代號（vite.config.ts 的 define） */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** 播放器 iframe 的來源；未設定時與前端同源 */
  readonly VITE_GAME_ORIGIN?: string;
}
