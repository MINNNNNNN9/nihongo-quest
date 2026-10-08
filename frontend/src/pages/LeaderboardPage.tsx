import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { LevelBadge } from '../components/ExpBar';
import { ErrorPanel, LoadingPanel, PageTitle } from '../components/ui';
import { api } from '../lib/api';
import type { Leaderboard, LeaderboardEntry } from '../lib/types';

type Board = 'exp' | 'score';

const BOARDS: { id: Board; label: string; unit: string; note: string }[] = [
  { id: 'exp', label: '累積 EXP', unit: 'EXP', note: '所有遊戲累積的經驗值。' },
  {
    id: 'score',
    label: '最高評價',
    unit: '分',
    note: '全破場次的最高總評價（答題評價由伺服器計算；戰鬥評價由遊戲端回報，僅供參考）。',
  },
];

const MEDAL = ['🥇', '🥈', '🥉'];

function Row({ entry, unit }: { entry: LeaderboardEntry; unit: string }) {
  return (
    <li
      className={`flex items-center gap-3 rounded px-3 py-2 ${
        entry.is_me ? 'border-2 border-gold bg-gold/10' : 'bg-night-900'
      }`}
    >
      <span className="w-9 text-center font-pixel text-lg text-mist">{MEDAL[entry.rank - 1] ?? entry.rank}</span>
      <LevelBadge level={entry.level} size="sm" />
      <span className="min-w-0 flex-1 truncate pl-2 font-bold">
        {entry.display_name}
        {entry.is_me && <span className="ml-2 text-xs text-gold">（你）</span>}
      </span>
      <span className="font-pixel text-lg text-gold">
        {entry.value} <span className="text-xs text-mist">{unit}</span>
      </span>
    </li>
  );
}

export function LeaderboardPage() {
  const [board, setBoard] = useState<Board>('exp');
  const meta = BOARDS.find((b) => b.id === board)!;
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['leaderboard', board],
    queryFn: () => api.get<Leaderboard>(`/leaderboard/?board=${board}`),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle kana="えいゆうのいしぶみ">英雄榜</PageTitle>

      <div role="tablist" aria-label="排行榜類型" className="flex gap-2">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={board === b.id}
            className={board === b.id ? 'btn-danger' : 'btn-ghost'}
            onClick={() => setBoard(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-mist">{meta.note}</p>

      {isPending && <LoadingPanel />}
      {isError && <ErrorPanel error={error} />}
      {data && (
        <>
          <section className="panel">
            {data.entries.length === 0 ? (
              <p className="py-6 text-center text-sm text-mist">還沒有人上榜，成為第一位英雄吧！</p>
            ) : (
              <ol className="space-y-2">
                {data.entries.map((entry) => (
                  <Row key={`${entry.rank}-${entry.display_name}`} entry={entry} unit={meta.unit} />
                ))}
              </ol>
            )}
          </section>

          <section className="panel">
            <h2 className="heading mb-2 text-lg">我的排名</h2>
            {data.hidden ? (
              <p className="text-sm text-mist">
                你已設定不公開於排行榜。可以到{' '}
                <Link to="/profile" className="font-bold text-gold hover:underline">
                  冒險者證
                </Link>{' '}
                重新開啟。
              </p>
            ) : data.me ? (
              <ul>
                <Row entry={data.me} unit={meta.unit} />
              </ul>
            ) : (
              <p className="text-sm text-mist">
                {board === 'exp' ? '通關任一關卡取得 EXP 後就會上榜。' : '全破一次遊戲後就會上榜。'}
              </p>
            )}
          </section>
        </>
      )}
      <p className="text-xs text-mist/70">排行榜只會顯示冒險者暱稱與等級，不會顯示帳號或電子郵件。</p>
    </div>
  );
}
