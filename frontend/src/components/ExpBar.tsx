import type { Progress } from '../lib/types';

export function LevelBadge({ level, size = 'md' }: { level: number; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'h-9 w-9 text-sm', md: 'h-14 w-14 text-xl', lg: 'h-20 w-20 text-3xl' }[size];
  return (
    <div
      className={`${box} relative grid shrink-0 rotate-45 place-items-center rounded-md border-2 border-gold bg-gradient-to-br from-shu to-[#8f2a1d] shadow-[0_0_18px_#e2503c66]`}
      aria-label={`等級 ${level}`}
    >
      <span className="-rotate-45 font-pixel leading-none text-washi">
        <span className="block text-[0.45em] tracking-widest text-gold">Lv</span>
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
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="font-pixel tracking-widest text-gold">EXP</span>
          <span className="text-mist">
            {progress.exp_into_level} / {progress.exp_for_next_level}
          </span>
        </div>
      )}
      <div
        className={`${compact ? 'h-2' : 'h-4'} overflow-hidden rounded-sm border border-night-600 bg-night-950`}
        role="progressbar"
        aria-label="經驗值"
        aria-valuemin={0}
        aria-valuemax={progress.exp_for_next_level}
        aria-valuenow={progress.exp_into_level}
      >
        <div
          className="h-full animate-shine bg-[linear-gradient(90deg,#86c06c,#f2c14e,#86c06c)] bg-[length:200%_100%] transition-[width] duration-700"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
