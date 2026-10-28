/**
 * Portal magic-link login tokens — session Map (demo/mock) + one-time consume.
 * Pattern mirrors portalTrackStore; durable DB persistence can follow later.
 */

import { isPortalLoginTokenFresh } from '@/domain/portalMagicLink'
import { safePortalNextPath } from '@/domain/portalShareLinks'

export type PortalLoginRow = {
  token: string
  email: string
  /** Safe portal path after sign-in (optional). */
  next: string | null
  /** Company portal lock — only this client may open the session. */
  expectedClientId: string | null
  createdAt: string
  consumedAt: string | null
}

const byToken = new Map<string, PortalLoginRow>()

export function createPortalLoginToken(opts: {
  email: string
  next?: string | null
  expectedClientId?: string | null
}): string {
  const email = opts.email.trim().toLowerCase()
  if (!email.includes('@')) {
    throw new Error('Valid email required')
  }
  const token = crypto.randomUUID().replace(/-/g, '')
  const expected = (opts.expectedClientId ?? '').trim() || null
  const row: PortalLoginRow = {
    token,
    email,
    next: safePortalNextPath(opts.next ?? null),
    expectedClientId: expected,
    createdAt: new Date().toISOString(),
    consumedAt: null,
  }
  byToken.set(token, row)
  return token
}

export function peekPortalLoginToken(token: string): PortalLoginRow | null {
  const row = byToken.get(token.trim())
  return row ?? null
}

/**
 * One-time consume. Returns email + next when fresh and unused; else null.
 */
export function consumePortalLoginToken(
  token: string,
  nowMs = Date.now(),
): {
  email: string
  next: string | null
  expectedClientId: string | null
} | null {
  const key = token.trim()
  const row = byToken.get(key)
  if (!row) return null
  if (row.consumedAt) return null
  if (!isPortalLoginTokenFresh(row.createdAt, nowMs)) return null
  row.consumedAt = new Date(nowMs).toISOString()
  byToken.set(key, row)
  return {
    email: row.email,
    next: row.next,
    expectedClientId: row.expectedClientId,
  }
}

/** Test helper — drop all in-memory login tokens. */
export function __resetPortalLoginTokensForTests(): void {
  byToken.clear()
}
