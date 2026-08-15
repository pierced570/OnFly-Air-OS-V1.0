/**
 * Hydrate trips + legs + offers from Supabase into the session tripStore.
 */

import type { TripState } from '@/domain/stateMachine'
import type { ChainLeg, EtaDefaults, EtaSource, ServicePattern } from '@/domain/etaChain'
import { normalizeTripPassengers } from '@/domain/tripPassengers'
import { getClient } from '@/lib/clientStore'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import {
  getTripByAcceptToken,
  getTripByOfferToken,
  replaceTripsFromDb,
  type OfferRow,
  type TripLegRow,
  type TripStoreRow,
} from '@/lib/tripStore'

/**
 * Trip columns used by the public offer board + hydrate.
 * Prefer `*` so a lagging prod schema (missing ETA/thread cols) still loads.
 * Explicit lists that include unmigrated columns make PostgREST return 400 and
 * the whole offer link looks "expired".
 */
const TRIP_PUBLIC_SELECT = '*'

function mapOfferDbRow(
  r: Record<string, unknown>,
  tripId: string,
): OfferRow {
  let notes: Record<string, unknown> = {}
  try {
    notes = r.notes ? JSON.parse(String(r.notes)) : {}
  } catch {
    notes = {}
  }
  const opId = r.operator_id || notes.operator_id || ''
  const acId = r.aircraft_id || notes.aircraft_id || ''
  return {
    id: String(r.id),
    trip_id: tripId,
    operator_id: String(opId),
    operator_name: String(notes.operator_name || 'Operator'),
    aircraft_id: String(acId),
    tail: String(notes.tail || ''),
    type_name: notes.type_name == null ? null : String(notes.type_name),
    state: (String(r.state) as OfferRow['state']) || 'pinged',
    ping_sent_at: r.ping_sent_at ? String(r.ping_sent_at) : null,
    notified_at: notes.notified_at ? String(notes.notified_at) : null,
    declined_acked_at: notes.declined_acked_at
      ? String(notes.declined_acked_at)
      : null,
    replied_at: r.replied_at ? String(r.replied_at) : null,
    time_to_position_min:
      r.time_to_position_min == null ? null : Number(r.time_to_position_min),
    quick_turn_min:
      notes.quick_turn_min == null ? null : Number(notes.quick_turn_min),
    live_leg_min: r.live_leg_min == null ? null : Number(r.live_leg_min),
    wait_ok: r.wait_ok == null ? null : Boolean(r.wait_ok),
    max_wait_hrs: r.max_wait_hrs == null ? null : Number(r.max_wait_hrs),
    price_net: r.price_net == null ? null : Number(r.price_net),
    fee_scope:
      notes.fee_scope === 'aircraft_only' ||
      notes.fee_scope === 'aircraft_and_fees'
        ? notes.fee_scope
        : null,
    notes: notes.offer_notes == null ? null : String(notes.offer_notes),
    duty_available_min:
      notes.duty_available_min == null
        ? null
        : Number(notes.duty_available_min),
    duty_included_min:
      notes.duty_included_min == null ? null : Number(notes.duty_included_min),
    magic_token: String(r.magic_token || ''),
    bookingGated: Boolean(notes.bookingGated),
    needsInfo: Array.isArray(notes.needsInfo)
      ? (notes.needsInfo as string[])
      : [],
    contact_cell: String(notes.contact_cell || ''),
    contact_cell_is_mock: Boolean(notes.contact_cell_is_mock),
    contact_email: String(notes.contact_email || ''),
    quote_link_channel:
      notes.quote_link_channel === 'sms' ||
      notes.quote_link_channel === 'email' ||
      notes.quote_link_channel === 'both'
        ? notes.quote_link_channel
        : 'both',
  }
}

function mapTripShellRow(
  r: Record<string, unknown>,
  offers: OfferRow[],
  extras?: Partial<
    Pick<
      TripStoreRow,
      | 'events'
      | 'eta_chain'
      | 'legs'
      | 'participants'
      | 'thread'
      | 'documents'
    >
  >,
): TripStoreRow {
  const meta = (r.session_meta as Record<string, unknown>) || {}
  const hard = meta.hard_quote as TripStoreRow['hard_quote'] | undefined
  const threadFromMeta = meta.thread_number ? String(meta.thread_number) : null
  const threadDisbandedFromMeta = meta.thread_disbanded_at
    ? String(meta.thread_disbanded_at)
    : null
  const patternFromMeta =
    (meta.service_pattern as ServicePattern | null | undefined) ?? null
  const metaName =
    typeof meta.client_name === 'string' && meta.client_name.trim()
      ? meta.client_name.trim()
      : null
  const clientId = r.client_id ? String(r.client_id) : undefined
  const fromDir = !metaName && clientId ? getClient(clientId)?.name?.trim() : ''
  return {
    id: String(r.id),
    ref: Number(r.ref ?? meta.ref ?? 0),
    code: typeof meta.code === 'string' ? meta.code : '',
    state: String(r.state) as TripState,
    lane: String(r.lane_label || ''),
    payload_summary: String(r.payload_summary || ''),
    ready_label: String(r.ready_label || ''),
    candidates: Array.isArray(meta.candidates)
      ? (meta.candidates as TripStoreRow['candidates'])
      : [],
    offers,
    events: extras?.events ?? [],
    offer_margin_pct:
      typeof meta.offer_margin_pct === 'number'
        ? meta.offer_margin_pct
        : null,
    hard_quote: hard
      ? { ...hard, accept_token: String(r.accept_token || hard.accept_token) }
      : r.accept_token
        ? {
            total: 0,
            accept_token: String(r.accept_token),
            payload_kind: 'cargo' as const,
          }
        : undefined,
    quick: (meta.quick as TripStoreRow['quick']) ?? undefined,
    eta_chain: extras?.eta_chain ?? [],
    service_pattern:
      (r.service_pattern as ServicePattern | null | undefined) ??
      patternFromMeta,
    promised_delivery: r.promised_delivery
      ? String(r.promised_delivery)
      : meta.promised_delivery
        ? String(meta.promised_delivery)
        : null,
    eta_defaults_snapshot:
      (r.eta_defaults_snapshot as EtaDefaults | null | undefined) ??
      ((meta.eta_defaults_snapshot as EtaDefaults | null | undefined) ?? null),
    thread_number: r.thread_number
      ? String(r.thread_number)
      : threadFromMeta,
    thread_disbanded_at: r.thread_disbanded_at
      ? String(r.thread_disbanded_at)
      : threadDisbandedFromMeta,
    legs: extras?.legs ?? [],
    participants: extras?.participants ?? [],
    thread: extras?.thread ?? [],
    documents: extras?.documents ?? [],
    invoice: (meta.invoice as TripStoreRow['invoice']) ?? null,
    client_id: clientId,
    client_name: metaName || fromDir || null,
    request_id:
      typeof meta.request_id === 'string' && meta.request_id.trim()
        ? meta.request_id.trim()
        : undefined,
    portal_pickup_address:
      typeof meta.portal_pickup_address === 'string'
        ? meta.portal_pickup_address
        : null,
    portal_dropoff_address:
      typeof meta.portal_dropoff_address === 'string'
        ? meta.portal_dropoff_address
        : null,
    portal_pax_names: Array.isArray(meta.portal_pax_names)
      ? meta.portal_pax_names.map((n) => String(n).trim()).filter(Boolean)
      : undefined,
    passengers: Array.isArray(meta.passengers)
      ? normalizeTripPassengers(meta.passengers)
      : undefined,
  }
}

/**
 * Public offer board: resolve magic_token from session, else load that trip
 * from Supabase so operators on another device can open the link.
 */
export async function resolveOfferByToken(token: string): Promise<{
  trip: TripStoreRow
  offer: OfferRow
} | null> {
  const trimmed = token.trim()
  if (!trimmed) return null
  const local = getTripByOfferToken(trimmed)
  if (local) return local
  if (!canPersist()) return null

  const offerRows = await safeQuery('offers.by_token', () =>
    db().from('offers').select('*').eq('magic_token', trimmed).limit(1),
  )
  const offerDb = Array.isArray(offerRows) ? offerRows[0] : null
  if (!offerDb) return null
  const tripId = String((offerDb as { trip_id: string }).trip_id)

  const tripRows = await safeQuery('trips.by_offer_token', () =>
    db()
      .from('trips')
      .select(TRIP_PUBLIC_SELECT)
      .eq('id', tripId)
      .is('discarded_at', null)
      .limit(1),
  )
  const tripDb = Array.isArray(tripRows) ? tripRows[0] : null
  if (!tripDb) return null

  const allOffers = await safeQuery('offers.for_trip', () =>
    db().from('offers').select('*').eq('trip_id', tripId),
  )
  const offers = (Array.isArray(allOffers) ? allOffers : [offerDb]).map((r) =>
    mapOfferDbRow(r as Record<string, unknown>, tripId),
  )

  const mapped = mapTripShellRow(tripDb as Record<string, unknown>, offers)
  replaceTripsFromDb([mapped])
  return getTripByOfferToken(trimmed)
}

/**
 * Public client accept page: resolve accept_token from session, else load that
 * trip from Supabase so clients on another device can open the email link.
 */
export async function resolveTripByAcceptToken(
  token: string,
): Promise<TripStoreRow | null> {
  const trimmed = token.trim()
  if (!trimmed) return null
  const local = getTripByAcceptToken(trimmed)
  if (local) return local
  if (!canPersist()) return null

  const tripRows = await safeQuery('trips.by_accept_token', () =>
    db()
      .from('trips')
      .select(TRIP_PUBLIC_SELECT)
      .eq('accept_token', trimmed)
      .is('discarded_at', null)
      .limit(1),
  )
  const tripDb = Array.isArray(tripRows) ? tripRows[0] : null
  if (!tripDb) return null
  const tripId = String((tripDb as { id: string }).id)

  const allOffers = await safeQuery('offers.for_accept_trip', () =>
    db().from('offers').select('*').eq('trip_id', tripId),
  )
  const offers = (Array.isArray(allOffers) ? allOffers : []).map((r) =>
    mapOfferDbRow(r as Record<string, unknown>, tripId),
  )

  const mapped = mapTripShellRow(tripDb as Record<string, unknown>, offers)
  replaceTripsFromDb([mapped])
  return getTripByAcceptToken(trimmed)
}

export async function hydrateTrips(): Promise<number> {
  if (!canPersist()) return 0

  const tripRows = await safeQuery('trips.hydrate', () =>
    db()
      .from('trips')
      .select(TRIP_PUBLIC_SELECT)
      .is('discarded_at', null)
      .not('state', 'in', '("closed","lost","cancelled")')
      .order('ref', { ascending: false })
      .limit(200),
  )
  if (!Array.isArray(tripRows)) {
    // Query failed — do not flush (would race desk deletes / soft-discards).
    return 0
  }
  if (!tripRows.length) {
    // Truly empty active desk — prune previously synced ghosts, then push
    // any local-only trips that never landed.
    const { flushAllTrips, replaceTripsFromDb } = await import('@/lib/tripStore')
    replaceTripsFromDb([], { emptyOk: true })
    await flushAllTrips()
    return 0
  }

  const ids = tripRows.map((r: { id: string }) => r.id)
  const legRows = await safeQuery('trip_legs.hydrate', () =>
    db().from('trip_legs').select('*').in('trip_id', ids).order('seq'),
  )
  const offerRows = await safeQuery('offers.hydrate', () =>
    db().from('offers').select('*').in('trip_id', ids),
  )
  const partRows = await safeQuery('trip_participants.hydrate', () =>
    db().from('trip_participants').select('*').in('trip_id', ids),
  )
  const etaNodeRows = await safeQuery('trip_eta_nodes.hydrate', () =>
    db().from('trip_eta_nodes').select('*').in('trip_id', ids).order('seq'),
  )
  const eventRows = await safeQuery('trip_events.hydrate', () =>
    db()
      .from('trip_events')
      .select('trip_id,at,actor,kind,payload')
      .in('trip_id', ids)
      .order('at', { ascending: true }),
  )

  const eventsByTrip = new Map<
    string,
    Array<{ at: string; actor: string; kind: string; payload: Record<string, unknown> }>
  >()
  if (Array.isArray(eventRows)) {
    for (const r of eventRows as Record<string, unknown>[]) {
      const tripId = String(r.trip_id)
      const list = eventsByTrip.get(tripId) ?? []
      list.push({
        at: String(r.at),
        actor: String(r.actor || 'system'),
        kind: String(r.kind),
        payload:
          r.payload && typeof r.payload === 'object'
            ? (r.payload as Record<string, unknown>)
            : {},
      })
      eventsByTrip.set(tripId, list)
    }
  }

  const etaByTrip = new Map<string, ChainLeg[]>()
  if (Array.isArray(etaNodeRows)) {
    for (const r of etaNodeRows as Record<string, unknown>[]) {
      const tripId = String(r.trip_id)
      const list = etaByTrip.get(tripId) ?? []
      list.push({
        seq: Number(r.seq),
        type: String(r.type) as ChainLeg['type'],
        branch: String(r.branch) as ChainLeg['branch'],
        label: String(r.label || ''),
        event: String(r.event || r.label || ''),
        from: {
          lat: Number(r.from_lat ?? 0),
          lon: Number(r.from_lon ?? 0),
          icao: r.from_icao ? String(r.from_icao) : undefined,
          tz: r.from_tz ? String(r.from_tz) : undefined,
        },
        to: {
          lat: Number(r.to_lat ?? 0),
          lon: Number(r.to_lon ?? 0),
          icao: r.to_icao ? String(r.to_icao) : undefined,
          tz: r.to_tz ? String(r.to_tz) : undefined,
        },
        est_start: String(r.est_start),
        est_end: String(r.est_end),
        actual_start: r.actual_start ? String(r.actual_start) : null,
        actual_end: r.actual_end ? String(r.actual_end) : null,
        duration_min: Number(r.duration_min ?? 0),
        duration_key: r.duration_key
          ? (String(r.duration_key) as ChainLeg['duration_key'])
          : undefined,
        source: (String(r.source || 'assumed') as EtaSource),
        duration_source: String(r.source || 'assumed'),
        distance_mi: r.distance_mi == null ? null : Number(r.distance_mi),
        distance_nm: r.distance_nm == null ? null : Number(r.distance_nm),
        slack_min: r.slack_min == null ? null : Number(r.slack_min),
      })
      etaByTrip.set(tripId, list)
    }
  }

  const legsByTrip = new Map<string, TripLegRow[]>()
  if (Array.isArray(legRows)) {
    for (const r of legRows as Record<string, unknown>[]) {
      const tripId = String(r.trip_id)
      const list = legsByTrip.get(tripId) ?? []
      const from = r.from_ref as { icao?: string } | null
      const to = r.to_ref as { icao?: string } | null
      list.push({
        id: String(r.id),
        seq: Number(r.seq),
        type: String(r.type),
        label: String(r.label || r.type),
        status: (String(r.status) as TripLegRow['status']) || 'pending',
        origin: from?.icao,
        dest: to?.icao,
        est_start: r.est_start ? String(r.est_start) : null,
        est_end: r.est_end ? String(r.est_end) : null,
        actual_start: r.actual_start ? String(r.actual_start) : null,
        actual_end: r.actual_end ? String(r.actual_end) : null,
        one_tap_token: String(r.one_tap_token || `leg-${r.id}`),
        party: String(r.party || 'dispatcher'),
      })
      legsByTrip.set(tripId, list)
    }
  }

  const offersByTrip = new Map<string, OfferRow[]>()
  if (Array.isArray(offerRows)) {
    for (const r of offerRows as Record<string, unknown>[]) {
      const tripId = String(r.trip_id)
      const list = offersByTrip.get(tripId) ?? []
      list.push(mapOfferDbRow(r, tripId))
      offersByTrip.set(tripId, list)
    }
  }

  const partsByTrip = new Map<
    string,
    TripStoreRow['participants']
  >()
  if (Array.isArray(partRows)) {
    for (const r of partRows as Record<string, unknown>[]) {
      const tripId = String(r.trip_id)
      const list = partsByTrip.get(tripId) ?? []
      list.push({
        id: String(r.id),
        role: String(r.role || 'other'),
        name: String(r.name || ''),
        company: String(r.company || ''),
        cell: String(r.cell || ''),
        email: String(r.email || ''),
        in_thread: r.in_thread !== false,
        released_at: r.released_at ? String(r.released_at) : null,
        invite_sent_at: null,
      })
      partsByTrip.set(tripId, list)
    }
  }

  const mapped: TripStoreRow[] = tripRows.map((r: Record<string, unknown>) =>
    mapTripShellRow(r, offersByTrip.get(String(r.id)) ?? [], {
      events: eventsByTrip.get(String(r.id)) ?? [],
      eta_chain: etaByTrip.get(String(r.id)) ?? [],
      legs: legsByTrip.get(String(r.id)) ?? [],
      participants: partsByTrip.get(String(r.id)) ?? [],
    }),
  )

  replaceTripsFromDb(mapped)
  return mapped.length
}
