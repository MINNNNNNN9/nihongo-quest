import { setTheme, useTheme } from '../lib/theme';
import { Icon } from './icons';

/** 頂端列的淺色／深色切換。 */
export function ThemePicker() {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? '切換成深色' : '切換成淺色';
  return (
    <button
      type="button"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mist transition hover:bg-night-700 hover:text-washi"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} className="h-5 w-5" />
    </button>
  );
}
