/**
 * Staff UI light / dark appearance — persisted in localStorage.
 * Client/portal routes stay on the cream client theme (role-based).
 */

export type Appearance = 'dark' | 'light'

const KEY = 'onfly-appearance'
const listeners = new Set<() => void>()

function readStored(): Appearance {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* private mode */
  }
  return 'dark'
}

let current: Appearance = readStored()

function bump() {
  for (const l of listeners) l()
}

/** Apply to <html> so CSS tokens + body update. */
export function applyAppearance(mode: Appearance): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.appearance = mode
}

export function getAppearance(): Appearance {
  return current
}

export function setAppearance(mode: Appearance): void {
  current = mode
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore */
  }
  applyAppearance(mode)
  bump()
}

export function toggleAppearance(): Appearance {
  const next: Appearance = current === 'dark' ? 'light' : 'dark'
  setAppearance(next)
  return next
}

export function subscribeAppearance(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Call once at boot (main / App). */
export function initAppearance(): Appearance {
  current = readStored()
  applyAppearance(current)
  return current
}
