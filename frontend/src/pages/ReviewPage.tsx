import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { FeedbackCard } from '../components/FeedbackCard';
import { FuriganaToggle, RubyText } from '../components/Ruby';
import { ErrorPanel, LoadingPanel, PageTitle } from '../components/ui';
import { ME_KEY } from '../features/auth/AuthContext';
import { api } from '../lib/api';
import type { ReviewAnswer, ReviewQuestion, ReviewSummary } from '../lib/types';

type Mode = 'mistakes' | 'mixed';

interface Round {
  questions: ReviewQuestion[];
  index: number;
  results: ReviewAnswer[];
  /** 目前這一題的作答結果；null 表示還沒作答 */
  current: ReviewAnswer | null;
}

function choiceClass(choice: string, answer: ReviewAnswer | null) {
  if (!answer) return 'btn-ghost';
  if (choice === answer.feedback.correct_answer) return 'btn-ghost border-matcha bg-matcha/20 text-matcha';
  if (choice === answer.feedback.choice) return 'btn-ghost border-shu bg-shu/20 text-shu';
  return 'btn-ghost opacity-40';
}

function RoundResult({ round, onAgain }: { round: Round; onAgain: () => void }) {
  const correct = round.results.filter((r) => r.is_correct).length;
  const exp = round.results.reduce((sum, r) => sum + r.exp_awarded, 0);
  const wrong = round.results.filter((r) => !r.is_correct);
  return (
    <section className="panel animate-rise space-y-4 text-center">
      <div className="eyebrow">おつかれさま</div>
      <div className="font-pixel text-5xl text-gold">
        {correct} <span className="text-2xl text-mist">/ {round.results.length}</span>
      </div>
      <div className="text-sm text-mist">
        這一輪獲得 <span className="font-bold text-gold">+{exp} EXP</span>
        {wrong.length === 0 && '　全對，太強了！'}
      </div>
      {wrong.length > 0 && (
        <div className="space-y-2 text-left">
          <h3 className="heading text-sm">這一輪答錯的題目</h3>
          {wrong.map((r, index) => (
            <FeedbackCard key={index} feedback={r.feedback} isCorrect={false} />
          ))}
          <p className="text-xs text-mist">答錯的題目會留在「待複習」，之後答對就會消掉。</p>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className="btn-primary" onClick={onAgain}>
          再來一輪
        </button>
        <Link to="/" className="btn-ghost">
          回冒險大廳
        </Link>
      </div>
    </section>
  );
}

export function ReviewPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const topic = params.get('topic') ?? '';
  const [round, setRound] = useState<Round | null>(null);
  const [mode, setMode] = useState<Mode>('mixed');

  const summary = useQuery({ queryKey: ['review'], queryFn: () => api.get<ReviewSummary>('/review/') });

  const start = useMutation({
    mutationFn: (next: Mode) =>
      api.get<ReviewQuestion[]>(`/review/next/?mode=${next}${topic ? `&topic=${encodeURIComponent(topic)}` : ''}`),
    onSuccess: (questions) => setRound({ questions, index: 0, results: [], current: null }),
  });

  const answer = useMutation({
    mutationFn: (input: { question_id: number; choice: string }) => api.post<ReviewAnswer>('/review/answer/', input),
    onSuccess: (result) => {
      setRound((r) => (r ? { ...r, current: result, results: [...r.results, result] } : r));
      queryClient.setQueryData(ME_KEY, (me: unknown) =>
        me ? { ...(me as object), total_exp: result.progress.total_exp, progress: result.progress } : me,
      );
      for (const key of ['review', 'quests', 'dashboard', 'leaderboard']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  const begin = (next: Mode) => {
    setMode(next);
    start.mutate(next);
  };
  const question = round ? round.questions[round.index] : null;
  const finished = round !== null && round.index >= round.questions.length;
  const goNext = () => setRound((r) => (r ? { ...r, index: r.index + 1, current: null } : r));

  const topicInfo = summary.data?.topics.find((t) => t.topic === topic);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle kana="ふくしゅう" aside={<FuriganaToggle />}>
        錯題複習
      </PageTitle>

      {/* 選單：還沒開始一輪 */}
      {!round && (
        <>
          {summary.isPending && <LoadingPanel />}
          {summary.isError && <ErrorPanel error={summary.error} />}
          {summary.data && (
            <>
              <section className="panel space-y-4">
                <p className="text-sm leading-relaxed text-washi/90">
                  不用進遊戲、手機也能練。每輪 10 題，答錯過的題目會優先出現；答對一題 +2 EXP（今天已拿{' '}
                  {summary.data.exp_today} / {summary.data.exp_daily_cap}）。
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    className="btn-danger py-3"
                    disabled={start.isPending || (topicInfo ? topicInfo.pending : summary.data.pending) === 0}
                    onClick={() => begin('mistakes')}
                  >
                    只練答錯的題目（{topicInfo ? topicInfo.pending : summary.data.pending}）
                  </button>
                  <button type="button" className="btn-primary py-3" disabled={start.isPending} onClick={() => begin('mixed')}>
                    綜合練習
                  </button>
                </div>
                {summary.data.pending === 0 && (
                  <p className="text-xs text-mist">目前沒有待複習的題目。在遊戲或綜合練習中答錯的題目會出現在這裡。</p>
                )}
                {start.isError && <ErrorPanel error={start.error} />}
              </section>

              <section className="panel">
                <h2 className="heading mb-1 text-lg">選擇助詞</h2>
                <p className="mb-3 text-xs text-mist">只想練某一個助詞時先點它，再按上面的按鈕。紅色數字是待複習的題數。</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={topic === '' ? 'btn-danger px-3 py-1.5 text-sm' : 'btn-ghost px-3 py-1.5 text-sm'}
                    onClick={() => setParams({})}
                  >
                    全部
                  </button>
                  {summary.data.topics.map((t) => (
                    <button
                      key={t.topic}
                      type="button"
                      aria-pressed={topic === t.topic}
                      className={topic === t.topic ? 'btn-danger px-3 py-1.5 text-sm' : 'btn-ghost px-3 py-1.5 text-sm'}
                      onClick={() => setParams({ topic: t.topic })}
                    >
                      {t.label}
                      {t.pending > 0 && <span className="ml-1 rounded-full bg-shu px-1.5 text-xs text-white">{t.pending}</span>}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* 一輪沒有題目（例如該助詞沒有待複習的題） */}
      {round && round.questions.length === 0 && (
        <section className="panel text-center">
          <p className="text-sm text-mist">這個條件下沒有題目可以練。</p>
          <button type="button" className="btn-ghost mt-3" onClick={() => setRound(null)}>
            返回
          </button>
        </section>
      )}

      {/* 作答中 */}
      {round && question && (
        <section className="panel space-y-4">
          <div className="flex items-center justify-between text-xs text-mist">
            {/* 作答前不顯示主題名稱，不然等於直接給答案 */}
            <span className="chip">{round.current ? question.topic_label : '請選出正確的助詞'}</span>
            <span className="font-pixel tracking-wide">
              {round.index + 1} / {round.questions.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-night-700">
            <div className="h-full bg-gold transition-[width]" style={{ width: `${(round.index / round.questions.length) * 100}%` }} />
          </div>

          <div className="py-2 text-center">
            {question.context && (
              <div className="text-lg leading-loose text-mist">
                <RubyText segments={question.context_ruby} />
              </div>
            )}
            <div className="text-2xl font-bold leading-loose sm:text-3xl">
              <RubyText segments={question.prompt_ruby} blank={round.current ? round.current.feedback.correct_answer : '？'} />
            </div>
            {question.debt > 0 && !round.current && <div className="mt-1 text-xs text-shu">之前答錯過這一題</div>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {question.choices.map((choice) => (
              <button
                key={choice}
                type="button"
                lang="ja"
                className={`${choiceClass(choice, round.current)} py-4 text-xl`}
                disabled={answer.isPending || Boolean(round.current)}
                onClick={() => answer.mutate({ question_id: question.id, choice })}
              >
                {choice}
              </button>
            ))}
          </div>
          {answer.isError && <ErrorPanel error={answer.error} />}

          {round.current && (
            <>
              <FeedbackCard feedback={round.current.feedback} isCorrect={round.current.is_correct} />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gold">{round.current.exp_awarded > 0 && `+${round.current.exp_awarded} EXP`}</span>
                <button type="button" className="btn-primary" autoFocus onClick={goNext}>
                  {round.index + 1 < round.questions.length ? '下一題 ▶' : '看結果'}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {round && finished && round.questions.length > 0 && <RoundResult round={round} onAgain={() => begin(mode)} />}

      {round && !finished && (
        <button type="button" className="text-sm text-mist hover:text-gold" onClick={() => setRound(null)}>
          ← 結束這一輪
        </button>
      )}
    </div>
  );
}
