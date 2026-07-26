/**
 * Scratch pad notes from a live phone call — local until login + parse.
 */

const KEY = 'onfly.scratch.pad.v1'

export type ScratchPadState = {
  body: string
  updated_at: string
}

const listeners = new Set<() => void>()
let state: ScratchPadState = load()

function load(): ScratchPadState {
  if (typeof localStorage === 'undefined') {
    return { body: '', updated_at: new Date().toISOString() }
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { body: '', updated_at: new Date().toISOString() }
    const parsed = JSON.parse(raw) as ScratchPadState
    return {
      body: typeof parsed.body === 'string' ? parsed.body : '',
      updated_at: parsed.updated_at || new Date().toISOString(),
    }
  } catch {
    return { body: '', updated_at: new Date().toISOString() }
  }
}

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* quota */
  }
}

function bump() {
  persist()
  for (const l of listeners) l()
}

export function subscribeScratchPad(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getScratchPad(): ScratchPadState {
  return state
}

export function setScratchPadBody(body: string): void {
  state = { body, updated_at: new Date().toISOString() }
  bump()
}

export function clearScratchPad(): void {
  state = { body: '', updated_at: new Date().toISOString() }
  bump()
}
