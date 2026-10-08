import { useEffect } from 'react';

import type { Reward } from '../lib/types';
import { LevelBadge } from './ExpBar';

/** 升級演出。點擊或按任意鍵關閉。 */
export function LevelUpOverlay({ reward, onClose }: { reward: Reward; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    window.addEventListener('keydown', onClose);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onClose);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="升級"
      onClick={onClose}
      className="fixed inset-0 z-50 grid cursor-pointer place-items-center bg-black/55 p-4 backdrop-blur-sm"
    >
      <div className="panel w-full max-w-sm animate-pop text-center">
        <div lang="ja" className="eyebrow">
          レベルアップ
        </div>
        <div className="heading mt-1 text-4xl">Level Up</div>
        <div className="mt-6 flex items-center justify-center gap-4">
          <span className="font-serif text-2xl text-mist">Lv.{reward.level_before}</span>
          <span className="text-shu" aria-hidden="true">
            →
          </span>
          <LevelBadge level={reward.progress.level} size="lg" />
        </div>
        <div className="mt-5 text-sm text-mist">
          稱號 <span className="font-serif text-base font-bold text-washi">{reward.progress.title}</span>
        </div>
        <div className="mt-6 text-xs text-mist">點擊任意處繼續</div>
      </div>
    </div>
  );
}
