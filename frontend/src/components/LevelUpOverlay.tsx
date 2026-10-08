import { useEffect } from 'react';

import type { Reward } from '../lib/types';

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
      className="fixed inset-0 z-50 grid cursor-pointer place-items-center bg-night-950/80 backdrop-blur-sm"
    >
      <div className="text-center">
        <div className="animate-pop font-pixel text-5xl tracking-[0.3em] text-gold drop-shadow-[0_0_24px_#f2c14e] sm:text-7xl">
          LEVEL UP!
        </div>
        <div className="mt-6 animate-rise font-pixel text-2xl tracking-widest text-washi [animation-delay:0.3s]">
          Lv.{reward.level_before} <span className="text-shu">▶</span>{' '}
          <span className="text-4xl text-gold">Lv.{reward.progress.level}</span>
        </div>
        <div className="mt-3 animate-rise text-lg text-mist [animation-delay:0.5s]">
          稱號：<span className="font-bold text-washi">{reward.progress.title}</span>
        </div>
        <div className="mt-8 animate-rise text-sm text-mist/70 [animation-delay:0.9s]">點擊任意處繼續</div>
      </div>
    </div>
  );
}
