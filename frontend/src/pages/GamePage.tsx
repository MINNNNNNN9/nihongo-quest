import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';

import { FeedbackCard } from '../components/FeedbackCard';
import { FuriganaToggle } from '../components/Ruby';
import { Icon } from '../components/icons';
import { hasSeenTutorial, Tutorial } from '../components/Tutorial';
import { LevelMap } from '../components/LevelMap';
import { LevelUpOverlay } from '../components/LevelUpOverlay';
import { ErrorPanel, LoadingPanel } from '../components/ui';
import { useGameBridge, type Notice, type PlayerStatus, type RunState } from '../features/game/useGameBridge';
import { useGameVolume } from '../features/game/useGameVolume';
import { api } from '../lib/api';
import type { GameDetail, GameLevel } from '../lib/types';

const STATUS_LABEL: Record<PlayerStatus, string> = {
  loading: '遊戲載入中…',
  ready: '準備完成，按下「冒険を始める」',
  playing: '冒險進行中',
  error: '遊戲載入失敗',
};

const NOTICE_TONE: Record<Notice['tone'], string> = {
  reward: 'border-gold bg-gold/15 text-gold',
  info: 'border-sora bg-sora/15 text-washi',
  warn: 'border-shu bg-shu/20 text-washi',
};

function RunHud({ run, status, levels }: { run: RunState; status: PlayerStatus; levels: GameLevel[] }) {
  const level = levels.find((l) => l.key === run.levelKey);
  const answered = run.correct + run.wrong;
  return (
    <section className="panel space-y-4" aria-live="polite">
      <div>
        <div className="eyebrow">ステータス</div>
        <div className="font-bold">
          {run.outcome === 'cleared' ? '🎉 全破！' : run.outcome === 'failed' ? '💀 Game Over' : STATUS_LABEL[status]}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg bg-night-900 p-2">
          <dt className="text-xs text-mist">目前關卡</dt>
          <dd className="font-pixel text-lg text-washi">{level ? level.key : '—'}</dd>
        </div>
        <div className="rounded-lg bg-night-900 p-2">
          <dt className="text-xs text-mist">本局 EXP</dt>
          <dd className="font-pixel text-lg text-gold">+{run.expEarned}</dd>
        </div>
        <div className="rounded-lg bg-night-900 p-2">
          <dt className="text-xs text-mist">答對</dt>
          <dd className="font-pixel text-lg text-matcha">{run.correct}</dd>
        </div>
        <div className="rounded-lg bg-night-900 p-2">
          <dt className="text-xs text-mist">答錯</dt>
          <dd className="font-pixel text-lg text-shu">{run.wrong}</dd>
        </div>
      </dl>
      {answered > 0 && (
        <div className="text-center text-sm text-mist">
          本局正確率 <span className="font-bold text-washi">{Math.round((run.correct / answered) * 100)}%</span>
        </div>
      )}
      {run.result && (
        <div className="rounded-lg border border-gold/40 bg-night-900 p-3 text-sm">
          <div className="heading mb-1 text-sm">本局結算</div>
          <div className="flex justify-between">
            <span className="text-mist">答題評價</span>
            <span>{run.result.answer_score}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-mist">戰鬥評價</span>
            <span>{run.result.battle_score ?? '—'}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-night-600 pt-1 font-bold text-gold">
            <span>總評價</span>
            <span>{run.result.total_score}</span>
          </div>
          <Link to="/dashboard" className="btn-ghost mt-3 w-full py-1.5 text-xs">
            查看修行紀錄
          </Link>
        </div>
      )}
    </section>
  );
}

export function GamePage() {
  const { slug = '' } = useParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const game = useQuery({ queryKey: ['games', slug], queryFn: () => api.get<GameDetail>(`/games/${slug}/`) });
  const levels = useQuery({
    queryKey: ['levels', slug],
    queryFn: () => api.get<GameLevel[]>(`/games/${slug}/levels/`),
  });
  const bridge = useGameBridge(slug, iframeRef);
  const volume = useGameVolume(iframeRef, bridge.status);
  const [showTutorial, setShowTutorial] = useState(() => !hasSeenTutorial());

  // Scratch 遊戲沒辦法存檔：冒險途中離開，這一局就作廢，所以離開前先提醒
  const inProgress = bridge.status === 'playing' && bridge.run.outcome === null;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => inProgress && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!inProgress) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inProgress]);

  if (game.isPending) return <LoadingPanel />;
  if (game.isError) return <ErrorPanel error={game.error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-mist hover:text-gold">
            ← 回冒險大廳
          </Link>
          <h1 className="heading text-2xl sm:text-3xl">{game.data.title}</h1>
          <div className="text-sm text-mist">{game.data.subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 音量：喇叭鈕切換靜音，滑桿調大小 */}
          <div className="flex items-center gap-1 rounded-lg border border-night-600 bg-night-800 pl-1 pr-3">
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-lg text-washi transition hover:bg-night-700"
              aria-label={volume.muted ? '開啟聲音' : '靜音'}
              aria-pressed={volume.muted}
              title={volume.muted ? '開啟聲音' : '靜音'}
              onClick={volume.toggleMuted}
            >
              <Icon name={volume.muted ? 'mute' : 'volume'} />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volume.muted ? 0 : volume.level}
              aria-label="遊戲音量"
              className="h-1.5 w-24 cursor-pointer accent-shu sm:w-28"
              onChange={(event) => volume.setLevel(Number(event.target.value))}
            />
          </div>
          <button type="button" className="btn-ghost text-sm" onClick={() => setShowTutorial(true)}>
            ？ 玩法說明
          </button>
          <button type="button" className="btn-ghost text-sm" onClick={() => frameRef.current?.requestFullscreen?.()}>
            ⛶ 全螢幕
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div
            ref={frameRef}
            className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-night-600 bg-black shadow-[0_18px_40px_-20px_var(--color-shadow)]"
          >
            <iframe
              ref={iframeRef}
              title={`${game.data.title} 遊戲畫面`}
              src={`/player/index.html?game=${encodeURIComponent(slug)}&b=${__BUILD_ID__}${import.meta.env.DEV ? '&debug=1' : ''}`}
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; fullscreen"
            />
          </div>
          <p className="mt-3 rounded-lg bg-night-900/70 px-3 py-2 text-sm text-mist">
            <span className="font-bold text-washi">操作：</span>
            {game.data.controls}
            <span className="mt-1 block text-xs">手機／平板：左下搖桿移動、點畫面瞄準射擊、右下「互動」鈕＝空白鍵。</span>
          </p>
        </div>

        <aside className="space-y-5">
          <RunHud run={bridge.run} status={bridge.status} levels={levels.data ?? []} />
          <section className="panel space-y-3" aria-live="polite">
            <div className="flex items-center justify-between">
              <h2 className="heading text-sm">作答解說</h2>
              <FuriganaToggle />
            </div>
            {bridge.run.lastAnswer ? (
              <FeedbackCard
                feedback={bridge.run.lastAnswer.feedback}
                isCorrect={bridge.run.lastAnswer.isCorrect}
                hideAnswer
              />
            ) : (
              <p className="text-sm text-mist">在遊戲裡回答助詞題之後，這裡會顯示句子的中文意思與文法重點。</p>
            )}
            {bridge.run.wrong > 0 && (
              <Link to="/review" className="block text-center text-xs text-mist hover:text-gold">
                答錯的題目已收進「錯題複習」
              </Link>
            )}
          </section>
          {bridge.status === 'error' && (
            <div className="panel border-shu/60 text-sm" role="alert">
              遊戲無法載入：{bridge.errorMessage}
            </div>
          )}
        </aside>
      </div>

      <section className="panel">
        <h2 className="heading mb-4 text-lg">冒險地圖</h2>
        {levels.data ? (
          <LevelMap levels={levels.data} currentKey={bridge.run.levelKey} runCleared={bridge.run.clearedLevels} />
        ) : (
          <div className="text-sm text-mist">読み込み中…</div>
        )}
      </section>

      <section className="panel">
        <h2 className="heading mb-2 text-lg">這個遊戲會練到的助詞</h2>
        <p className="mb-3 text-sm leading-relaxed text-washi/80">{game.data.description}</p>
        <ul className="flex flex-wrap gap-2">
          {game.data.topics.map((t) => (
            <li key={t.topic} className="chip py-1">
              <span className="text-washi">{t.label}</span>
              <span className="ml-2">{t.questions} 題</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mist/70">
          學習紀錄會自動保存。經驗值由伺服器依關卡結果計算：首次通關拿全額，重玩同一關為三成。
        </p>
      </section>

      <div className="pointer-events-none fixed bottom-20 right-4 z-40 flex w-72 flex-col gap-2 md:bottom-6" aria-live="polite">
        {bridge.notices.map((notice) => (
          <div key={notice.id} className={`animate-rise rounded-lg border px-3 py-2 text-sm font-bold ${NOTICE_TONE[notice.tone]}`}>
            {notice.text}
          </div>
        ))}
      </div>

      {bridge.levelUp && <LevelUpOverlay reward={bridge.levelUp} onClose={bridge.dismissLevelUp} />}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}

      {blocker.state === 'blocked' && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="leave-title" className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
          <div className="panel w-full max-w-sm space-y-4 text-center">
            <h2 id="leave-title" className="heading text-xl">
              要離開冒險嗎？
            </h2>
            <p className="text-sm leading-relaxed text-washi/90">
              遊戲沒有辦法存檔，現在離開的話<b>這一局會作廢</b>，下次要從 1-1 重新開始。
              <br />
              已經過關拿到的 EXP 和作答紀錄都會保留。
            </p>
            <div className="flex justify-center gap-3">
              <button type="button" className="btn-primary" autoFocus onClick={() => blocker.reset()}>
                繼續冒險
              </button>
              <button type="button" className="btn-ghost" onClick={() => blocker.proceed()}>
                離開
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
