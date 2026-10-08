import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ExpBar, LevelBadge } from '../components/ExpBar';
import { ErrorPanel, LoadingPanel, PageTitle } from '../components/ui';
import { useMe } from '../features/auth/AuthContext';
import { api } from '../lib/api';
import { formatDateTime, SESSION_STATUS_LABEL } from '../lib/format';
import type { Dashboard, Game } from '../lib/types';

function GameCard({ game }: { game: Game }) {
  const percent = game.levels_total ? Math.round((game.levels_cleared / game.levels_total) * 100) : 0;
  return (
    <Link
      to={`/games/${game.slug}`}
      className="panel group block overflow-hidden p-0 transition hover:-translate-y-1 hover:border-gold/70"
    >
      <div className="relative grid h-36 place-items-center bg-[radial-gradient(circle_at_30%_20%,#3a3f76,#12142b)]">
        <span className="font-pixel text-5xl text-gold drop-shadow-[0_4px_0_#00000088] transition group-hover:scale-110">
          ⚔
        </span>
        <span className="chip absolute left-3 top-3 border-shu/60 text-washi">Scratch</span>
        {percent === 100 && <span className="chip absolute right-3 top-3 border-gold text-gold">全破</span>}
      </div>
      <div className="p-5">
        <h3 className="heading text-xl">{game.title}</h3>
        <div className="text-sm text-mist">{game.subtitle}</div>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-washi/80">{game.description}</p>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-mist">
            <span>已通關關卡</span>
            <span>
              {game.levels_cleared} / {game.levels_total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-night-950">
            <div className="h-full bg-matcha transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="btn-primary mt-4 w-full">{game.last_played_at ? '繼續冒險' : '開始冒險'}</div>
      </div>
    </Link>
  );
}

export function LobbyPage() {
  const { data: me } = useMe();
  const games = useQuery({ queryKey: ['games'], queryFn: () => api.get<Game[]>('/games/') });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/player/dashboard/') });
  if (!me) return null;

  const lastPlayed = games.data
    ?.filter((g) => g.last_played_at)
    .sort((a, b) => (a.last_played_at! < b.last_played_at! ? 1 : -1))[0];
  const cleared = dashboard.data?.levels.filter((l) => l.clears > 0) ?? [];

  return (
    <div className="space-y-6">
      <section className="panel flex animate-rise flex-col gap-5 sm:flex-row sm:items-center">
        <div className="px-3">
          <LevelBadge level={me.progress.level} size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-xs tracking-[0.4em] text-shu">おかえりなさい</div>
          <h1 className="truncate text-2xl font-black sm:text-3xl">{me.display_name}</h1>
          <div className="mb-3 text-sm text-mist">
            稱號：<span className="font-bold text-gold">{me.progress.title}</span>　累積 {me.total_exp} EXP
          </div>
          <ExpBar progress={me.progress} />
        </div>
        {lastPlayed && (
          <Link to={`/games/${lastPlayed.slug}`} className="btn-danger shrink-0 px-6 py-3">
            ▶ 繼續《{lastPlayed.title}》
          </Link>
        )}
      </section>

      <section>
        <PageTitle kana="クエスト">日文學習遊戲</PageTitle>
        {games.isPending && <LoadingPanel />}
        {games.isError && <ErrorPanel error={games.error} />}
        {games.data && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {games.data.map((game) => (
              <GameCard key={game.slug} game={game} />
            ))}
            <div className="panel grid min-h-48 place-items-center border-dashed text-center text-mist">
              <div>
                <div className="font-pixel text-3xl">？</div>
                <div className="mt-2 text-sm">新的冒險準備中…</div>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel">
          <h2 className="heading mb-3 text-lg">最近的冒險</h2>
          {dashboard.isPending && <div className="text-sm text-mist">読み込み中…</div>}
          {dashboard.data?.recent_sessions.length === 0 && (
            <p className="text-sm text-mist">還沒有紀錄。選一個遊戲開始你的第一場冒險吧！</p>
          )}
          <ul className="divide-y divide-night-600/60">
            {dashboard.data?.recent_sessions.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-bold">{s.game_title}</div>
                  <div className="text-xs text-mist">{formatDateTime(s.started_at)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`chip ${s.status === 'cleared' ? 'border-gold text-gold' : ''}`}>
                    {SESSION_STATUS_LABEL[s.status]}
                  </span>
                  <div className="mt-0.5 text-xs text-mist">過 {s.levels_cleared} 關</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2 className="heading mb-3 text-lg">已完成關卡</h2>
          {cleared.length === 0 ? (
            <p className="text-sm text-mist">通關後，關卡徽章會收藏在這裡。</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {cleared.map((level) => (
                <li key={`${level.game}-${level.key}`} className="chip border-gold/60 py-1 text-gold" title={level.title}>
                  {level.key} <span className="ml-1 text-mist">×{level.clears}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
