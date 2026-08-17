/**
 * Hydrate a portal-safe trip shell (magic link / signed-in) with legs + ETA chain
 * + award facts (tail / type / stop addresses) — never costs or operator names.
 */

import type { ChainLeg } from '@/domain/etaChain'
import { parseLaneAirports } from '@/domain/offerMissionDisplay'
import {
  mergePortalChatMessages,
  normalizePortalChat,
} from '@/domain/portalChat'
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

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((n) => String(n ?? '').trim()).filter(Boolean)
}

/** Coerce portal_trips.eta_chain jsonb (ChainLeg[]) or DB node rows → ChainLeg[]. */
export function coercePortalEtaChain(raw: unknown): ChainLeg[] {
  if (!Array.isArray(raw) || !raw.length) return []
  const first = raw[0]
  if (first && typeof first === 'object' && 'from_icao' in first) {
    return mapEtaNodeRows(raw as Record<string, unknown>[])
  }
  if (first && typeof first === 'object' && 'from' in first && 'to' in first) {
    return raw as ChainLeg[]
  }
  return []
}

/** When trip_legs are empty, synthesize an air leg from lane / origin columns. */
export function synthesizeLegsFromLane(
  tripRow: Record<string, unknown>,
): TripStoreRow['legs'] {
  const lane = String(tripRow.lane_label || tripRow.lane || '')
  const parsed = parseLaneAirports(lane)
  const origin = (
    String(tripRow.origin ?? '').trim() ||
    parsed?.origin ||
    ''
  ).toUpperCase()
  const dest = (
    String(tripRow.destination ?? '').trim() ||
    parsed?.dest ||
    ''
  ).toUpperCase()
  if (!origin && !dest) return []
  return [
    {
      id: `portal-lane-${String(tripRow.id)}`,
      seq: 1,
      label: `Air ${origin || '?'}→${dest || '?'}`,
      status: 'pending',
      origin: origin || undefined,
      dest: dest || undefined,
      est_start: null,
      est_end: null,
      actual_start: null,
      actual_end: null,
      party: 'dispatcher',
      type: 'air_leg',
      one_tap_token: '',
    },
  ]
}

function portalSafeQuickLegs(
  tripRow: Record<string, unknown>,
): NonNullable<TripStoreRow['quick']>['legs'] {
  const lane = String(tripRow.lane_label || tripRow.lane || '')
  const parsed = parseLaneAirports(lane)
  const origin = (
    String(tripRow.origin ?? '').trim() ||
    parsed?.origin ||
    ''
  ).toUpperCase()
  const dest = (
    String(tripRow.destination ?? '').trim() ||
    parsed?.dest ||
    ''
  ).toUpperCase()
  if (!origin && !dest) return []
  return [
    {
      origin_icao: origin,
      dest_icao: dest,
      date: '',
      repo_time: '',
      live_leg_time: '',
      pax: 0,
    },
  ]
}

/** Portal-safe quick slice — no vendor_cost / client_price / invoice email. */
export function portalSafeQuickFromRow(
  tripRow: Record<string, unknown>,
  award?: { tail?: string | null; aircraft_type?: string | null } | null,
): TripStoreRow['quick'] {
  const fromRow = String(tripRow.tail ?? '').trim()
  const fromAward = String(award?.tail ?? '').trim()
  const tail =
    (fromRow && fromRow.toUpperCase() !== 'TBD' ? fromRow : '') ||
    (fromAward && fromAward.toUpperCase() !== 'TBD' ? fromAward : '') ||
    ''
  const aircraftType =
    String(tripRow.aircraft_type ?? '').trim() ||
    String(award?.aircraft_type ?? '').trim() ||
    ''
  const po = String(tripRow.po_number ?? '').trim()
  const notes = String(tripRow.cargo_notes ?? '').trim()
  const cargoOnly =
    tripRow.cargo_only === true
      ? true
      : tripRow.cargo_only === false
        ? false
        : true
  const legs = portalSafeQuickLegs(tripRow)
  if (!tail && !aircraftType && !po && !notes && !legs.length) return undefined
  return {
    client_id: '',
    client_name: '',
    po,
    timing: 'asap',
    roundtrip: false,
    cargo_only: cargoOnly,
    operator_name: '',
    aircraft_type: aircraftType,
    // Never invent TBD — blank means unassigned (portal shows Pending).
    tail,
    vendor_cost: 0,
    client_price: 0,
    pay_terms: '',
    invoice_email: '',
    cc_emails: [],
    send_invoice: false,
    referred_by: '',
    notes,
    legs,
  }
}

export function stubTripFromPortalRow(
  tripRow: Record<string, unknown>,
  legs: TripStoreRow['legs'],
  etaChain: ChainLeg[] = [],
  award?: { tail?: string | null; aircraft_type?: string | null } | null,
): TripStoreRow {
  const quick = portalSafeQuickFromRow(tripRow, award)
  const paxNames = asStringList(tripRow.portal_pax_names)
  const awardTail = (quick?.tail || String(award?.tail ?? '').trim()).trim()
  const awardType =
    (quick?.aircraft_type || String(award?.aircraft_type ?? '').trim()).trim() ||
    null
  const offers: TripStoreRow['offers'] =
    awardTail && awardTail.toUpperCase() !== 'TBD'
      ? [
          {
            id: `portal-award-${String(tripRow.id)}`,
            trip_id: String(tripRow.id),
            operator_id: '',
            operator_name: '',
            aircraft_id: '',
            tail: awardTail.toUpperCase(),
            type_name: awardType,
            state: 'selected',
            ping_sent_at: null,
            notified_at: null,
            declined_acked_at: null,
            replied_at: null,
            time_to_position_min: null,
            quick_turn_min: null,
            live_leg_min: null,
            wait_ok: null,
            max_wait_hrs: null,
            price_net: null,
            fee_scope: null,
            notes: null,
            duty_available_min: null,
            duty_included_min: null,
            magic_token: '',
            bookingGated: false,
            needsInfo: [],
            contact_cell: '',
            contact_cell_is_mock: true,
            contact_email: '',
            quote_link_channel: 'email',
          },
        ]
      : []
  const resolvedLegs =
    legs.length && legs.some((l) => l.origin || l.dest)
      ? legs
      : synthesizeLegsFromLane(tripRow)
  const metaChain = coercePortalEtaChain(tripRow.eta_chain)
  const resolvedChain = etaChain.length ? etaChain : metaChain
  return {
    id: String(tripRow.id),
    ref: Number(tripRow.ref ?? 0),
    code: tripRow.code ? String(tripRow.code) : '',
    state: tripRow.state as TripStoreRow['state'],
    lane: String(tripRow.lane_label || tripRow.lane || ''),
    payload_summary: String(tripRow.payload_summary || ''),
    ready_label: String(tripRow.ready_label || ''),
    candidates: [],
    offers,
    events: [],
    eta_chain: resolvedChain,
    service_pattern:
      (tripRow.service_pattern as TripStoreRow['service_pattern']) ?? null,
    promised_delivery: tripRow.promised_delivery
      ? String(tripRow.promised_delivery)
      : null,
    eta_defaults_snapshot: null,
    thread_number: null,
    thread_disbanded_at: null,
    legs: resolvedLegs,
    participants: [],
    thread: [],
    documents: [],
    invoice: null,
    po_number: tripRow.po_number ? String(tripRow.po_number) : null,
    quick,
    portal_pickup_address: tripRow.portal_pickup_address
      ? String(tripRow.portal_pickup_address)
      : null,
    portal_dropoff_address: tripRow.portal_dropoff_address
      ? String(tripRow.portal_dropoff_address)
      : null,
    portal_pickup_stop:
      tripRow.portal_pickup_stop &&
      typeof tripRow.portal_pickup_stop === 'object'
        ? (tripRow.portal_pickup_stop as TripStoreRow['portal_pickup_stop'])
        : null,
    portal_dropoff_stop:
      tripRow.portal_dropoff_stop &&
      typeof tripRow.portal_dropoff_stop === 'object'
        ? (tripRow.portal_dropoff_stop as TripStoreRow['portal_dropoff_stop'])
        : null,
    portal_pax_names: paxNames,
    portal_chat: normalizePortalChat(tripRow.portal_chat),
  }
}

const PORTAL_TRIP_COLS_BASE =
  'id,ref,code,state,lane_label,payload_summary,ready_label,promised_delivery,service_pattern,po_number,origin,destination,tail,aircraft_type,portal_pickup_address,portal_dropoff_address,portal_pickup_stop,portal_dropoff_stop,portal_pax_names,cargo_notes,cargo_only'

const PORTAL_TRIP_COLS_WITH_ETA = `${PORTAL_TRIP_COLS_BASE},eta_chain`
const PORTAL_TRIP_COLS = `${PORTAL_TRIP_COLS_WITH_ETA},portal_chat`

function hasRouteIcaos(trip: TripStoreRow): boolean {
  if (trip.legs.some((l) => l.origin || l.dest)) return true
  if (trip.eta_chain.some((l) => l.from?.icao || l.to?.icao)) return true
  return Boolean(parseLaneAirports(trip.lane))
}

function needsPortalFacts(trip: TripStoreRow | null | undefined): boolean {
  if (!trip) return true
  if (!trip.eta_chain.length) return true
  if (!hasRouteIcaos(trip)) return true
  const hasTail =
    Boolean(trip.quick?.tail?.trim() && trip.quick.tail !== 'TBD') ||
    Boolean(trip.offers.some((o) => o.state === 'selected' && o.tail?.trim()))
  const hasType = Boolean(
    trip.quick?.aircraft_type?.trim() ||
      trip.offers.some((o) => o.state === 'selected' && o.type_name?.trim()),
  )
  return !hasTail || !hasType
}

/** Merge ETA chain + award/stop facts into session when portal hydrate is richer. */
export function mergePortalTripIntoSession(
  tripId: string,
  remote: TripStoreRow,
): void {
  const existing = getTrip(tripId)
  if (!existing) return
  mutateTrip(tripId, (t) => {
    if (!t.eta_chain.length && remote.eta_chain.length) {
      t.eta_chain = remote.eta_chain
    }
    if (
      (!t.legs.length || t.legs.every((l) => !l.origin && !l.dest)) &&
      remote.legs.length
    ) {
      t.legs = remote.legs
    } else if (
      t.legs.every((l) => !l.est_start) &&
      remote.legs.some((l) => l.est_start)
    ) {
      t.legs = remote.legs
    }
    if (!t.quick?.tail?.trim() || t.quick.tail === 'TBD') {
      if (remote.quick) t.quick = { ...(t.quick ?? remote.quick), ...remote.quick }
    } else if (remote.quick?.aircraft_type && !t.quick?.aircraft_type) {
      t.quick = { ...t.quick!, aircraft_type: remote.quick.aircraft_type }
    }
    if (
      !t.offers.some((o) => o.state === 'selected' && o.tail?.trim()) &&
      remote.offers.some((o) => o.state === 'selected' && o.tail?.trim())
    ) {
      t.offers = remote.offers
    }
    if (!t.portal_pickup_address && remote.portal_pickup_address) {
      t.portal_pickup_address = remote.portal_pickup_address
    }
    if (!t.portal_dropoff_address && remote.portal_dropoff_address) {
      t.portal_dropoff_address = remote.portal_dropoff_address
    }
    if (!t.portal_pickup_stop && remote.portal_pickup_stop) {
      t.portal_pickup_stop = remote.portal_pickup_stop
    }
    if (!t.portal_dropoff_stop && remote.portal_dropoff_stop) {
      t.portal_dropoff_stop = remote.portal_dropoff_stop
    }
    if (!(t.portal_pax_names?.length) && remote.portal_pax_names?.length) {
      t.portal_pax_names = remote.portal_pax_names
    }
    if (!t.po_number?.trim() && remote.po_number?.trim()) {
      t.po_number = remote.po_number
    }
    if (!t.code?.trim() && remote.code?.trim()) t.code = remote.code
    if (!t.lane?.trim() && remote.lane?.trim()) t.lane = remote.lane
    if (!t.service_pattern && remote.service_pattern) {
      t.service_pattern = remote.service_pattern
    }
    if (!t.promised_delivery && remote.promised_delivery) {
      t.promised_delivery = remote.promised_delivery
    }
    t.portal_chat = mergePortalChatMessages(t.portal_chat, remote.portal_chat)
  })
}

/** @deprecated Prefer mergePortalTripIntoSession */
export function mergePortalEtaIntoSession(
  tripId: string,
  etaChain: ChainLeg[],
  legs?: TripStoreRow['legs'],
): void {
  const existing = getTrip(tripId)
  if (!existing) return
  mergePortalTripIntoSession(tripId, {
    ...existing,
    eta_chain: etaChain.length ? etaChain : existing.eta_chain,
    legs: legs?.length ? legs : existing.legs,
  })
}

function awardFromRow(
  award: Record<string, unknown> | null | undefined,
): { tail?: string | null; aircraft_type?: string | null } | null {
  if (!award) return null
  return {
    tail: award.tail ? String(award.tail) : null,
    aircraft_type: award.aircraft_type ? String(award.aircraft_type) : null,
  }
}

export async function fetchPortalTripByToken(
  token: string,
): Promise<TripStoreRow | null> {
  if (!canPersist()) return null
  const [tripRows, legRows, etaRows, awardRows] = await Promise.all([
    safeQuery<Record<string, unknown>[]>('portal_trip_by_token', () =>
      db().rpc('portal_trip_by_token', { p_token: token }),
    ),
    safeQuery<Record<string, unknown>[]>('portal_legs_by_token', () =>
      db().rpc('portal_legs_by_token', { p_token: token }),
    ),
    safeQuery<Record<string, unknown>[]>('portal_eta_nodes_by_token', () =>
      db().rpc('portal_eta_nodes_by_token', { p_token: token }),
    ),
    safeQuery<Record<string, unknown>[]>('portal_award_by_token', () =>
      db().rpc('portal_award_by_token', { p_token: token }),
    ),
  ])
  const tripRow = Array.isArray(tripRows) ? tripRows[0] : null
  if (!tripRow) return null
  const legs = mapPortalLegs(legRows as never)
  const etaChain = mapEtaNodeRows(etaRows as never)
  const award = Array.isArray(awardRows) ? awardRows[0] : null
  return stubTripFromPortalRow(tripRow, legs, etaChain, awardFromRow(award))
}

export async function fetchPortalTripById(
  tripId: string,
): Promise<TripStoreRow | null> {
  if (!canPersist()) return null
  const [tripRowsRaw, legRows, etaRows] = await Promise.all([
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
  // portal_chat arrives with 0040; eta_chain with 0039 — fall back if prod lags.
  let tripRows = tripRowsRaw
  if (!tripRows) {
    tripRows = await safeQuery<Record<string, unknown>[]>(
      'portal_trips.by_id_eta',
      () =>
        db()
          .from('portal_trips')
          .select(PORTAL_TRIP_COLS_WITH_ETA)
          .eq('id', tripId)
          .limit(1),
    )
  }
  if (!tripRows) {
    tripRows = await safeQuery<Record<string, unknown>[]>(
      'portal_trips.by_id_base',
      () =>
        db()
          .from('portal_trips')
          .select(PORTAL_TRIP_COLS_BASE)
          .eq('id', tripId)
          .limit(1),
    )
  }
  const tripRow = Array.isArray(tripRows) ? tripRows[0] : null
  if (!tripRow) return null
  // Best-effort selected offer when quick meta missing (signed-in portal).
  let award: { tail?: string | null; aircraft_type?: string | null } | null =
    null
  if (!tripRow.tail || !tripRow.aircraft_type) {
    const offerRows = await safeQuery<Record<string, unknown>[]>(
      'offers.portal_award',
      () =>
        db()
          .from('offers')
          .select('notes,aircraft_id,state')
          .eq('trip_id', tripId)
          .eq('state', 'selected')
          .limit(1),
    )
    const o = Array.isArray(offerRows) ? offerRows[0] : null
    if (o) {
      let notes: Record<string, unknown> = {}
      try {
        notes =
          typeof o.notes === 'string' && o.notes.trim().startsWith('{')
            ? (JSON.parse(o.notes) as Record<string, unknown>)
            : {}
      } catch {
        notes = {}
      }
      award = {
        tail: notes.tail ? String(notes.tail) : null,
        aircraft_type: notes.type_name ? String(notes.type_name) : null,
      }
      if ((!award.tail || !award.aircraft_type) && o.aircraft_id) {
        const ac = await safeQuery<Record<string, unknown>>(
          'aircraft.portal_award',
          () =>
            db()
              .from('aircraft')
              .select('tail,type_name')
              .eq('id', String(o.aircraft_id))
              .maybeSingle(),
        )
        if (ac && typeof ac === 'object') {
          award = {
            tail: award.tail || (ac.tail ? String(ac.tail) : null),
            aircraft_type:
              award.aircraft_type ||
              (ac.type_name ? String(ac.type_name) : null),
          }
        }
      }
    }
  }
  const legs = mapPortalLegs(legRows as never)
  const etaChain = mapEtaNodeRows(etaRows as never)
  return stubTripFromPortalRow(tripRow, legs, etaChain, award)
}

/** Ensure session trip has ETA chain + award facts for live tracking. */
export async function ensurePortalTripTrackingReady(opts: {
  tripId: string
  token?: string | null
}): Promise<TripStoreRow | null> {
  const local = getTrip(opts.tripId)
  if (local && !needsPortalFacts(local)) return local

  const remote = opts.token
    ? await fetchPortalTripByToken(opts.token)
    : await fetchPortalTripById(opts.tripId)
  if (!remote) return local ?? null

  if (local) {
    mergePortalTripIntoSession(opts.tripId, remote)
    return getTrip(opts.tripId) ?? local
  }
  return ensureTripInSession(remote)
}
