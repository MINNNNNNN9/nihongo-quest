import { useSyncExternalStore } from 'react';

import type { RubySegment } from '../lib/types';

const STORAGE_KEY = 'nq:furigana';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true; // 無法使用 localStorage（隱私模式等）時預設顯示
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 是否顯示假名標註。設定存在瀏覽器裡，所有頁面共用。 */
export function useFurigana(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => true);
  const set = (next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* 存不了就只在這次生效 */
    }
    listeners.forEach((listener) => listener());
  };
  return [on, set];
}

export function FuriganaToggle() {
  const [on, set] = useFurigana();
  return (
    <button type="button" className="btn-ghost px-3 py-1 text-xs" aria-pressed={on} onClick={() => set(!on)}>
      <span lang="ja">ふりがな</span>：{on ? '顯示' : '隱藏'}
    </button>
  );
}

/** 日文句子，漢字上方標假名。題目裡的「（？）」是要填助詞的位置，可用 blank 換成其他內容。 */
export function RubyText({ segments, blank }: { segments: RubySegment[]; blank?: string }) {
  const [on] = useFurigana();
  // 「から／まで」這種兩格的題目，依序填進兩個空格
  const fills = blank?.split('／') ?? [];
  let blankIndex = 0;
  const nextFill = () => (fills.length > 1 ? (fills[blankIndex++] ?? blank) : blank);
  return (
    <span lang="ja">
      {segments.map(([text, reading], index) => {
        if (reading) {
          return on ? (
            <ruby key={index}>
              {text}
              <rt className="text-[0.55em] font-normal text-mist">{reading}</rt>
            </ruby>
          ) : (
            <span key={index}>{text}</span>
          );
        }
        if (blank === undefined || !text.includes('（？）')) return <span key={index}>{text}</span>;
        const parts = text.split('（？）');
        return (
          <span key={index}>
            {parts.map((part, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1 rounded-lg bg-gold/20 px-2 font-bold text-gold">{nextFill()}</span>}
                {part}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}
