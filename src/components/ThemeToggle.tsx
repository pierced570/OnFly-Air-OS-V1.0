import { useSyncExternalStore } from 'react'
import {
  getAppearance,
  subscribeAppearance,
  toggleAppearance,
} from '@/lib/appearanceStore'

type Props = {
  /** Compact icon button for mobile headers */
  compact?: boolean
  className?: string
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16.5 13.5A7 7 0 0 1 10.5 3.5 7.5 7.5 0 1 0 20.5 13.5a7 7 0 0 1-4 0Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ThemeToggle({ compact = false, className = '' }: Props) {
  const appearance = useSyncExternalStore(
    subscribeAppearance,
    getAppearance,
    getAppearance,
  )
  const isDark = appearance === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={() => toggleAppearance()}
      aria-label={label}
      title={label}
      className={[
        compact
          ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-cream hover:bg-surface-2'
          : 'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-muted hover:bg-surface-2 hover:text-cream',
        className,
      ].join(' ')}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {!compact && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}
