import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Torii, Wordmark } from '../components/Layout';
import { FormError } from '../components/ui';
import { useAuthActions } from '../features/auth/AuthContext';
import { api, ApiError } from '../lib/api';

function AuthShell({ title, kana, children }: { title: string; kana: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-6 text-center">
          <Torii className="mx-auto h-14 w-14 text-shu" />
          <Wordmark className="mt-3 block text-4xl" />
          <div className="mt-2 text-sm tracking-[0.3em] text-mist">日文冒險學習平台</div>
        </div>
        <div className="panel">
          <div className="eyebrow">{kana}</div>
          <h1 className="heading mb-4 text-xl">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

const errorText = (error: unknown) => (error instanceof ApiError ? error.summary : error ? '發生未預期的錯誤' : null);

export function LoginPage() {
  const { login } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    login.mutate(form, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <AuthShell title="冒險者登入" kana="ログイン">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="username">帳號</label>
          <input
            id="username"
            className="field"
            autoComplete="username"
            required
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">密碼</label>
          <input
            id="password"
            type="password"
            className="field"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="text-right text-sm">
          <Link to="/forgot-password" className="text-mist hover:text-shu hover:underline">
            忘記密碼？
          </Link>
        </div>
        <FormError message={errorText(login.error)} />
        <button type="submit" className="btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? '登入中…' : '進入冒險世界'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-mist">
        還沒有冒險者證？{' '}
        <Link to="/register" className="font-bold text-shu hover:underline">
          立即註冊
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuthActions();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', display_name: '', password: '' });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    register.mutate(form, { onSuccess: () => navigate('/', { replace: true }) });
  };

  return (
    <AuthShell title="登錄冒險者" kana="しんきとうろく">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="username">帳號</label>
          <input
            id="username"
            className="field"
            autoComplete="username"
            required
            pattern="[A-Za-z0-9_]{3,30}"
            value={form.username}
            onChange={set('username')}
          />
          <p className="mt-1 text-xs text-mist/70">3–30 個英數字或底線，只用來登入，不會公開。</p>
        </div>
        <div>
          <label className="label" htmlFor="display_name">冒險者暱稱</label>
          <input
            id="display_name"
            className="field"
            required
            minLength={2}
            maxLength={20}
            value={form.display_name}
            onChange={set('display_name')}
          />
          <p className="mt-1 text-xs text-mist/70">會顯示在排行榜上，請不要使用真實姓名。</p>
        </div>
        <div>
          <label className="label" htmlFor="email">電子郵件</label>
          <input id="email" type="email" className="field" autoComplete="email" required value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="password">密碼</label>
          <input
            id="password"
            type="password"
            className="field"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set('password')}
          />
          <p className="mt-1 text-xs text-mist/70">至少 8 個字元，不能全是數字或太常見。</p>
        </div>
        <FormError message={errorText(register.error)} />
        <button type="submit" className="btn-primary w-full" disabled={register.isPending}>
          {register.isPending ? '登錄中…' : '領取冒險者證'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-mist">
        已經是冒險者？{' '}
        <Link to="/login" className="font-bold text-shu hover:underline">
          登入
        </Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const config = useQuery({
    queryKey: ['password-reset-config'],
    queryFn: () => api.get<{ enabled: boolean }>('/auth/password/forgot/'),
  });
  const request = useMutation({ mutationFn: () => api.post<void>('/auth/password/forgot/', { email: email.trim() }) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    request.mutate();
  };

  return (
    <AuthShell title="找回密碼" kana="パスワードをわすれた">
      {config.data?.enabled === false ? (
        <p className="rounded-lg bg-night-900 p-4 text-sm leading-relaxed">
          這個網站目前沒有開啟寄信功能，沒辦法用電子郵件重設密碼。請聯絡你的老師或管理員，請他們在後台幫你重設。
        </p>
      ) : request.isSuccess ? (
        <p className="rounded-lg bg-matcha/10 p-4 text-sm leading-relaxed" role="status">
          如果這個信箱有註冊過，重設密碼的連結已經寄出，請在 2 小時內打開信裡的連結。
          <br />
          沒收到的話，看一下垃圾信匣，或確認信箱有沒有打錯。
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-mist">輸入註冊時填的電子郵件，我們會寄一封重設密碼的信給你，信裡也會寫你的登入帳號。</p>
          <div>
            <label className="label" htmlFor="forgot-email">
              電子郵件
            </label>
            <input
              id="forgot-email"
              type="email"
              className="field"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <FormError message={errorText(request.error)} />
          <button type="submit" className="btn-primary w-full" disabled={request.isPending || config.isPending}>
            {request.isPending ? '寄送中…' : '寄出重設連結'}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-mist">
        <Link to="/login" className="font-bold text-shu hover:underline">
          回登入頁
        </Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const reset = useMutation({
    mutationFn: () =>
      api.post<void>('/auth/password/reset/', { uid: params.get('uid') ?? '', token: params.get('token') ?? '', new_password: password }),
  });
  const mismatch = confirm !== '' && confirm !== password;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mismatch) reset.mutate();
  };

  return (
    <AuthShell title="設定新密碼" kana="あたらしいパスワード">
      {reset.isSuccess ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-matcha/10 p-4 text-sm" role="status">
            密碼已經更新，請用新密碼登入。
          </p>
          <Link to="/login" className="btn-primary w-full">
            前往登入
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="new-password">
              新密碼
            </label>
            <input
              id="new-password"
              type="password"
              className="field"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-mist/70">至少 8 個字元，不能全是數字或太常見。</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">
              再輸入一次
            </label>
            <input
              id="confirm-password"
              type="password"
              className="field"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <FormError message={mismatch ? '兩次輸入的密碼不一樣' : errorText(reset.error)} />
          <button type="submit" className="btn-primary w-full" disabled={reset.isPending || mismatch}>
            {reset.isPending ? '更新中…' : '更新密碼'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
