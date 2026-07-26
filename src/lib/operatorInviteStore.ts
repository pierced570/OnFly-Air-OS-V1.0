/**
 * Tokenized operator network invites — short email → /join/:token packet.
 * Persisted in localStorage until DB table lands.
 */

export type OperatorInvite = {
  token: string
  email: string
  company_name: string
  created_at: string
  sent_at: string | null
  completed_at: string | null
  submission_id: string | null
}

const KEY = 'onfly.operatorInvites.v1'
const listeners = new Set<() => void>()
let byToken = new Map<string, OperatorInvite>()
let snapshot: OperatorInvite[] = []

function load(): void {
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as OperatorInvite[]
    if (!Array.isArray(parsed)) return
    byToken = new Map(parsed.map((r) => [r.token, r]))
  } catch {
    byToken = new Map()
  }
}

function rebuild() {
  snapshot = [...byToken.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
}

function persist() {
  rebuild()
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify([...byToken.values()]))
    }
  } catch {
    /* ignore */
  }
  for (const l of listeners) l()
}

load()
rebuild()

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
}

export function subscribeOperatorInvites(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listOperatorInvites(): OperatorInvite[] {
  return snapshot
}

export function getOperatorInvite(token: string): OperatorInvite | null {
  if (!byToken.size) load()
  return byToken.get(token) ?? null
}

export function createOperatorInvite(input: {
  email: string
  company_name?: string
}): OperatorInvite {
  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) throw new Error('Valid email required')
  const row: OperatorInvite = {
    token: newToken(),
    email,
    company_name: (input.company_name ?? '').trim(),
    created_at: new Date().toISOString(),
    sent_at: null,
    completed_at: null,
    submission_id: null,
  }
  byToken.set(row.token, row)
  persist()
  return row
}

export function markInviteSent(token: string): void {
  const row = byToken.get(token)
  if (!row) return
  row.sent_at = new Date().toISOString()
  persist()
}

export function markInviteCompleted(
  token: string,
  submissionId: string,
): void {
  const row = byToken.get(token)
  if (!row) return
  row.completed_at = new Date().toISOString()
  row.submission_id = submissionId
  persist()
}

export function __resetOperatorInvitesForTests(): void {
  byToken.clear()
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  persist()
}
