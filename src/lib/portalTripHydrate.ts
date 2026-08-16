/**
 * Hydrate a portal-safe trip shell (magic link / signed-in) with legs + ETA chain.
 */

import type { ChainLeg } from '@/domain/etaChain'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import { mapEtaNodeRows } from '@/lib/mapEtaNodeRow'
import {
  ensureTripInSession,
  getTrip,
  mutateTrip,
  type TripStoreRow,
} from '@/lib/tripStore'

export function mapPortalLegs(
  legRows: Record<string, unknown>[] | null | undefined,
): TripStoreRow['legs'] {
  if (!Array.isArray(legRows)) return []
  return legRows.map((l, i) => ({
    id: String(l.id),
    seq: Number(l.seq ?? i + 1),
    label: String(l.label || l.type || `Leg ${i + 1}`),
    status: String(l.status || 'pending') as TripStoreRow['legs'][0]['status'],
    origin: (l.from_ref as { icao?: string } | null)?.icao,
    dest: (l.to_ref as { icao?: string } | null)?.icao,
    est_start: l.est_start ? String(l.est_start) : null,
    est_end: l.est_end ? String(l.est_end) : null,
    actual_start: l.actual_start ? String(l.actual_start) : null,
    actual_end: l.actual_end ? String(l.actual_end) : null,
    party: 'dispatcher',
    type: String(l.type || ''),
    one_tap_token: '',
  }))
}

export function stubTripFromPortalRow(
  tripRow: Record<string, unknown>,
  legs: TripStoreRow['legs'],
  etaChain: ChainLeg[] = [],
): TripStoreRow {
  return {
    id: String(tripRow.id),
    ref: Number(tripRow.ref ?? 0),
    code: tripRow.code ? String(tripRow.code) : '',
    state: tripRow.state as TripStoreRow['state'],
    lane: String(tripRow.lane_label || tripRow.lane || ''),
    payload_summary: String(tripRow.payload_summary || ''),
    ready_label: String(tripRow.ready_label || ''),
    candidates: [],
    offers: [],
    events: [],
    eta_chain: etaChain,
    service_pattern:
      (tripRow.service_pattern as TripStoreRow['service_pattern']) ?? null,
    promised_delivery: tripRow.promised_delivery
      ? String(tripRow.promised_delivery)
      : null,
    eta_defaults_snapshot: null,
    thread_number: null,
    thread_disbanded_at: null,
    legs,
    participants: [],
    thread: [],
    documents: [],
    invoice: null,
    po_number: tripRow.po_number ? String(tripRow.po_number) : null,
  }
}

const PORTAL_TRIP_COLS =
  'id,ref,code,state,lane_label,payload_summary,ready_label,promised_delivery,service_pattern,po_number'

/** Merge ETA chain (+ legs) into session trip when the portal hydrate is richer. */
export function mergePortalEtaIntoSession(
  tripId: string,
  etaChain: ChainLeg[],
  legs?: TripStoreRow['legs'],
): void {
  if (!etaChain.length && !(legs && legs.length)) return
  const existing = getTrip(tripId)
  if (!existing) return
  if (existing.eta_chain.length && (!legs || existing.legs.length)) return
  mutateTrip(tripId, (t) => {
    if (!t.eta_chain.length && etaChain.length) t.eta_chain = etaChain
    if (legs?.length && !t.legs.length) t.legs = legs
  })
}

export async function fetchPortalTripByToken(
  token: string,
): Promise<TripStoreRow | null> {
  if (!canPersist()) return null
  const [tripRows, legRows, etaRows] = await Promise.all([
    safeQuery<Record<string, unknown>[]>('portal_trip_by_token', () =>
      db().rpc('portal_trip_by_token', { p_token: token }),
    ),
    safeQuery<Record<string, unknown>[]>('portal_legs_by_token', () =>
      db().rpc('portal_legs_by_token', { p_token: token }),
    ),
    safeQuery<Record<string, unknown>[]>('portal_eta_nodes_by_token', () =>
      db().rpc('portal_eta_nodes_by_token', { p_token: token }),
    ),
  ])
  const tripRow = Array.isArray(tripRows) ? tripRows[0] : null
  if (!tripRow) return null
  const legs = mapPortalLegs(legRows as never)
  const etaChain = mapEtaNodeRows(etaRows as never)
  return stubTripFromPortalRow(tripRow, legs, etaChain)
}

export async function fetchPortalTripById(
  tripId: string,
): Promise<TripStoreRow | null> {
  if (!canPersist()) return null
  const [tripRows, legRows, etaRows] = await Promise.all([
    safeQuery<Record<string, unknown>[]>('portal_trips.by_id', () =>
      db()
        .from('portal_trips')
        .select(PORTAL_TRIP_COLS)
        .eq('id', tripId)
        .limit(1),
    ),
    safeQuery<Record<string, unknown>[]>('portal_legs.by_trip', () =>
      db().from('portal_legs').select('*').eq('trip_id', tripId).order('seq'),
    ),
    safeQuery<Record<string, unknown>[]>('portal_eta_nodes.by_trip', () =>
      db()
        .from('portal_eta_nodes')
        .select('*')
        .eq('trip_id', tripId)
        .order('seq'),
    ),
  ])
  const tripRow = Array.isArray(tripRows) ? tripRows[0] : null
  if (!tripRow) return null
  const legs = mapPortalLegs(legRows as never)
  const etaChain = mapEtaNodeRows(etaRows as never)
  return stubTripFromPortalRow(tripRow, legs, etaChain)
}

/** Ensure session trip has ETA chain for live tracking (fetch if empty). */
export async function ensurePortalTripTrackingReady(opts: {
  tripId: string
  token?: string | null
}): Promise<TripStoreRow | null> {
  const local = getTrip(opts.tripId)
  if (local?.eta_chain.length) return local

  const remote = opts.token
    ? await fetchPortalTripByToken(opts.token)
    : await fetchPortalTripById(opts.tripId)
  if (!remote) return local

  if (local) {
    mergePortalEtaIntoSession(opts.tripId, remote.eta_chain, remote.legs)
    return getTrip(opts.tripId) ?? local
  }
  return ensureTripInSession(remote)
}
