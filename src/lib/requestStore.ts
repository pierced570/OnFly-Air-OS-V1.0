/**
 * In-memory trip requests from portal + dispatcher intake.
 */

import {
  deriveReadyAt,
  laneFromDraft,
  summaryFromDraft,
  type TripRequestDraft,
  type TripRequestRecord,
} from '@/domain/tripRequest'
import {
  addClient,
  listClients,
  subscribeClients,
  type ClientProfile,
} from '@/lib/clientStore'
import { notifyPortalRequest } from '@/lib/dispatchNotify'

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

export function submitTripRequest(
  draft: TripRequestDraft,
  source: 'portal' | 'dispatch',
): TripRequestRecord {
  const id = crypto.randomUUID()
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
  }
  requests.set(id, row)
  bump()
  // Portal door: SMS/email the on-shift desk + Board exception — approve, don't auto-book.
  if (source === 'portal') {
    void notifyPortalRequest(row)
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
