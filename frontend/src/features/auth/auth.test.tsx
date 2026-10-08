import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';

const profile = {
  username: 'taro',
  email: 'taro@example.com',
  display_name: '太郎',
  show_on_leaderboard: true,
  total_exp: 150,
  progress: { level: 2, title: '見習騎士', total_exp: 150, exp_into_level: 50, exp_for_next_level: 200 },
  created_at: '2026-10-08T00:00:00Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data: unknown) => json(200, { success: true, data, error: null });
const fail = (status: number, message: string) =>
  json(status, { success: false, data: null, error: { code: 'error', message, details: null } });

function renderApp(route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('登入流程與受保護頁面', () => {
  let loggedIn: boolean;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loggedIn = false;
    document.cookie = 'csrftoken=test-token';
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me/') return loggedIn ? ok(profile) : fail(403, '未登入');
      if (url === '/api/auth/login/') {
        const body = JSON.parse(String(init?.body));
        if (body.password !== 'correct') return fail(400, '帳號或密碼錯誤');
        loggedIn = true;
        return ok(profile);
      }
      if (url === '/api/games/') return ok([]);
      if (url === '/api/player/dashboard/') return ok({ recent_sessions: [], levels: [] });
      return fail(404, 'not found');
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('未登入時，受保護頁面會導向登入頁', async () => {
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: '冒險者登入' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/player/dashboard/', expect.anything());
  });

  it('密碼錯誤時顯示錯誤訊息', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('帳號'), 'taro');
    await user.type(screen.getByLabelText('密碼'), 'wrong');
    await user.click(screen.getByRole('button', { name: '進入冒險世界' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('帳號或密碼錯誤');
  });

  it('登入成功後進入大廳，並帶上 CSRF 標頭', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('帳號'), 'taro');
    await user.type(screen.getByLabelText('密碼'), 'correct');
    await user.click(screen.getByRole('button', { name: '進入冒險世界' }));

    expect(await screen.findByRole('heading', { name: '太郎' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '日文學習遊戲' })).toBeInTheDocument();
    const login = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login/')!;
    expect(login[1].headers['X-CSRFToken']).toBe('test-token');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/games/', expect.anything()));
  });
});
