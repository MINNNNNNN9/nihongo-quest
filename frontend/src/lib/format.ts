export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘`;
  return `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const SESSION_STATUS_LABEL = {
  in_progress: '進行中',
  cleared: '通關',
  failed: 'Game Over',
  abandoned: '中途離開',
} as const;
