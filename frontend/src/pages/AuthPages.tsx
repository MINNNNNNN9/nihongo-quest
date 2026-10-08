import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Torii, Wordmark } from '../components/Layout';
import { FormError } from '../components/ui';
import { useAuthActions } from '../features/auth/AuthContext';
import { ApiError } from '../lib/api';

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
