/**
 * Inbound email/SMS intake → draft trips awaiting dispatcher review.
 */

import { handleInboundEmail } from '@/domain/intakeEmail'
import { listRequestAlertEmails } from '@/lib/clientStore'
import { getOnShift } from '@/lib/shiftStore'

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

export async function simulateInboundEmail(opts: {
  from: string
  subject: string
  body: string
}): Promise<IntakeDraft> {
  const from = opts.from.trim().toLowerCase()
  const alerts = listRequestAlertEmails()
  const requesterMatch =
    alerts.length === 0
      ? from.includes('@') // allow demo when no contacts flagged yet
      : alerts.includes(from)

  const result = await handleInboundEmail({
    from: opts.from,
    subject: opts.subject,
    body: opts.body,
    requesterMatch,
  })

  const shift = getOnShift()
  const id = crypto.randomUUID()
  const row: IntakeDraft = {
    id,
    channel: 'email',
    from: opts.from.trim(),
    subject: opts.subject.trim(),
    body: opts.body.trim(),
    created_at: new Date().toISOString(),
    status: result.ignored ? 'ignored' : 'pending_review',
    extracted: result.ignored ? null : (result.extracted as IntakeDraft['extracted']),
    ignore_reason: result.ignored ? result.reason : undefined,
    notified_phone: result.ignored ? undefined : shift?.phone || '+10000000000',
  }
  drafts.set(id, row)
  bump()
  return row
}

export async function simulateInboundSms(opts: {
  from: string
  body: string
}): Promise<IntakeDraft> {
  const d = await simulateInboundEmail({
    from: opts.from.includes('@')
      ? opts.from
      : `${opts.from.replace(/\D/g, '')}@sms.local`,
    subject: 'SMS intake',
    body: opts.body,
  })
  const row = drafts.get(d.id)
  if (row) {
    row.channel = 'sms'
    bump()
    return row
  }
  return d
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
