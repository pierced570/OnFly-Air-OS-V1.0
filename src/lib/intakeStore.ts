/**
 * Inbound email/SMS intake drafts (DB hydrate only).
 * The intake simulator UI was removed — real webhooks can land here later.
 */

export type IntakeDraft = {
  id: string
  channel: 'email' | 'sms'
  from: string
  subject: string
  body: string
  created_at: string
  status: 'pending_review' | 'accepted' | 'ignored'
  extracted: {
    origin_text?: string
    destination_text?: string
    ready_text?: string
    pieces?: string
    notes?: string
    [key: string]: unknown
  } | null
  ignore_reason?: string
  notified_phone?: string
}

const drafts = new Map<string, IntakeDraft>()
const listeners = new Set<() => void>()
let snapshot: IntakeDraft[] = []
/** Stable filtered view for useSyncExternalStore */
let pendingSnapshot: IntakeDraft[] = []

function rebuild() {
  snapshot = [...drafts.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
  pendingSnapshot = snapshot.filter((d) => d.status === 'pending_review')
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

export function subscribeIntake(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listIntakeDrafts(): IntakeDraft[] {
  return snapshot
}

export function listPendingIntake(): IntakeDraft[] {
  return pendingSnapshot
}

export function getIntakeDraft(id: string): IntakeDraft | undefined {
  return drafts.get(id)
}

export function replaceIntakeFromDb(rows: IntakeDraft[]): void {
  if (!rows.length) return
  for (const r of rows) drafts.set(r.id, r)
  bump()
}

export function acceptIntakeDraft(id: string): void {
  const row = drafts.get(id)
  if (!row) return
  row.status = 'accepted'
  bump()
}

export function ignoreIntakeDraft(id: string, reason = 'dispatcher ignored'): void {
  const row = drafts.get(id)
  if (!row) return
  row.status = 'ignored'
  row.ignore_reason = reason
  bump()
}

/** Remove an intake draft from the queue (pending, accepted, or ignored). */
export function deleteIntakeDraft(id: string): boolean {
  const ok = drafts.delete(id)
  if (ok) bump()
  return ok
}
