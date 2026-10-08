import { useEffect, useState } from 'react';

import type { Feedback } from '../lib/types';
import { RubyText } from './Ruby';

interface Props {
  feedback: Feedback;
  isCorrect: boolean;
  /** 遊戲進行中答錯時先不直接給答案，讓玩家看提示再試一次 */
  hideAnswer?: boolean;
}

/** 作答後的解說：題目、你選的答案、中文提示、正解與文法重點。 */
export function FeedbackCard({ feedback, isCorrect, hideAnswer = false }: Props) {
  const [revealed, setRevealed] = useState(!hideAnswer);
  useEffect(() => setRevealed(!hideAnswer), [feedback, hideAnswer]);
  const showAnswer = isCorrect || revealed;

  return (
    <div
      className={`animate-rise rounded-lg border p-3 text-sm ${
        isCorrect ? 'border-matcha/60 bg-matcha/10' : 'border-shu/60 bg-shu/10'
      }`}
    >
      <div className={`mb-2 font-pixel tracking-wide ${isCorrect ? 'text-matcha' : 'text-shu'}`}>
        {isCorrect ? '⭕ 正解！' : showAnswer ? '❌ 答錯了' : '❌ 再想想'}
      </div>
      {feedback.context && (
        <div className="text-mist">
          <RubyText segments={feedback.context_ruby} />
        </div>
      )}
      <div className="text-base font-bold leading-loose">
        <RubyText segments={feedback.prompt_ruby} blank={showAnswer ? feedback.correct_answer : undefined} />
      </div>
      {!isCorrect && feedback.choice && (
        <div className="mt-1 text-mist">
          你選的是 <span lang="ja" className="font-bold text-shu">{feedback.choice}</span>
        </div>
      )}
      {feedback.hint_zh && <div className="mt-2 text-washi/90">中文：{feedback.hint_zh}</div>}
      {showAnswer ? (
        feedback.note && (
          <p className="mt-2 border-t border-night-600 pt-2 text-xs leading-relaxed text-mist">
            <span className="chip mr-2">{feedback.topic_label}</span>
            {feedback.note}
          </p>
        )
      ) : (
        <button type="button" className="btn-ghost mt-3 w-full py-1.5 text-xs" onClick={() => setRevealed(true)}>
          看正解與文法重點
        </button>
      )}
    </div>
  );
}
