import { useSyncExternalStore } from 'react';

/** 淺色／深色。顏色本身定義在 index.css，這裡只負責切換與記住選擇。 */
export type ThemeId = 'light' | 'dark';

const STORAGE_KEY = 'nq:theme';
const DEFAULT: ThemeId = 'light';
const listeners = new Set<() => void>();

function stored(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** 在畫面出現前套用上次選的主題（main.tsx 呼叫）。 */
export function applyStoredTheme() {
  document.documentElement.dataset.theme = stored();
}

export function setTheme(id: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* 存不了就只在這次生效 */
  }
  document.documentElement.dataset.theme = id;
  listeners.forEach((listener) => listener());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
    () => DEFAULT,
  );
}

/** 讀出目前主題的顏色實際值；給只吃色碼、不吃 CSS 變數的地方用（圖表的 SVG 屬性）。 */
export function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  return value || fallback;
}
