import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuthActions, useMe } from '../features/auth/AuthContext';
import { ExpBar, LevelBadge } from './ExpBar';
import { Icon, type IconName } from './icons';
import { ThemePicker } from './ThemePicker';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '冒險大廳', icon: 'home' },
  { to: '/review', label: '錯題複習', icon: 'book' },
  { to: '/dashboard', label: '修行紀錄', icon: 'chart' },
  { to: '/leaderboard', label: '英雄榜', icon: 'trophy' },
  { to: '/classes', label: '班級', icon: 'users' },
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

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-serif font-bold tracking-wide text-washi ${className}`}>
      Nihongo <span className="text-shu">Quest</span>
    </span>
  );
}

export function Layout() {
  const { data: me } = useMe();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  if (!me) return null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
      isActive ? 'bg-night-700 font-bold text-washi' : 'font-medium text-mist hover:bg-night-700/60 hover:text-washi'
    }`;

  return (
    <div className="min-h-dvh pb-24 lg:pb-12">
      <header className="sticky top-0 z-20 border-b border-night-600 bg-night-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-x-4 px-4 xl:gap-x-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <Torii className="h-7 w-7 text-shu" />
            <Wordmark className="text-lg" />
          </NavLink>

          <nav className="hidden gap-1 lg:flex" aria-label="主選單">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {/* 等級與暱稱就是「冒險者證」的入口 */}
            <NavLink
              to="/profile"
              title="冒險者證"
              className={({ isActive }) =>
                `flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-night-700 ${
                  isActive ? 'bg-night-700' : ''
                }`
              }
            >
              <LevelBadge level={me.progress.level} size="sm" />
              <div className="hidden w-32 min-w-0 sm:block">
                <div className="truncate text-sm font-bold leading-tight">{me.display_name}</div>
                <div className="mt-1">
                  <ExpBar progress={me.progress} compact />
                </div>
              </div>
            </NavLink>
            <ThemePicker />
            <button
              type="button"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mist transition hover:bg-night-700 hover:text-washi"
              aria-label="登出"
              title="登出"
              disabled={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8">
        <Outlet />
      </main>

      {/* 手機：底部分頁列 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-night-600 bg-night-800/95 backdrop-blur lg:hidden"
        aria-label="主選單"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? 'font-bold text-shu' : 'text-mist'}`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
