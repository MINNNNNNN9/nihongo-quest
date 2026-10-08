import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { LoadingPanel } from './components/ui';
import { GuestOnly, RequireAuth } from './features/auth/AuthContext';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages';
import { ClassDetailPage, ClassesPage } from './pages/ClassesPage';
import { GamePage } from './pages/GamePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LobbyPage } from './pages/LobbyPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReviewPage } from './pages/ReviewPage';

// 圖表函式庫較大，只有進到修行紀錄頁才載入
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));

export function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      {/* 重設密碼的連結可能在已登入其他帳號的瀏覽器打開，所以不限制登入狀態 */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/games/:slug" element={<GamePage />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<LoadingPanel />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/:code" element={<ClassDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
