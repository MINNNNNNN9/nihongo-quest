import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackCard } from '../components/FeedbackCard';
import { RubyText } from '../components/Ruby';
import type { Feedback } from '../lib/types';
import { ReviewPage } from './ReviewPage';

const feedback: Feedback = {
  question_id: 1,
  context: '父はエンジニアです。',
  prompt: '私（？）エンジニアです。',
  context_ruby: [['父', 'ちち'], ['はエンジニアです。', '']],
  prompt_ruby: [['私', 'わたし'], ['（？）エンジニアです。', '']],
  choice: 'が',
  correct_answer: 'も',
  hint_zh: '爸爸是工程師。 我也是工程師。',
  topic: 'mo',
  topic_label: 'も（也）',
  note: '「も」＝「也」。',
};

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data, error: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('假名標註', () => {
  afterEach(() => localStorage.clear());

  it('漢字上方顯示假名，空格可以填入答案', () => {
    const { container } = render(<RubyText segments={feedback.prompt_ruby} blank="も" />);
    expect(container.querySelector('rt')).toHaveTextContent('わたし');
    expect(container).toHaveTextContent('私わたしもエンジニアです。');
  });

  it('兩格的題目依序填入「から／まで」', () => {
    const { container } = render(
      <RubyText segments={[['8', ''], ['時', 'じ'], ['（？）5', ''], ['時', 'じ'], ['（？）', '']]} blank="から／まで" />,
    );
    expect(container).toHaveTextContent('8時じから5時じまで');
  });

  it('關掉假名後不輸出 ruby', () => {
    localStorage.setItem('nq:furigana', 'off');
    const { container } = render(<RubyText segments={feedback.prompt_ruby} />);
    expect(container.querySelector('rt')).toBeNull();
  });
});

describe('作答解說', () => {
  it('遊戲中答錯時先給提示，按下按鈕才顯示正解', async () => {
    render(<FeedbackCard feedback={feedback} isCorrect={false} hideAnswer />);
    expect(screen.getByText(/爸爸是工程師/)).toBeInTheDocument();
    expect(screen.queryByText(/「も」＝「也」/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '看正解與文法重點' }));
    expect(screen.getByText(/「も」＝「也」/)).toBeInTheDocument();
  });
});

describe('錯題複習流程', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.cookie = 'csrftoken=test-token';
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/review/') {
        return ok({ pending: 1, exp_today: 0, exp_daily_cap: 40, topics: [{ topic: 'mo', label: 'も（也）', total: 24, pending: 1 }] });
      }
      if (url.startsWith('/api/review/next/')) {
        return ok([
          {
            id: 1, topic: 'mo', topic_label: 'も（也）', context: feedback.context, prompt: feedback.prompt,
            context_ruby: feedback.context_ruby, prompt_ruby: feedback.prompt_ruby, choices: ['が', 'も', 'は', 'を'], debt: 1,
          },
        ]);
      }
      if (url === '/api/review/answer/') {
        return ok({
          is_correct: true, exp_awarded: 2, debt: 0, feedback: { ...feedback, choice: 'も' },
          progress: { level: 1, title: '見習騎士', total_exp: 2, exp_into_level: 2, exp_for_next_level: 100 },
        });
      }
      return ok(null);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('選答案後由伺服器判定，並顯示解說與結果', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ReviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole('button', { name: '只練答錯的題目（1）' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/review/next/?mode=mistakes', expect.anything());
    expect(screen.queryByText('も（也）')).not.toBeInTheDocument(); // 作答前不洩漏主題

    await user.click(await screen.findByRole('button', { name: 'も' }));
    expect(await screen.findByText('⭕ 正解！')).toBeInTheDocument();
    const sent = fetchMock.mock.calls.find(([url]) => url === '/api/review/answer/')!;
    expect(JSON.parse(String(sent[1].body))).toEqual({ question_id: 1, choice: 'も' });

    await user.click(screen.getByRole('button', { name: '看結果' }));
    expect(await screen.findByText(/這一輪獲得/)).toHaveTextContent('+2 EXP');
  });
});
