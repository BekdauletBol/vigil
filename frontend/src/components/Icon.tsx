import type { SVGProps } from 'react'

/** SF Symbols–style line icons (24×24 grid, rounded caps). */
const PATHS = {
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  waveform: 'M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0',
  alert: 'M12 4 2.8 19.5h18.4zM12 10v4.2M12 17v.2',
  sparkles:
    'M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5.5 15l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7.4 7.4 0 0 1-1.9 1.1l-.3 2H11l-.3-2a7.4 7.4 0 0 1-1.9-1.1l-1.9.7-1.8-3.1 1.6-1.2a7.6 7.6 0 0 1 0-3l-1.6-1.2 1.8-3.1 1.9.7a7.4 7.4 0 0 1 1.9-1.1l.3-2h3.6l.3 2a7.4 7.4 0 0 1 1.9 1.1l1.9-.7 1.8 3.1-1.6 1.2a7.6 7.6 0 0 1 0 3z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  shield: 'M12 3 19 6v5.5c0 4.6-3 8.4-7 9.5-4-1.1-7-4.9-7-9.5V6zM8.8 12l2.2 2.2 4.2-4.4',
  chevronRight: 'M9.5 5.5 16 12l-6.5 6.5',
  chevronDown: 'M5.5 9.5 12 16l6.5-6.5',
  xmark: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  arrowUp: 'M12 19V5.5M6 11.5l6-6 6 6',
  stop: 'M8 8h8v8H8z',
  pause: 'M8.5 6v12M15.5 6v12',
  play: 'M8 5.5v13l10.5-6.5z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.6 3.8-5.8 7.5-5.8s6.7 2.2 7.5 5.8',
  building: 'M5 20.5V5.5l7-2.5v17.5M12 8h7v12.5M3 20.5h18M8 8.5v0M8 12v0M8 15.5v0M15.5 12v0M15.5 15.5v0',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 12h17M12 3c2.5 2.6 3.6 5.6 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.6-3.6-9S9.5 5.6 12 3z',
  card: 'M3.5 6.5h17v11h-17zM3.5 10h17M7 14.5h3',
  banknote: 'M2.5 7h19v10h-19zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 10v0M18.5 14v0',
  transfer: 'M4 8.5h14.5M15 5l3.5 3.5L15 12M20 15.5H5.5M9 12l-3.5 3.5L9 19',
  bitcoin: 'M9 5v14M12 5v2M12 17v2M8 7h5.5a2.5 2.5 0 0 1 0 5H8M8 12h6.5a2.5 2.5 0 0 1 0 5H8',
  network: 'M12 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM19 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 7.5v4.5M12 12l-5.5 4.8M12 12l5.5 4.8',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 19.5c.6-3.2 3.2-5 6.5-5s5.9 1.8 6.5 5M16 4.4a3.5 3.5 0 0 1 0 6.2M18.5 14.8c1.7.8 2.8 2.4 3 4.7',
  flag: 'M5.5 21V4M5.5 4.5c4-2 6.5 1.5 13 0v8c-6.5 1.5-9-2-13 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  doc: 'M6 3h8l4.5 4.5V21H6zM14 3v4.5h4.5M9 12.5h6M9 16h6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0',
  chart: 'M4 20V4M4 20h16M7.5 15l4-4.5 3 3 5-6',
  comment: 'M4 5.5h16v11H9.5L5 20v-3.5H4z',
  bolt: 'M13 2.5 5 13.5h6.5L10.5 21.5 19 10h-6.5z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  hourglass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.7 2.7L16 9.5',
  escalate: 'M12 20V8M7 12.5 12 7.5l5 5M5 4h14',
  cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM9.5 3.5V7M14.5 3.5V7M9.5 17v3.5M14.5 17v3.5M3.5 9.5H7M3.5 14.5H7M17 9.5h3.5M17 14.5h3.5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
} as const

export type IconName = keyof typeof PATHS

interface Props extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18, strokeWidth = 1.8, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
