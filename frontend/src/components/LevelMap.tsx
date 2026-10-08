import type { GameLevel } from '../lib/types';

interface Props {
  levels: GameLevel[];
  /** 這一局目前所在的關卡 */
  currentKey?: string | null;
  /** 這一局已經過關的關卡 */
  runCleared?: string[];
}

/** 關卡地圖：依章節排成一條冒險路線。 */
export function LevelMap({ levels, currentKey = null, runCleared = [] }: Props) {
  const chapters = [...new Set(levels.map((l) => l.chapter))];
  return (
    <div className="space-y-5">
      {chapters.map((chapter) => (
        <div key={chapter}>
          <div className="mb-3 font-pixel text-sm tracking-widest text-mist">第 {chapter} 章</div>
          <ol className="flex flex-wrap items-center gap-y-4">
            {levels
              .filter((l) => l.chapter === chapter)
              .map((level, index) => {
                const isCurrent = level.key === currentKey;
                const done = level.cleared || runCleared.includes(level.key);
                const boss = level.kind === 'boss';
                return (
                  <li key={level.key} className="flex items-center">
                    {index > 0 && (
                      <span className={`h-1 w-5 sm:w-8 ${done ? 'bg-gold' : 'bg-night-600'}`} aria-hidden="true" />
                    )}
                    <div
                      title={`${level.title}｜首次通關 +${level.exp_reward} EXP｜已通關 ${level.clear_count} 次`}
                      className={`relative grid place-items-center border-2 font-pixel transition ${
                        boss ? 'h-14 w-14 rotate-45 rounded-md' : 'h-11 w-11 rounded-full'
                      } ${
                        done
                          ? 'border-gold bg-gold/20 text-gold'
                          : 'border-night-600 bg-night-900 text-mist'
                      } ${isCurrent ? 'animate-float border-shu shadow-[0_0_16px_#e2503c]' : ''}`}
                    >
                      <span className={boss ? '-rotate-45 text-lg' : 'text-xs'}>{boss ? '👹' : level.key}</span>
                      {done && (
                        <span
                          className={`absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-matcha text-[10px] text-night-950 ${
                            boss ? '-rotate-45' : ''
                          }`}
                        >
                          ✓
                        </span>
                      )}
                      <span className="sr-only">
                        {level.title}
                        {done ? '（已通關）' : ''}
                        {isCurrent ? '（進行中）' : ''}
                      </span>
                    </div>
                  </li>
                );
              })}
          </ol>
        </div>
      ))}
    </div>
  );
}
