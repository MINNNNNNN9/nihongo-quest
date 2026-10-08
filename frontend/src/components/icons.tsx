/** 介面用的線條圖示（24×24、描邊），顏色跟著文字色。 */
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M19 19v2H6 M9 7h6',
  chart: 'M3 20h18 M6 20v-9 M12 20V5 M18 20v-6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8 20h8',
  users:
    'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M21 20v-1a4 4 0 0 0-3-3.87 M15.5 4.13a3.5 3.5 0 0 1 0 6.74',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z',
  flame: 'M12 22a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7.5 11 6 13.500 6 16a6 6 0 0 0 6 6z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.500a2.500 2.500 0 1 1 3.500 2.300c-.6.3-1 .8-1 1.700 M12 17h.01',
  expand: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4 M16 17l5-5-5-5 M21 12H9',
  volume: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500z M15.500 9a4 4 0 0 1 0 6 M18 6.500a7.500 7.500 0 0 1 0 11',
  mute: 'M4 9.500v5h3.500L12 18.500v-13L7.500 9.500z M16 9.500l5 5 M21 9.500l-5 5',
  check: 'M5 12.500l4.500 4.500L19 7.500',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
