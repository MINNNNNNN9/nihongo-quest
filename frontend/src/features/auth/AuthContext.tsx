import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { api, ApiError } from '../../lib/api';
import type { Profile } from '../../lib/types';

export const ME_KEY = ['me'] as const;

/** 目前登入者；未登入時 data 為 null。 */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<Profile | null> => {
      try {
        return await api.get<Profile>('/auth/me/');
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export interface RegisterInput {
  username: string;
  email: string;
  display_name: string;
  password: string;
}

export function useAuthActions() {
  const queryClient = useQueryClient();
  const signedIn = (profile: Profile) => queryClient.setQueryData(ME_KEY, profile);

  const login = useMutation({
    mutationFn: (input: { username: string; password: string }) => api.post<Profile>('/auth/login/', input),
    onSuccess: signedIn,
  });
  const register = useMutation({
    mutationFn: (input: RegisterInput) => api.post<Profile>('/auth/register/', input),
    onSuccess: signedIn,
  });
  const logout = useMutation({
    mutationFn: () => api.post<void>('/auth/logout/'),
    onSuccess: () => {
      queryClient.clear(); // 清掉前一位使用者的所有快取資料
      queryClient.setQueryData(ME_KEY, null);
    },
  });
  return { login, register, logout };
}

export function FullPageMessage({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center font-pixel tracking-widest text-mist">{children}</div>;
}

/** 需要登入的路由：未登入導向登入頁，並記住原本要去的位置。 */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <FullPageMessage>読み込み中…</FullPageMessage>;
  if (me.isError) return <FullPageMessage>無法連線到伺服器，請稍後再試。</FullPageMessage>;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** 登入／註冊頁：已登入就直接回大廳。 */
export function GuestOnly() {
  const me = useMe();
  if (me.isPending) return <FullPageMessage>読み込み中…</FullPageMessage>;
  if (me.data) return <Navigate to="/" replace />;
  return <Outlet />;
}
