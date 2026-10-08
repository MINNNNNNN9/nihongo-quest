import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuthActions, useMe } from '../features/auth/AuthContext';
import { ExpBar, LevelBadge } from './ExpBar';

const NAV = [
  { to: '/', label: '冒險大廳', icon: '⛩' },
  { to: '/dashboard', label: '修行紀錄', icon: '📜' },
  { to: '/leaderboard', label: '英雄榜', icon: '🏆' },
  { to: '/profile', label: '冒險者證', icon: '🪪' },
];

export function Torii({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M12 22h40v6H12zM18 28h6v24h-6zM40 28h6v24h-6zM8 14c8 4 40 4 48 0v6c-8 4-40 4-48 0z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Layout() {
  const { data: me } = useMe();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  if (!me) return null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded px-3 py-2 text-sm font-bold tracking-wider transition ${
      isActive ? 'bg-shu text-white shadow-[0_3px_0_#7c2418]' : 'text-mist hover:bg-night-700 hover:text-washi'
    }`;

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-24 md:pb-10">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
        <NavLink to="/" className="flex items-center gap-2">
          <Torii className="h-9 w-9 text-shu" />
          <span className="font-pixel text-xl tracking-[0.2em] text-washi">
            Nihongo<span className="text-gold">Quest</span>
          </span>
        </NavLink>

        <nav className="hidden gap-1 md:flex" aria-label="主選單">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <LevelBadge level={me.progress.level} size="sm" />
          <div className="w-28 sm:w-40">
            <div className="truncate text-sm font-bold">{me.display_name}</div>
            <ExpBar progress={me.progress} compact />
          </div>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
          >
            登出
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* 手機：底部分頁列 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t-2 border-gold/25 bg-night-900/95 backdrop-blur md:hidden"
        aria-label="主選單"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs font-bold ${isActive ? 'text-gold' : 'text-mist'}`
            }
          >
            <span className="text-lg" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
