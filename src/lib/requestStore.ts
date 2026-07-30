/**
 * In-memory trip requests from portal + dispatcher intake.
 */

import { tripRequestDraftFromScratchNotes } from '@/domain/scratchToTripRequest'
import {
  deriveReadyAt,
  forkliftFromDraft,
  laneFromDraft,
  summaryFromDraft,
  type TripRequestDraft,
  type TripRequestRecord,
  type TripRequestSource,
} from '@/domain/tripRequest'
import {
  clearScratchPad,
  getScratchPad,
} from '@/lib/scratchPadStore'
import {
  addClient,
  listClients,
  subscribeClients,
  type ClientProfile,
} from '@/lib/clientStore'
import {
  notifyHardQuoteRequest,
  portalRequestReviewPath,
} from '@/lib/dispatchNotify'
import { raiseException } from '@/lib/exceptionStore'
import { addNeedsInfoTask } from '@/lib/needsInfoStore'

const requests = new Map<string, TripRequestRecord>()
let refSeq = 9000
const listeners = new Set<() => void>()

/** Cached snapshot for useSyncExternalStore (must be referentially stable). */
let cachedList: TripRequestRecord[] = []

function rebuildCache() {
  cachedList = [...requests.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
}

function bump() {
  rebuildCache()
  for (const l of listeners) l()
}

export function subscribeRequests(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listRequests(): TripRequestRecord[] {
  return cachedList
}

export function getRequest(id: string): TripRequestRecord | undefined {
  return requests.get(id)
}

function flagForkliftForDispatchers(
  row: TripRequestRecord,
): void {
  if (row.forklift.level === 'none' || !row.forklift.label) return
  const href = portalRequestReviewPath(row.id)
  const severity = row.forklift.level === 'required' ? 'late' : 'attn'
  raiseException({
    trip_id: null,
    trip_ref: row.ref,
    title:
      row.forklift.level === 'required'
        ? 'Forklift required'
        : 'Forklift recommended',
    detail: `R-${row.ref} · ${row.lane} · ${row.forklift.label}`,
    severity,
    href,
  })
  addNeedsInfoTask({
    entity_type: 'trip',
    entity_id: row.id,
    entity_label: `R-${row.ref} ${row.lane}`,
    field:
      row.forklift.level === 'required'
        ? 'forklift_required'
        : 'forklift_recommended',
    note: row.forklift.label,
    wizard: null,
  })
}

export function submitTripRequest(
  draft: TripRequestDraft,
  source: TripRequestSource,
): TripRequestRecord {
  const id = crypto.randomUUID()
  const forklift = forkliftFromDraft(draft)
  const row: TripRequestRecord = {
    ...structuredClone(draft),
    id,
    ref: ++refSeq,
    source,
    status: 'submitted',
    created_at: new Date().toISOString(),
    ready_at: deriveReadyAt(draft),
    lane: laneFromDraft(draft),
    summary: summaryFromDraft(draft),
    hard_quote_requested_at: null,
    forklift,
  }
  requests.set(id, row)
  bump()
  flagForkliftForDispatchers(row)
  // Soft portal estimates stay silent — desk SMS/email only on hard quote
  // (requestHardQuote → notifyHardQuoteRequest). Never page for soft requests.
  return row
}

/**
 * Push live Scratchpad notes into Trip requests, then clear the scratch pad.
 */
export function pushScratchPadToTripRequest(): TripRequestRecord {
  const body = getScratchPad().body.trim()
  if (!body) throw new Error('Scratchpad is empty')
  const draft = tripRequestDraftFromScratchNotes(body)
  const row = submitTripRequest(draft, 'scratchpad')
  clearScratchPad()
  return row
}

/** Client portal: escalate from estimated to hard quote (operator-confirmed numbers). */
export function requestHardQuote(id: string): TripRequestRecord | undefined {
  const row = requests.get(id)
  if (!row) return undefined
  if (!row.hard_quote_requested_at) {
    row.hard_quote_requested_at = new Date().toISOString()
    row.status = row.status === 'submitted' ? 'in_review' : row.status
    bump()
    void notifyHardQuoteRequest(row)
  }
  return row
}

export function updateRequestStatus(
  id: string,
  status: TripRequestRecord['status'],
): void {
  const row = requests.get(id)
  if (!row) return
  row.status = status
  bump()
}

/** Remove an incoming / board request entirely. */
export function deleteRequest(id: string): boolean {
  const ok = requests.delete(id)
  if (ok) bump()
  return ok
}

/** Re-export client helpers used by TripRequestForm. */
export { subscribeClients, listClients as listSessionClients }

export type SessionClient = Pick<ClientProfile, 'id' | 'name' | 'email'>

export function addSessionClient(name: string, email = ''): SessionClient {
  const trimmed = email.trim()
  return addClient({
    name,
    email: trimmed,
    invoice_email: trimmed,
    contacts: trimmed
      ? [{ name: trimmed.split('@')[0] || name, email: trimmed, role: 'requester' }]
      : [],
  })
}
