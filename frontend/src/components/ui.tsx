import type { ReactNode } from 'react';

export function PageTitle({ kana, children, aside }: { kana: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div lang="ja" className="eyebrow">
          {kana}
        </div>
        <h1 className="heading mt-1 text-3xl sm:text-4xl">{children}</h1>
      </div>
      {aside}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="panel">
      <div className="text-sm font-medium text-mist">{label}</div>
      <div className="mt-2 font-serif text-4xl font-bold leading-none text-washi">{value}</div>
      {hint && <div className="mt-2 text-xs text-mist">{hint}</div>}
    </div>
  );
}

export function LoadingPanel({ label = '読み込み中…' }: { label?: string }) {
  return (
    <div lang="ja" className="panel animate-pulse text-center text-sm tracking-wide text-mist">
      {label}
    </div>
  );
}

export function ErrorPanel({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : '發生未預期的錯誤';
  return (
    <div className="panel border-shu/50 text-center" role="alert">
      <div className="font-serif font-bold text-shu">讀取失敗</div>
      <div className="mt-1 text-sm text-mist">{message}</div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-shu/40 bg-shu/10 px-3 py-2 text-sm text-washi">
      {message}
    </div>
  );
}
