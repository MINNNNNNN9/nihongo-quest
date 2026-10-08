import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { LevelBadge } from '../components/ExpBar';
import { RubyText } from '../components/Ruby';
import { ErrorPanel, FormError, LoadingPanel, PageTitle, StatCard } from '../components/ui';
import { useMe } from '../features/auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatDateTime, formatPercent } from '../lib/format';
import type { ClassroomDetail, ClassroomSummary } from '../lib/types';

const CLASSES_KEY = ['classes'] as const;
const errorText = (error: unknown) => (error instanceof ApiError ? error.summary : error ? '發生未預期的錯誤' : null);
const accuracyTone = (rate: number | null) =>
  rate === null ? 'text-mist' : rate >= 0.8 ? 'text-matcha' : rate >= 0.5 ? 'text-gold' : 'text-shu';

export function ClassesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const { data: me } = useMe();
  const canTeach = Boolean(me?.is_teacher || me?.is_staff);
  const classes = useQuery({ queryKey: CLASSES_KEY, queryFn: () => api.get<ClassroomSummary[]>('/classes/') });

  const opened = (classroom: ClassroomSummary) => {
    queryClient.invalidateQueries({ queryKey: CLASSES_KEY });
    navigate(`/classes/${classroom.code}`);
  };
  const join = useMutation({
    mutationFn: () => api.post<ClassroomSummary>('/classes/join/', { code: code.trim() }),
    onSuccess: opened,
  });
  const create = useMutation({
    mutationFn: () => api.post<ClassroomSummary>('/classes/', { name: name.trim() }),
    onSuccess: opened,
  });
  const submit = (mutate: () => void) => (event: FormEvent) => {
    event.preventDefault();
    mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageTitle kana="クラス">班級</PageTitle>

      <section className="panel">
        <h2 className="heading mb-3 text-lg">我的班級</h2>
        {classes.isPending && <LoadingPanel />}
        {classes.isError && <ErrorPanel error={classes.error} />}
        {classes.data?.length === 0 && <p className="text-sm text-mist">還沒有加入或建立任何班級。</p>}
        <ul className="space-y-2">
          {classes.data?.map((c) => (
            <li key={c.code}>
              <Link
                to={`/classes/${c.code}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-night-900 px-4 py-3 transition hover:bg-night-700"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold">{c.name}</div>
                  <div className="text-xs text-mist">
                    老師：{c.teacher_name}　{c.member_count} 位學生
                  </div>
                </div>
                <span className={`chip shrink-0 ${c.is_teacher ? 'border-gold text-gold' : ''}`}>
                  {c.is_teacher ? '我是老師' : '學生'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <form className="panel space-y-3" onSubmit={submit(join.mutate)}>
          <h2 className="heading text-lg">加入班級</h2>
          <div>
            <label className="label" htmlFor="class-code">
              老師給的 6 碼代碼
            </label>
            <input
              id="class-code"
              className="field font-pixel uppercase tracking-[0.3em]"
              value={code}
              maxLength={6}
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-mist">
            加入後，老師可以看到你的暱稱、等級、作答數與正確率；同班同學只會看到暱稱、等級與 EXP。
          </p>
          <FormError message={errorText(join.error)} />
          <button type="submit" className="btn-primary w-full" disabled={join.isPending || code.trim().length !== 6}>
            加入
          </button>
        </form>

        {!canTeach && (
          <section className="panel space-y-2">
            <h2 className="heading text-lg">建立班級（老師）</h2>
            <p className="text-sm leading-relaxed text-mist">
              只有老師帳號可以建立班級。如果你是老師，請聯絡網站管理員幫你開通；學生用左邊的代碼加入班級就可以了。
            </p>
          </section>
        )}
        <form className={canTeach ? 'panel space-y-3' : 'hidden'} onSubmit={submit(create.mutate)}>
          <h2 className="heading text-lg">建立班級（老師）</h2>
          <div>
            <label className="label" htmlFor="class-name">
              班級名稱
            </label>
            <input
              id="class-name"
              className="field"
              value={name}
              maxLength={40}
              placeholder="例：日文一 A"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-mist">建立後會得到一組加入代碼，把它給學生就可以了。</p>
          <FormError message={errorText(create.error)} />
          <button type="submit" className="btn-ghost w-full" disabled={create.isPending || name.trim().length < 2}>
            建立
          </button>
        </form>
      </div>
    </div>
  );
}

function TeacherReport({ report }: { report: NonNullable<ClassroomDetail['report']> }) {
  const weakest = [...report.topics].filter((t) => t.accuracy !== null).sort((a, b) => a.accuracy! - b.accuracy!)[0];
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="學生人數" value={report.students.length} />
        <StatCard label="全班作答數" value={report.questions_answered} />
        <StatCard label="全班正確率" value={formatPercent(report.accuracy)} />
        <StatCard label="最弱的助詞" value={weakest ? weakest.label.split('（')[0] : '—'} hint={weakest && formatPercent(weakest.accuracy)} />
      </div>

      <section className="panel">
        <h2 className="heading mb-3 text-lg">各助詞正確率</h2>
        {report.topics.length === 0 ? (
          <p className="text-sm text-mist">學生開始作答後，這裡會顯示全班各助詞的正確率。</p>
        ) : (
          <ul className="space-y-2">
            {report.topics.map((t) => (
              <li key={t.topic} className="text-sm">
                <div className="mb-0.5 flex justify-between">
                  <span>{t.label}</span>
                  <span className={accuracyTone(t.accuracy)}>
                    {formatPercent(t.accuracy)}　<span className="text-mist">{t.correct}/{t.attempts}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-night-700">
                  <div
                    className={`h-full ${(t.accuracy ?? 0) >= 0.8 ? 'bg-matcha' : (t.accuracy ?? 0) >= 0.5 ? 'bg-gold' : 'bg-shu'}`}
                    style={{ width: `${(t.accuracy ?? 0) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="heading mb-3 text-lg">全班最常答錯的題目</h2>
        {report.most_missed.length === 0 ? (
          <p className="text-sm text-mist">目前沒有答錯的紀錄。</p>
        ) : (
          <ol className="space-y-2">
            {report.most_missed.map((q) => (
              <li key={q.key} className="flex items-start justify-between gap-3 rounded-lg bg-night-900 p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-bold leading-loose">
                    <RubyText segments={q.prompt_ruby} blank={q.correct_answer} />
                  </div>
                  <div className="text-xs text-mist">{q.hint_zh}</div>
                </div>
                <span className="chip shrink-0 border-shu/60 text-shu">
                  錯 {q.wrong}/{q.attempts}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2 className="heading mb-3 text-lg">學生名單</h2>
        {report.students.length === 0 ? (
          <p className="text-sm text-mist">還沒有學生加入。把上面的加入代碼給學生吧。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs tracking-wide text-mist">
                <tr>
                  <th className="pb-2 font-bold">暱稱</th>
                  <th className="pb-2 text-right font-bold">等級</th>
                  <th className="pb-2 text-right font-bold">EXP</th>
                  <th className="pb-2 text-right font-bold">通關數</th>
                  <th className="pb-2 text-right font-bold">作答</th>
                  <th className="pb-2 text-right font-bold">正確率</th>
                  <th className="pb-2 text-right font-bold">最後練習</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-600/60">
                {report.students.map((s) => (
                  <tr key={s.display_name}>
                    <td className="py-2 font-bold">{s.display_name}</td>
                    <td className="py-2 text-right">Lv.{s.level}</td>
                    <td className="py-2 text-right font-pixel text-gold">{s.total_exp}</td>
                    <td className="py-2 text-right">{s.levels_cleared}</td>
                    <td className="py-2 text-right">{s.answered}</td>
                    <td className={`py-2 text-right ${accuracyTone(s.accuracy)}`}>{formatPercent(s.accuracy)}</td>
                    <td className="py-2 text-right text-mist">{s.last_active ? formatDateTime(s.last_active) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function ClassDetailPage() {
  const { code = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useQuery({
    queryKey: [...CLASSES_KEY, code],
    queryFn: () => api.get<ClassroomDetail>(`/classes/${encodeURIComponent(code)}/`),
  });
  const exit = useMutation({
    mutationFn: (kind: 'leave' | 'delete') =>
      kind === 'leave' ? api.post<void>(`/classes/${code}/leave/`) : api.delete<void>(`/classes/${code}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLASSES_KEY });
      navigate('/classes');
    },
  });

  if (isPending) return <LoadingPanel />;
  if (isError) return <ErrorPanel error={error} />;

  const confirmExit = (kind: 'leave' | 'delete') => {
    const message = kind === 'leave' ? `確定要退出「${data.name}」嗎？` : `確定要刪除「${data.name}」嗎？所有學生都會被移出，無法復原。`;
    if (window.confirm(message)) exit.mutate(kind);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link to="/classes" className="text-sm text-mist hover:text-gold">
          ← 回班級列表
        </Link>
        <PageTitle
          kana="クラス"
          aside={
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-xs"
              disabled={exit.isPending}
              onClick={() => confirmExit(data.is_teacher ? 'delete' : 'leave')}
            >
              {data.is_teacher ? '刪除班級' : '退出班級'}
            </button>
          }
        >
          {data.name}
        </PageTitle>
        <div className="-mt-3 text-sm text-mist">
          老師：{data.teacher_name}　{data.member_count} 位學生
        </div>
      </div>
      <FormError message={errorText(exit.error)} />

      {data.is_teacher && (
        <section className="panel flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold tracking-wide text-mist">加入代碼</div>
            <div className="font-pixel text-4xl tracking-[0.3em] text-gold">{data.code}</div>
          </div>
          <p className="max-w-xs text-xs text-mist">學生登入後到「班級」頁輸入這組代碼就能加入。只有你看得到下面的學習報告。</p>
        </section>
      )}

      {data.report && <TeacherReport report={data.report} />}

      <section className="panel">
        <h2 className="heading mb-3 text-lg">班級排行榜</h2>
        {data.leaderboard.length === 0 ? (
          <p className="text-sm text-mist">還沒有學生加入。</p>
        ) : (
          <ol className="space-y-2">
            {data.leaderboard.map((entry) => (
              <li
                key={entry.rank}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  entry.is_me ? 'border border-gold bg-gold/10' : 'bg-night-900'
                }`}
              >
                <span className="w-9 text-center font-pixel text-lg text-mist">{['🥇', '🥈', '🥉'][entry.rank - 1] ?? entry.rank}</span>
                <LevelBadge level={entry.level} size="sm" />
                <span className="min-w-0 flex-1 truncate pl-2 font-bold">
                  {entry.display_name}
                  {entry.is_me && <span className="ml-2 text-xs text-gold">（你）</span>}
                </span>
                <span className="font-pixel text-lg text-gold">
                  {entry.value} <span className="text-xs text-mist">EXP</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
