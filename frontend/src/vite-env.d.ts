/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 播放器 iframe 的來源；未設定時與前端同源 */
  readonly VITE_GAME_ORIGIN?: string;
}
