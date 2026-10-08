import type { Progress } from '../lib/types';

/** 等級章：朱色的印章（判子）樣式。 */
export function LevelBadge({ level, size = 'md' }: { level: number; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'h-9 w-9 rounded-lg text-base', md: 'h-14 w-14 rounded-xl text-2xl', lg: 'h-20 w-20 rounded-2xl text-4xl' }[size];
  return (
    <div
      className={`${box} grid shrink-0 place-items-center bg-shu font-serif font-bold leading-none text-white`}
      aria-label={`等級 ${level}`}
    >
      <span className="text-center">
        <span className="block text-[0.36em] font-medium tracking-[0.15em] opacity-80">Lv</span>
        {level}
      </span>
    </div>
  );
}

export function ExpBar({ progress, compact = false }: { progress: Progress; compact?: boolean }) {
  const percent = Math.min(100, Math.round((progress.exp_into_level / progress.exp_for_next_level) * 100));
  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium text-mist">經驗值</span>
          <span className="font-serif text-mist">
            {progress.exp_into_level} / {progress.exp_for_next_level}
          </span>
        </div>
      )}
      <div
        className={`${compact ? 'h-1' : 'h-2'} overflow-hidden rounded-full bg-night-700`}
        role="progressbar"
        aria-label="經驗值"
        aria-valuemin={0}
        aria-valuemax={progress.exp_for_next_level}
        aria-valuenow={progress.exp_into_level}
      >
        <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
