import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AchievementGrid, useQuestOverview } from '../components/QuestPanel';
import { FuriganaToggle, RubyText } from '../components/Ruby';
import { ErrorPanel, LoadingPanel, PageTitle, StatCard } from '../components/ui';
import { api } from '../lib/api';
import { themeColor, useTheme } from '../lib/theme';
import { formatDateTime, formatDuration, formatPercent, SESSION_STATUS_LABEL } from '../lib/format';
import type { Dashboard } from '../lib/types';

/** 圖表用的顏色跟著目前的配色主題走 */
function chartColors() {
  const c = {
    grid: themeColor('night-600', '#3a3f76'),
    gold: themeColor('gold', '#f2c14e'),
    good: themeColor('matcha', '#86c06c'),
    bad: themeColor('shu', '#e2503c'),
  };
  return {
    ...c,
    axis: { fill: themeColor('mist', '#a9add0'), fontSize: 12 },
    tooltip: {
      contentStyle: {
        background: themeColor('night-900', '#12142b'),
        border: `2px solid ${c.gold}55`,
        borderRadius: 6,
        color: themeColor('washi', '#f6efdd'),
      },
      labelStyle: { color: c.gold },
      cursor: { fill: themeColor('mist', '#a9add0') + '22' },
    },
    accuracy: (rate: number) => (rate >= 0.8 ? c.good : rate >= 0.5 ? c.gold : c.bad),
  };
}


export function DashboardPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/player/dashboard/'),
  });
  const quests = useQuestOverview();
  useTheme(); // 換主題時重新算圖表顏色
  const colors = chartColors();
  if (isPending) return <LoadingPanel />;
  if (isError) return <ErrorPanel error={error} />;

  const topics = data.topics.map((t) => ({ ...t, percent: Math.round((t.accuracy ?? 0) * 100) }));
  const history = data.exp_history.map((h) => ({ ...h, label: h.date.slice(5).replace('-', '/') }));
  const played = data.levels.filter((l) => l.attempts > 0);

  return (
    <div className="space-y-6">
      <PageTitle kana="しゅぎょうのきろく" aside={<FuriganaToggle />}>
        修行紀錄
      </PageTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="累積遊戲次數" value={data.total_sessions} hint={`其中 ${data.cleared_sessions} 次全破`} />
        <StatCard label="總學習時間" value={formatDuration(data.total_seconds)} />
        <StatCard label="助詞題正確率" value={formatPercent(data.accuracy)} hint={`共作答 ${data.questions_answered} 次（含錯題複習）`} />
        <StatCard label="累積經驗值" value={data.progress.total_exp} hint={`Lv.${data.progress.level} ${data.progress.title}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel">
          <h2 className="heading mb-1 text-lg">各助詞正確率</h2>
          <p className="mb-3 text-xs text-mist">紅色代表需要多練習的助詞。</p>
          {topics.length === 0 ? (
            <p className="py-10 text-center text-sm text-mist">開始作答後，這裡會顯示你最拿手和最弱的助詞。</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={topics} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={colors.axis} stroke={colors.grid} />
                  <YAxis type="category" dataKey="label" width={118} tick={colors.axis} stroke={colors.grid} />
                  <Tooltip
                    {...colors.tooltip}
                    formatter={(value: number, _name, item) => [
                      `${value}%（${item.payload.correct}/${item.payload.attempts}）`,
                      '正確率',
                    ]}
                  />
                  <Bar dataKey="percent" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {topics.map((t) => (
                      <Cell key={t.topic} fill={colors.accuracy(t.accuracy ?? 0)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="heading mb-1 text-lg">經驗值成長</h2>
          <p className="mb-3 text-xs text-mist">最近 14 天的累積 EXP。</p>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={history} margin={{ left: -8, right: 12 }}>
                <defs>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.gold} stopOpacity={0.7} />
                    <stop offset="100%" stopColor={colors.gold} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={colors.axis} stroke={colors.grid} interval="preserveStartEnd" />
                <YAxis tick={colors.axis} stroke={colors.grid} allowDecimals={false} />
                <Tooltip
                  {...colors.tooltip}
                  formatter={(value: number, name) => [value, name === 'total' ? '累積 EXP' : '當日獲得']}
                />
                <Area type="monotone" dataKey="total" stroke={colors.gold} strokeWidth={2} fill="url(#exp)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel">
          <h2 className="heading mb-3 text-lg">最常答錯的題目</h2>
          {data.most_missed.length === 0 ? (
            <p className="text-sm text-mist">目前沒有答錯的題目，太強了！</p>
          ) : (
            <ol className="space-y-3">
              {data.most_missed.map((q) => (
                <li key={q.key} className="rounded-lg bg-night-900 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {q.context && (
                        <div className="text-sm text-mist">
                          <RubyText segments={q.context_ruby} />
                        </div>
                      )}
                      <div className="font-bold leading-loose">
                        <RubyText segments={q.prompt_ruby} />
                      </div>
                    </div>
                    <span className="chip shrink-0 border-shu/60 text-shu">錯 {q.wrong} 次</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-mist">正解</span>
                    <span lang="ja" className="rounded-lg bg-matcha/20 px-2 font-bold text-matcha">
                      {q.correct_answer}
                    </span>
                    <span className="chip">{q.topic_label}</span>
                  </div>
                  {q.hint_zh && <div className="mt-1 text-xs text-mist">提示：{q.hint_zh}</div>}
                </li>
              ))}
              <li>
                <Link to="/review" className="btn-primary w-full">
                  去錯題複習把它們練起來 ▶
                </Link>
              </li>
            </ol>
          )}
        </section>

        <section className="panel">
          <h2 className="heading mb-3 text-lg">各關卡完成率</h2>
          {played.length === 0 ? (
            <p className="text-sm text-mist">還沒有挑戰過任何關卡。</p>
          ) : (
            <ul className="space-y-2">
              {played.map((level) => (
                <li key={`${level.game}-${level.key}`} className="text-sm">
                  <div className="mb-0.5 flex justify-between">
                    <span>{level.title}</span>
                    <span className="text-mist">
                      {level.clears}/{level.attempts}　{formatPercent(level.completion_rate)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-night-700">
                    <div className="h-full bg-sora" style={{ width: `${(level.completion_rate ?? 0) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {quests.data && <AchievementGrid achievements={quests.data.achievements} />}

      <section className="panel">
        <h2 className="heading mb-3 text-lg">最近學習歷史</h2>
        {data.recent_sessions.length === 0 ? (
          <p className="text-sm text-mist">還沒有遊玩紀錄。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs tracking-wide text-mist">
                <tr>
                  <th className="pb-2 font-bold">時間</th>
                  <th className="pb-2 font-bold">遊戲</th>
                  <th className="pb-2 font-bold">結果</th>
                  <th className="pb-2 text-right font-bold">過關數</th>
                  <th className="pb-2 text-right font-bold">總評價</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-600/60">
                {data.recent_sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 text-mist">{formatDateTime(s.started_at)}</td>
                    <td className="py-2">{s.game_title}</td>
                    <td className="py-2">
                      <span className={`chip ${s.status === 'cleared' ? 'border-gold text-gold' : ''}`}>
                        {SESSION_STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="py-2 text-right">{s.levels_cleared}</td>
                    <td className="py-2 text-right font-pixel">{s.total_score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
