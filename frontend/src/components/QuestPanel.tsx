import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ME_KEY } from '../features/auth/AuthContext';
import { api, ApiError } from '../lib/api';
import type { Achievement, Progress, Quest, QuestOverview } from '../lib/types';
import { Icon } from './icons';

export const QUESTS_KEY = ['quests'] as const;

export function useQuestOverview() {
  return useQuery({ queryKey: QUESTS_KEY, queryFn: () => api.get<QuestOverview>('/player/quests/') });
}

function QuestRow({ quest }: { quest: Quest }) {
  const queryClient = useQueryClient();
  const claim = useMutation({
    mutationFn: () => api.post<{ exp_awarded: number; progress: Progress }>(`/player/quests/${quest.key}/claim/`),
    onSuccess: ({ progress }) => {
      queryClient.setQueryData(ME_KEY, (me: unknown) =>
        me ? { ...(me as object), total_exp: progress.total_exp, progress } : me,
      );
      queryClient.invalidateQueries({ queryKey: QUESTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const percent = Math.round((quest.progress / quest.target) * 100);

  return (
    <li className="rounded-lg bg-night-900 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`font-bold ${quest.claimed ? 'text-mist line-through' : ''}`}>{quest.title}</div>
          <div className="text-xs text-mist">{quest.detail}</div>
        </div>
        {quest.claimed ? (
          <span className="chip shrink-0 border-matcha/60 text-matcha">已領取</span>
        ) : quest.done ? (
          <button type="button" className="btn-primary shrink-0 px-3 py-1 text-sm" disabled={claim.isPending} onClick={() => claim.mutate()}>
            領取 +{quest.reward}
          </button>
        ) : (
          <Link to={quest.link} className="btn-ghost shrink-0 px-3 py-1 text-sm">
            去練習
          </Link>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-night-700">
          <div className={`h-full transition-[width] ${quest.done ? 'bg-gold' : 'bg-sora'}`} style={{ width: `${percent}%` }} />
        </div>
        <span className="font-pixel text-xs text-mist">
          {quest.progress}/{quest.target}
        </span>
      </div>
      {claim.isError && (
        <div className="mt-1 text-xs text-shu">{claim.error instanceof ApiError ? claim.error.message : '領取失敗'}</div>
      )}
    </li>
  );
}

/** 冒險大廳：連續學習天數與今日任務。 */
export function QuestPanel() {
  const { data } = useQuestOverview();
  if (!data) return null; // 讀取中或失敗時不佔版面，不影響大廳其他內容
  const { streak, quests } = data;
  const fresh = data.achievements.filter((a) => a.is_new);

  return (
    <section className="panel space-y-4">
      {fresh.length > 0 && (
        <div className="animate-pop rounded-lg border border-gold bg-gold/15 px-3 py-2 text-sm font-bold text-gold">
          🎉 解鎖新成就：{fresh.map((a) => `${a.icon} ${a.title}`).join('、')}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="heading text-lg">今日任務</h2>
        <div className="flex items-center gap-2 text-sm" title={`最長紀錄 ${streak.best} 天`}>
          <span className={streak.active_today ? 'text-shu' : 'text-mist/60'}>
            <Icon name="flame" />
          </span>
          <span className="text-mist">
            連續 <span className="font-serif text-xl font-bold text-washi">{streak.current}</span> 天
          </span>
          {!streak.active_today && <span className="text-xs text-shu">{streak.current > 0 ? '今天還沒練習！' : '今天開始吧'}</span>}
        </div>
      </div>
      <ul className="grid gap-3">
        {quests.map((quest) => (
          <QuestRow key={quest.key} quest={quest} />
        ))}
      </ul>
      <p className="text-xs text-mist/70">任務每天午夜更新；遊戲內作答與錯題複習都會計入。</p>
    </section>
  );
}

export function AchievementGrid({ achievements }: { achievements: Achievement[] }) {
  const unlocked = achievements.filter((a) => a.unlocked_at).length;
  return (
    <section className="panel">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="heading text-lg">成就</h2>
        <span className="font-pixel text-sm text-mist">
          {unlocked} / {achievements.length}
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {achievements.map((a) => (
          <li
            key={a.key}
            className={`rounded-lg border p-3 text-center ${
              a.unlocked_at ? 'border-gold/60 bg-gold/10' : 'border-night-600 bg-night-900'
            }`}
          >
            <div className={`text-3xl ${a.unlocked_at ? '' : 'opacity-30 grayscale'}`} aria-hidden="true">
              {a.icon}
            </div>
            <div lang="ja" className={`mt-1 text-sm font-bold ${a.unlocked_at ? 'text-gold' : 'text-washi'}`}>
              {a.title}
            </div>
            <div className="mt-0.5 text-xs text-mist">{a.description}</div>
            {!a.unlocked_at && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-night-700">
                  <div className="h-full bg-sora" style={{ width: `${(a.progress / a.target) * 100}%` }} />
                </div>
                <div className="mt-0.5 font-pixel text-[10px] text-mist">
                  {a.progress}/{a.target}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
