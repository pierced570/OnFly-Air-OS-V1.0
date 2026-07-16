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

const requests = new Map<string, TripRequestRecord>()
let refSeq = 9000
const listeners = new Set<() => void>()

function bump() {
  for (const l of listeners) l()
}

export function subscribeRequests(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function listRequests(): TripRequestRecord[] {
  return [...requests.values()].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  )
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

/** Demo clients for dispatcher select (matches seed). */
export const DEMO_CLIENTS = [
  {
    id: 'demo-freight',
    name: 'Demo Freight Co',
    email: 'requester@demo-freight.test',
  },
  {
    id: 'demo-parts',
    name: 'Midwest Parts Express',
    email: 'ops@midwest-parts.test',
  },
] as const
