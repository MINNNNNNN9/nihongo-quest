import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { ExpBar, LevelBadge } from '../components/ExpBar';
import { FormError, PageTitle } from '../components/ui';
import { ME_KEY, useMe } from '../features/auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { ExperienceEntry, Paginated, Profile } from '../lib/types';

const errorText = (error: unknown) => (error instanceof ApiError ? error.summary : error ? '發生未預期的錯誤' : null);

function ProfileForm({ me }: { me: Profile }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    display_name: me.display_name,
    email: me.email,
    show_on_leaderboard: me.show_on_leaderboard,
  });
  const save = useMutation({
    mutationFn: () => api.patch<Profile>('/auth/me/', form),
    onSuccess: (profile) => {
      queryClient.setQueryData(ME_KEY, profile);
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="panel space-y-4">
      <h2 className="heading text-lg">個人資料</h2>
      <div>
        <label className="label" htmlFor="display_name">冒險者暱稱</label>
        <input
          id="display_name"
          className="field"
          required
          minLength={2}
          maxLength={20}
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />
      </div>
      <div>
        <label className="label" htmlFor="email">電子郵件</label>
        <input
          id="email"
          type="email"
          className="field"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded bg-night-900 p-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[#f2c14e]"
          checked={form.show_on_leaderboard}
          onChange={(e) => setForm({ ...form, show_on_leaderboard: e.target.checked })}
        />
        <span>
          <span className="font-bold">公開於英雄榜</span>
          <span className="block text-xs text-mist">關閉後，其他人不會在排行榜看到你的暱稱與成績。</span>
        </span>
      </label>
      <FormError message={errorText(save.error)} />
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? '儲存中…' : '儲存'}
        </button>
        {save.isSuccess && <span className="text-sm text-matcha" role="status">已儲存 ✓</span>}
      </div>
    </form>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ current_password: '', new_password: '' });
  const change = useMutation({
    mutationFn: () => api.post<void>('/auth/password/', form),
    onSuccess: () => setForm({ current_password: '', new_password: '' }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };

  return (
    <form onSubmit={submit} className="panel space-y-4">
      <h2 className="heading text-lg">修改密碼</h2>
      <div>
        <label className="label" htmlFor="current_password">目前密碼</label>
        <input
          id="current_password"
          type="password"
          className="field"
          autoComplete="current-password"
          required
          value={form.current_password}
          onChange={(e) => setForm({ ...form, current_password: e.target.value })}
        />
      </div>
      <div>
        <label className="label" htmlFor="new_password">新密碼</label>
        <input
          id="new_password"
          type="password"
          className="field"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.new_password}
          onChange={(e) => setForm({ ...form, new_password: e.target.value })}
        />
      </div>
      <FormError message={errorText(change.error)} />
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-ghost" disabled={change.isPending}>
          {change.isPending ? '變更中…' : '變更密碼'}
        </button>
        {change.isSuccess && <span className="text-sm text-matcha" role="status">密碼已更新 ✓</span>}
      </div>
    </form>
  );
}

export function ProfilePage() {
  const { data: me } = useMe();
  const experience = useQuery({
    queryKey: ['records', 'experience'],
    queryFn: () => api.get<Paginated<ExperienceEntry>>('/player/experience/?page_size=15'),
  });
  if (!me) return null;

  return (
    <div className="space-y-6">
      <PageTitle kana="ぼうけんしゃしょう">冒險者證</PageTitle>

      <section className="panel flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="px-3">
          <LevelBadge level={me.progress.level} size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-black">{me.display_name}</div>
          <div className="mb-3 text-sm text-mist">
            帳號 {me.username}　稱號 <span className="font-bold text-gold">{me.progress.title}</span>　
            {new Date(me.created_at).toLocaleDateString('zh-TW')} 加入
          </div>
          <ExpBar progress={me.progress} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileForm me={me} />
        <PasswordForm />
      </div>

      <section className="panel">
        <h2 className="heading mb-3 text-lg">經驗值紀錄</h2>
        {experience.data?.results.length === 0 && <p className="text-sm text-mist">還沒有取得經驗值。</p>}
        <ul className="divide-y divide-night-600/60">
          {experience.data?.results.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-bold">
                  {entry.game_title ? `${entry.game_title}｜${entry.level_title}` : entry.reason_label}
                </div>
                <div className="text-xs text-mist">
                  {formatDateTime(entry.created_at)}
                  {entry.is_first_clear === true && '　首次通關'}
                  {entry.is_first_clear === false && '　重玩（三成）'}
                </div>
              </div>
              <span className="shrink-0 font-pixel text-lg text-gold">+{entry.amount}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
