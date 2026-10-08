import { useEffect, useState, type ReactNode } from 'react';

const SEEN_KEY = 'nq:tutorial-seen';

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // 存不了就不要每次都跳出來
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

function Key({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <kbd
      className={`inline-grid h-10 place-items-center rounded-lg border border-night-600 bg-night-900 font-pixel text-washi ${
        wide ? 'px-6' : 'w-10'
      }`}
    >
      {children}
    </kbd>
  );
}

const STEPS: { title: string; body: ReactNode; art: ReactNode }[] = [
  {
    title: '移動與射擊',
    art: (
      <div className="flex items-end justify-center gap-6">
        <div className="grid grid-cols-3 gap-1">
          <span />
          <Key>W</Key>
          <span />
          <Key>A</Key>
          <Key>S</Key>
          <Key>D</Key>
        </div>
        <div className="text-center text-4xl" aria-hidden="true">
          🖱️
        </div>
      </div>
    ),
    body: (
      <>
        用 <b>W A S D</b> 移動，<b>滑鼠</b>瞄準、按住<b>左鍵</b>射擊。
        <br />
        手機或平板：左下角搖桿移動，<b>點畫面</b>就是瞄準加射擊。
      </>
    ),
  },
  {
    title: '進入第一關',
    art: (
      <div className="flex flex-col items-center gap-2">
        <div className="text-4xl" aria-hidden="true">
          🚪
        </div>
        <div className="font-pixel text-mist" aria-hidden="true">
          ▲
        </div>
        <Key wide>空白鍵</Key>
      </div>
    ),
    body: (
      <>
        按下「冒険を始める」後會先到大廳。<b>往上走到門口</b>，按<b>空白鍵</b>就能進入第一關。
        <br />
        空白鍵也用來打開魔法書教材、進傳送門（手機是右下角的「互動」鈕）。
      </>
    ),
  },
  {
    title: '打怪，然後回答助詞',
    art: (
      <div className="text-center text-2xl leading-loose" lang="ja">
        私
        <span className="mx-1 rounded-lg bg-gold/20 px-2 font-bold text-gold">？</span>
        エンジニアです。
      </div>
    ),
    body: (
      <>
        打倒怪物後會出現日文句子，<b>點選正確的助詞</b>就能過關、拿到 EXP。
        <br />
        答錯時，畫面旁邊的「作答解說」會顯示中文意思與文法重點。HP 歸零要從頭再來。
      </>
    ),
  },
  {
    title: '答錯也沒關係',
    art: (
      <div className="text-center text-4xl" aria-hidden="true">
        📖 🔥
      </div>
    ),
    body: (
      <>
        答錯的題目會自動收進<b>「錯題複習」</b>，不用進遊戲就能再練。
        <br />
        每天完成大廳的<b>今日任務</b>可以多拿 EXP，連續學習還能解鎖成就。
      </>
    ),
  },
];

/** 新手教學。第一次進遊戲頁會自動出現，之後可以從「玩法說明」再打開。 */
export function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const close = () => {
    markSeen();
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const current = STEPS[step];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
    >
      <div className="panel w-full max-w-md animate-rise space-y-4">
        <div className="flex items-center justify-between">
          <div className="eyebrow">あそびかた {step + 1}/{STEPS.length}</div>
          <button type="button" className="text-sm text-mist hover:text-gold" onClick={close}>
            略過
          </button>
        </div>
        <h2 id="tutorial-title" className="heading text-xl">
          {current.title}
        </h2>
        <div className="grid min-h-28 place-items-center rounded-lg bg-night-900 p-4">{current.art}</div>
        <p className="text-sm leading-relaxed text-washi/90">{current.body}</p>
        <div className="flex items-center justify-between">
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={step === 0} onClick={() => setStep(step - 1)}>
            ◀ 上一步
          </button>
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((_, index) => (
              <span key={index} className={`h-2 w-2 rounded-full ${index === step ? 'bg-gold' : 'bg-night-600'}`} />
            ))}
          </div>
          <button type="button" className="btn-primary px-3 py-1.5 text-sm" autoFocus onClick={last ? close : () => setStep(step + 1)}>
            {last ? '開始冒險！' : '下一步 ▶'}
          </button>
        </div>
      </div>
    </div>
  );
}
