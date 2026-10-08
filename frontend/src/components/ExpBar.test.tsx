import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExpBar, LevelBadge } from './ExpBar';

const progress = { level: 2, title: '見習騎士', total_exp: 150, exp_into_level: 50, exp_for_next_level: 200 };

describe('ExpBar', () => {
  it('顯示本級進度並提供無障礙數值', () => {
    render(<ExpBar progress={progress} />);
    expect(screen.getByText('50 / 200')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: '經驗值' });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemax', '200');
    expect(bar.firstElementChild).toHaveStyle({ width: '25%' });
  });

  it('精簡模式不顯示數字', () => {
    render(<ExpBar progress={progress} compact />);
    expect(screen.queryByText('50 / 200')).not.toBeInTheDocument();
  });

  it('LevelBadge 顯示等級', () => {
    render(<LevelBadge level={7} />);
    expect(screen.getByLabelText('等級 7')).toHaveTextContent('7');
  });
});
