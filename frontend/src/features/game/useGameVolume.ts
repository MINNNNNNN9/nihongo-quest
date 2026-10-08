import { useEffect, useState, type RefObject } from 'react';

import { GAME_ORIGIN } from './useGameBridge';

/** 外層頁面 → 播放器（iframe）的訊息。與 public/player/bridge.js 對應。 */
export const HOST_MESSAGE_SOURCE = 'nihongo-quest-host';
// 播放器同源時也會直接讀這個值，遊戲一載入就是上次的音量
const STORAGE_KEY = 'nq:volume';
const DEFAULT = { level: 50, muted: false };

interface VolumeSetting {
  /** 滑桿位置 0–100 */
  level: number;
  muted: boolean;
}

function read(): VolumeSetting {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && typeof saved.level === 'number' && typeof saved.muted === 'boolean') {
      return { level: Math.min(100, Math.max(0, saved.level)), muted: saved.muted };
    }
  } catch {
    /* 讀不到就用預設值 */
  }
  return DEFAULT;
}

/** 滑桿位置換成實際增益：用平方曲線，滑桿拉一半聽起來才像一半。 */
export const gainFor = ({ level, muted }: VolumeSetting) => (muted ? 0 : (level / 100) ** 2);

/**
 * 遊戲音量。設定存在瀏覽器裡；`resend` 變動時（例如播放器剛載入完成）會再送一次給播放器。
 */
export function useGameVolume(iframeRef: RefObject<HTMLIFrameElement | null>, resend: unknown) {
  const [setting, setSetting] = useState<VolumeSetting>(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setting));
    } catch {
      /* 存不了就只在這次生效 */
    }
    iframeRef.current?.contentWindow?.postMessage(
      { source: HOST_MESSAGE_SOURCE, type: 'SET_VOLUME', value: gainFor(setting) },
      GAME_ORIGIN,
    );
  }, [iframeRef, setting, resend]);

  return {
    ...setting,
    // 拉動滑桿就視為要聽聲音；拉到 0 等同靜音
    setLevel: (level: number) => setSetting({ level, muted: level === 0 }),
    toggleMuted: () => setSetting((s) => ({ level: s.muted && s.level === 0 ? DEFAULT.level : s.level, muted: !s.muted })),
  };
}
