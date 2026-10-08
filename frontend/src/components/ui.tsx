import type { ReactNode } from 'react';

export function PageTitle({ kana, children, aside }: { kana: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="font-pixel text-xs tracking-[0.4em] text-shu">{kana}</div>
        <h1 className="heading text-2xl sm:text-3xl">{children}</h1>
      </div>
      {aside}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="panel">
      <div className="text-xs font-bold tracking-widest text-mist">{label}</div>
      <div className="mt-1 font-pixel text-3xl text-washi">{value}</div>
      {hint && <div className="mt-1 text-xs text-mist/70">{hint}</div>}
    </div>
  );
}

export function LoadingPanel({ label = '読み込み中…' }: { label?: string }) {
  return <div className="panel animate-pulse text-center font-pixel tracking-widest text-mist">{label}</div>;
}

export function ErrorPanel({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : '發生未預期的錯誤';
  return (
    <div className="panel border-shu/60 text-center" role="alert">
      <div className="font-pixel text-shu">讀取失敗</div>
      <div className="mt-1 text-sm text-mist">{message}</div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded border border-shu/60 bg-shu/15 px-3 py-2 text-sm text-washi">
      {message}
    </div>
  );
}
