/**
 * Persist trips / legs / offers through Supabase.
 * State changes go through trip_transition RPC — never UPDATE trips.state.
 */

import type { TripState } from '@/domain/stateMachine'
import { parseLaneAirports } from '@/domain/offerMissionDisplay'
import { toDbLegType } from '@/domain/tripLegs'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import { tripTransition } from '@/lib/supabase'
import type { OfferRow, TripLegRow, TripStoreRow } from '@/lib/tripStore'
import {
  mergePortalChatMessages,
  normalizePortalChat,
} from '@/domain/portalChat'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(v: string | undefined | null): v is string {
  return Boolean(v && UUID_RE.test(v))
}

async function resolveClientUuid(
  clientId: string | undefined,
): Promise<string | null> {
  if (!clientId) return null
  if (isUuid(clientId)) {
    const byId = await safeQuery<{ id: string }>('clients.by_id', () =>
      db().from('clients').select('id').eq('id', clientId).maybeSingle(),
    )
    if (byId && typeof byId === 'object' && 'id' in byId) return String(byId.id)
  }
  const byKey = await safeQuery<{ id: string }>('clients.by_legacy', () =>
    db().from('clients').select('id').eq('legacy_key', clientId).maybeSingle(),
  )
  if (byKey && typeof byKey === 'object' && 'id' in byKey) return String(byKey.id)
  return null
}

function partyRole(role: string): string {
  const allowed = new Set([
    'dispatcher',
    'pilot',
    'operator_ops',
    'fbo',
    'driver',
    'client',
    'client_ap',
    'client_supply',
    'other',
  ])
  return allowed.has(role) ? role : 'other'
}

/** Portal + desk recover ICAOs when trip_legs / eta nodes lag. */
function tripRouteEndpoints(trip: TripStoreRow): {
  origin: string | null
  destination: string | null
} {
  const fromLeg = trip.legs.find((l) => l.origin)?.origin?.trim().toUpperCase()
  const toLeg = [...trip.legs]
    .reverse()
    .find((l) => l.dest)?.dest?.trim()
    .toUpperCase()
  const fromChain = trip.eta_chain
    .find((l) => l.type === 'air_leg' && l.from.icao)
    ?.from.icao?.trim()
    .toUpperCase()
  const toChain = trip.eta_chain
    .find((l) => l.type === 'air_leg' && l.to.icao)
    ?.to.icao?.trim()
    .toUpperCase()
  const parsed = parseLaneAirports(trip.lane)
  return {
    origin: fromLeg || fromChain || parsed?.origin || null,
    destination: toLeg || toChain || parsed?.dest || null,
  }
}

/** Portal-safe ETA snapshot for session_meta (no money / operator fields). */
function portalSafeEtaChain(trip: TripStoreRow): unknown[] {
  return (trip.eta_chain ?? []).map((l) => ({
    seq: l.seq,
    type: l.type,
    branch: l.branch,
    label: l.label,
    event: l.event,
    from: {
      icao: l.from.icao ?? null,
      tz: l.from.tz ?? null,
      lat: l.from.lat,
      lon: l.from.lon,
      label: l.from.label ?? null,
    },
    to: {
      icao: l.to.icao ?? null,
      tz: l.to.tz ?? null,
      lat: l.to.lat,
      lon: l.to.lon,
      label: l.to.label ?? null,
    },
    est_start: l.est_start,
    est_end: l.est_end,
    actual_start: l.actual_start ?? null,
    actual_end: l.actual_end ?? null,
    duration_min: l.duration_min,
    duration_key: l.duration_key ?? null,
    source: l.source,
    distance_mi: l.distance_mi ?? null,
    distance_nm: l.distance_nm ?? null,
    slack_min: l.slack_min ?? null,
  }))
}

/** Union local + DB portal_chat so a snapshot persist cannot drop new messages. */
async function mergedPortalChatForPersist(
  trip: TripStoreRow,
): Promise<ReturnType<typeof normalizePortalChat>> {
  let dbChat: unknown = []
  const existing = await safeQuery<{ session_meta?: Record<string, unknown> }>(
    'trips.portal_chat',
    () =>
      db()
        .from('trips')
        .select('session_meta')
        .eq('id', trip.id)
        .maybeSingle(),
  )
  if (existing && typeof existing === 'object' && existing.session_meta) {
    dbChat = existing.session_meta.portal_chat
  }
  return mergePortalChatMessages(
    normalizePortalChat(dbChat),
    normalizePortalChat(trip.portal_chat),
  )
}

/** Insert trip shell if missing. Does not overwrite state on conflict. */
export async function ensureTripRow(trip: TripStoreRow): Promise<boolean> {
  if (!canPersist()) return false
  const existing = await safeQuery<{ id: string; state: string }>('trips.by_id', () =>
    db().from('trips').select('id,state').eq('id', trip.id).maybeSingle(),
  )
  if (existing && typeof existing === 'object' && 'id' in existing) return true

  const clientUuid = await resolveClientUuid(trip.client_id)
  const payloadKind =
    [...trip.events].reverse().find((e) => e.kind === 'payload_kind')?.payload
      .payload_kind ?? 'cargo'
  const route = tripRouteEndpoints(trip)

  const inserted = await safeQuery('trips.insert', () =>
    db().from('trips').insert({
      id: trip.id,
      state: trip.state,
      client_id: clientUuid,
      payload_kind: payloadKind,
      lane_label: trip.lane,
      origin: route.origin,
      destination: route.destination,
      payload_summary: trip.payload_summary,
      ready_label: trip.ready_label,
      accept_token: trip.hard_quote?.accept_token ?? null,
      po_number: trip.po_number?.trim() || trip.quick?.po?.trim() || null,
      session_meta: {
        ref: trip.ref,
        code: trip.code,
        offer_margin_pct: trip.offer_margin_pct ?? null,
        client_name: trip.client_name ?? null,
        quick: trip.quick ?? null,
        hard_quote: trip.hard_quote ?? null,
        candidates: trip.candidates.slice(0, 8),
        request_id: trip.request_id ?? null,
        awb_needed: trip.awb_needed ?? false,
        awb_cleared_at: trip.awb_cleared_at ?? null,
        eta_chain: portalSafeEtaChain(trip),
        portal_chat: normalizePortalChat(trip.portal_chat),
      },
    }),
  )
  return inserted !== null
}

/** Upsert non-state trip fields + children. */
export async function persistTripSnapshot(trip: TripStoreRow): Promise<void> {
  if (!canPersist()) return
  await ensureTripRow(trip)

  const clientUuid = await resolveClientUuid(trip.client_id)
  const route = tripRouteEndpoints(trip)
  const portalChat = await mergedPortalChatForPersist(trip)
  // Keep ETA/thread fields in session_meta too — prod may lag migrations
  // that add service_pattern / thread_number columns (0014 / 0016).
  await safeQuery('trips.shell', () =>
    db()
      .from('trips')
      .update({
        client_id: clientUuid,
        lane_label: trip.lane,
        origin: route.origin,
        destination: route.destination,
        payload_summary: trip.payload_summary,
        ready_label: trip.ready_label,
        accept_token: trip.hard_quote?.accept_token ?? null,
        po_number: trip.po_number?.trim() || trip.quick?.po?.trim() || null,
        session_meta: {
          ref: trip.ref,
          code: trip.code,
          offer_margin_pct: trip.offer_margin_pct ?? null,
          client_name: trip.client_name ?? null,
          quick: trip.quick ?? null,
          hard_quote: trip.hard_quote ?? null,
          candidates: trip.candidates.slice(0, 8),
          invoice: trip.invoice,
          service_pattern: trip.service_pattern,
          promised_delivery: trip.promised_delivery,
          eta_defaults_snapshot: trip.eta_defaults_snapshot,
          thread_number: trip.thread_number,
          thread_disbanded_at: trip.thread_disbanded_at,
          portal_pickup_address: trip.portal_pickup_address ?? null,
          portal_dropoff_address: trip.portal_dropoff_address ?? null,
          portal_pickup_stop: trip.portal_pickup_stop ?? null,
          portal_dropoff_stop: trip.portal_dropoff_stop ?? null,
          portal_pax_names: trip.portal_pax_names ?? [],
          portal_ops_stage: trip.portal_ops_stage ?? null,
          passengers: trip.passengers ?? [],
          portal_cargo: trip.portal_cargo ?? null,
          portal_chat: portalChat,
          request_id: trip.request_id ?? null,
          awb_needed: trip.awb_needed ?? false,
          awb_cleared_at: trip.awb_cleared_at ?? null,
          eta_chain: portalSafeEtaChain(trip),
        },
      })
      .eq('id', trip.id),
  )
  // Best-effort column writes when migrations are applied.
  await safeQuery('trips.shell_extended', () =>
    db()
      .from('trips')
      .update({
        thread_number: trip.thread_number,
        thread_disbanded_at: trip.thread_disbanded_at,
      })
      .eq('id', trip.id),
  )

  await persistLegs(trip.id, trip.legs)
  await persistEtaNodes(trip)
  await persistOffers(trip.id, trip.offers)
  await persistParticipants(trip)
  await persistDocuments(trip)
}

async function persistEtaNodes(trip: TripStoreRow): Promise<void> {
  if (!canPersist() || !trip.eta_chain?.length) return
  await safeQuery('trips.eta_meta', () =>
    db()
      .from('trips')
      .update({
        service_pattern: trip.service_pattern,
        promised_delivery: trip.promised_delivery,
        eta_defaults_snapshot: trip.eta_defaults_snapshot,
      })
      .eq('id', trip.id),
  )
  // Upsert nodes first, then drop orphans — avoids empty-chain window if insert fails.
  const rows = trip.eta_chain.map((l) => ({
    trip_id: trip.id,
    seq: l.seq,
    type: l.type,
    branch: l.branch,
    label: l.label,
    event: l.event,
    from_icao: l.from.icao ?? null,
    to_icao: l.to.icao ?? null,
    from_tz: l.from.tz ?? null,
    to_tz: l.to.tz ?? null,
    from_lat: l.from.lat,
    from_lon: l.from.lon,
    to_lat: l.to.lat,
    to_lon: l.to.lon,
    est_start: l.est_start,
    est_end: l.est_end,
    actual_start: l.actual_start ?? null,
    actual_end: l.actual_end ?? null,
    duration_min: l.duration_min,
    duration_key: l.duration_key ?? null,
    source: l.source,
    distance_mi: l.distance_mi ?? null,
    distance_nm: l.distance_nm ?? null,
    slack_min: l.slack_min ?? null,
  }))
  await safeQuery('trip_eta_nodes.upsert', () =>
    db()
      .from('trip_eta_nodes')
      .upsert(rows, { onConflict: 'trip_id,seq' }),
  )
  const keepSeqs = trip.eta_chain.map((l) => l.seq)
  if (keepSeqs.length) {
    await safeQuery('trip_eta_nodes.delete_orphans', () =>
      db()
        .from('trip_eta_nodes')
        .delete()
        .eq('trip_id', trip.id)
        .not('seq', 'in', `(${keepSeqs.join(',')})`),
    )
  }
}

export async function persistLegs(
  tripId: string,
  legs: TripLegRow[],
): Promise<void> {
  if (!canPersist() || !legs.length) return
  const keepIds = legs.map((l) => l.id).filter(Boolean)
  if (keepIds.length) {
    // Drop orphaned legs left behind after rematerialize (new UUIDs).
    await safeQuery('trip_legs.delete_orphans', () =>
      db()
        .from('trip_legs')
        .delete()
        .eq('trip_id', tripId)
        .not('id', 'in', `(${keepIds.join(',')})`),
    )
  }
  const rows = legs.map((l) => ({
    id: l.id,
    trip_id: tripId,
    seq: l.seq,
    type: toDbLegType(l.type),
    status: l.status === 'done' ? 'done' : l.status === 'active' ? 'active' : 'pending',
    party: partyRole(l.party),
    label: l.label,
    from_ref: l.origin ? { icao: l.origin } : null,
    to_ref: l.dest ? { icao: l.dest } : null,
    est_start: l.est_start,
    est_end: l.est_end,
    actual_start: l.actual_start,
    actual_end: l.actual_end,
    one_tap_token: l.one_tap_token,
    duration_source: 'session',
  }))
  await safeQuery('trip_legs.upsert', () =>
    db().from('trip_legs').upsert(rows, { onConflict: 'id' }),
  )
}

function offerNotesJson(o: OfferRow): string {
  return JSON.stringify({
    operator_name: o.operator_name,
    tail: o.tail,
    type_name: o.type_name,
    contact_cell: o.contact_cell,
    contact_cell_is_mock: o.contact_cell_is_mock,
    contact_email: o.contact_email,
    quote_link_channel: o.quote_link_channel,
    notified_at: o.notified_at,
    declined_acked_at: o.declined_acked_at,
    quick_turn_min: o.quick_turn_min,
    bookingGated: o.bookingGated,
    needsInfo: o.needsInfo,
    fee_scope: o.fee_scope,
    offer_notes: o.notes,
    duty_available_min: o.duty_available_min,
    duty_included_min: o.duty_included_min,
    // Keep raw ids in notes even when FK columns are nulled.
    operator_id: o.operator_id,
    aircraft_id: o.aircraft_id,
  })
}

async function upsertOfferRow(
  tripId: string,
  o: OfferRow,
  opts: { operator_id: string | null; aircraft_id: string | null },
): Promise<boolean> {
  const data = await safeQuery(`offers.upsert.${o.id}`, () =>
    db()
      .from('offers')
      .upsert(
        {
          id: o.id,
          trip_id: tripId,
          operator_id: opts.operator_id,
          aircraft_id: opts.aircraft_id,
          state: o.state,
          ping_sent_at: o.ping_sent_at,
          replied_at: o.replied_at,
          time_to_position_min: o.time_to_position_min,
          live_leg_min: o.live_leg_min,
          wait_ok: o.wait_ok,
          max_wait_hrs: o.max_wait_hrs,
          price_net: o.price_net,
          magic_token: o.magic_token,
          notes: offerNotesJson(o),
        },
        { onConflict: 'id' },
      )
      .select('id')
      .maybeSingle(),
  )
  return Boolean(data && typeof data === 'object' && 'id' in data)
}

async function persistOffers(tripId: string, offers: OfferRow[]): Promise<void> {
  if (!canPersist() || !isUuid(tripId)) return
  // Snapshot at entry — mutateTrip mutates the live trip.offers array in place.
  const snapshot = offers.slice()
  const keepIds = snapshot.map((o) => o.id).filter(isUuid)
  // Drop offers removed from the desk waterfall (orphan cleanup).
  if (keepIds.length) {
    await safeQuery('offers.delete_orphans', () =>
      db()
        .from('offers')
        .delete()
        .eq('trip_id', tripId)
        .not('id', 'in', `(${keepIds.join(',')})`),
    )
  } else {
    await safeQuery('offers.delete_all', () =>
      db().from('offers').delete().eq('trip_id', tripId),
    )
  }
  for (const o of snapshot) {
    if (!isUuid(o.id) || !o.magic_token?.trim()) {
      console.warn('[db] offer missing uuid/token — skip', o.operator_name)
      continue
    }
    const opId = isUuid(o.operator_id) ? o.operator_id : null
    // Never send aircraft_id unless we know it exists — stale/fixture UUIDs
    // break FK and left public /offer/:token links unreadable.
    const ok = await upsertOfferRow(tripId, o, {
      operator_id: opId,
      aircraft_id: null,
    })
    if (!ok) {
      // Retry with both FKs null (operator uuid may also be missing in DB).
      const retry = await upsertOfferRow(tripId, o, {
        operator_id: null,
        aircraft_id: null,
      })
      if (!retry) {
        console.warn(
          '[db] offers.upsert failed after null-FK retry',
          o.operator_name,
          o.magic_token,
        )
      }
    }
  }
}

/** Hard-delete one offer row (desk waterfall remove). */
export async function deleteOfferFromDb(offerId: string): Promise<boolean> {
  if (!canPersist() || !isUuid(offerId)) return false
  const deleted = await safeQuery<{ id: string }[]>(
    'offers.delete_one',
    () =>
      db().from('offers').delete().eq('id', offerId).select('id'),
  )
  if (Array.isArray(deleted) && deleted.length > 0) return true
  // Distinguish missing row (done) from query failure (keep retrying).
  try {
    const { data, error } = await db()
      .from('offers')
      .select('id')
      .eq('id', offerId)
      .maybeSingle()
    if (error) {
      console.warn('[db] offers.delete_check:', error.message)
      return false
    }
    return data == null
  } catch (e) {
    console.warn('[db] offers.delete_check:', e)
    return false
  }
}

/** True when every offer magic_token is readable via anon (public offer board). */
export async function verifyOfferTokensReadable(
  offers: OfferRow[],
): Promise<{ ok: boolean; missing: string[] }> {
  if (!canPersist()) return { ok: false, missing: offers.map((o) => o.operator_name) }
  const missing: string[] = []
  for (const o of offers) {
    if (!o.magic_token?.trim()) {
      missing.push(o.operator_name)
      continue
    }
    const rows = await safeQuery('offers.verify_token', () =>
      db()
        .from('offers')
        .select('id')
        .eq('magic_token', o.magic_token)
        .limit(1),
    )
    const hit = Array.isArray(rows) ? rows[0] : null
    if (!hit) missing.push(o.operator_name)
  }
  return { ok: missing.length === 0, missing }
}

/**
 * Persist trip + offers and confirm public tokens resolve.
 * Throws when Supabase is configured but a token is not readable.
 */
export async function persistTripOffersForPublicLinks(
  trip: TripStoreRow,
): Promise<void> {
  // Local/demo (no Supabase): session-only links still work on this device.
  if (!canPersist()) {
    console.warn(
      '[db] Supabase unset — offer links will not open on other devices',
    )
    return
  }
  await persistTripSnapshot(trip)
  const check = await verifyOfferTokensReadable(trip.offers)
  if (!check.ok) {
    // One more force-null upsert pass, then re-check.
    for (const o of trip.offers) {
      if (!check.missing.includes(o.operator_name)) continue
      await upsertOfferRow(trip.id, o, {
        operator_id: null,
        aircraft_id: null,
      })
    }
    const again = await verifyOfferTokensReadable(trip.offers)
    if (!again.ok) {
      throw new Error(
        `Could not save offer link for: ${again.missing.join(', ')}. ` +
          'Fix Supabase offers table / RLS, then send again.',
      )
    }
  }
}

async function persistParticipants(trip: TripStoreRow): Promise<void> {
  if (!canPersist() || !trip.participants.length) return
  const rows = trip.participants.map((p) => ({
    id: p.id,
    trip_id: trip.id,
    role: partyRole(p.role),
    name: p.name,
    company: p.company || null,
    cell: p.cell || null,
    email: p.email || null,
    in_thread: p.in_thread !== false,
    released_at: p.released_at,
  }))
  await safeQuery('trip_participants.upsert', () =>
    db().from('trip_participants').upsert(rows, { onConflict: 'id' }),
  )
}

async function persistDocuments(trip: TripStoreRow): Promise<void> {
  if (!canPersist() || !trip.documents.length) return
  for (const d of trip.documents) {
    if (!isUuid(d.id)) continue
    await safeQuery(`documents.upsert.${d.id}`, () =>
      db().from('documents').upsert(
        {
          id: d.id,
          trip_id: trip.id,
          kind: d.kind,
          storage_path: d.url,
          parsed: { title: d.title },
          rendered_at: d.at,
        },
        { onConflict: 'id' },
      ),
    )
  }
}

/**
 * Sync a local state transition to the DB via trip_transition RPC.
 * Inserts the trip at `fromState` first when missing.
 */
export async function syncTripTransition(opts: {
  trip: TripStoreRow
  fromState: TripState
  toState: TripState
  actor: string
  payload?: Record<string, unknown>
}): Promise<void> {
  if (!canPersist()) return
  const { trip, fromState, toState, actor, payload = {} } = opts

  const existing = await safeQuery<{ id: string; state: string }>('trips.by_id', () =>
    db().from('trips').select('id,state').eq('id', trip.id).maybeSingle(),
  )

  if (!existing || typeof existing !== 'object' || !('id' in existing)) {
    const clientUuid = await resolveClientUuid(trip.client_id)
    await safeQuery('trips.insert_from', () =>
      db().from('trips').insert({
        id: trip.id,
        state: fromState,
        client_id: clientUuid,
        lane_label: trip.lane,
        payload_summary: trip.payload_summary,
        ready_label: trip.ready_label,
        accept_token: trip.hard_quote?.accept_token ?? null,
        po_number: trip.po_number?.trim() || trip.quick?.po?.trim() || null,
        session_meta: {
          ref: trip.ref,
          code: trip.code,
          offer_margin_pct: trip.offer_margin_pct ?? null,
          client_name: trip.client_name ?? null,
          quick: trip.quick ?? null,
          hard_quote: trip.hard_quote ?? null,
          candidates: trip.candidates.slice(0, 8),
          service_pattern: trip.service_pattern,
          promised_delivery: trip.promised_delivery,
          eta_defaults_snapshot: trip.eta_defaults_snapshot,
        },
      }),
    )
  } else if (String((existing as { state: string }).state) === toState) {
    await persistTripSnapshot(trip)
    return
  }

  try {
    await tripTransition(trip.id, toState, actor, payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/already in state/i.test(msg)) {
      await persistTripSnapshot(trip)
      return
    }
    throw e instanceof Error ? e : new Error(msg)
  }
  await persistTripSnapshot(trip)
}

export async function persistPortalTrackToken(opts: {
  token: string
  tripId: string
  email: string
}): Promise<void> {
  if (!canPersist()) return
  const { getTrip } = await import('@/lib/tripStore')
  const trip = getTrip(opts.tripId)
  if (!trip) return
  await ensureTripRow(trip)
  await safeQuery('portal_track_tokens.upsert', () =>
    db().from('portal_track_tokens').upsert({
      token: opts.token,
      trip_id: opts.tripId,
      email: opts.email.trim().toLowerCase(),
    }),
  )
}

/** Soft-delete a trip (desk queue remove). Never hard-DELETE — trip_events are append-only. */
export async function deleteTripFromDb(tripId: string): Promise<boolean> {
  if (!canPersist() || !isUuid(tripId)) return false
  const at = new Date().toISOString()
  await safeQuery('trip_events.discard', () =>
    db().from('trip_events').insert({
      trip_id: tripId,
      at,
      actor: 'dispatcher',
      kind: 'trip_discarded',
      payload: { reason: 'desk_delete' },
    }),
  )
  const updated = await safeQuery<{ id: string }[]>(
    'trips.discard',
    () =>
      db()
        .from('trips')
        .update({ discarded_at: at })
        .eq('id', tripId)
        .select('id'),
  )
  if (Array.isArray(updated) && updated.length > 0) return true

  // Distinguish missing row (done) from query failure (keep retrying).
  try {
    const { data, error } = await db()
      .from('trips')
      .select('discarded_at')
      .eq('id', tripId)
      .maybeSingle()
    if (error) {
      console.warn('[db] trips.discard_check:', error.message)
      return false
    }
    if (!data) return true
    return data.discarded_at != null
  } catch (e) {
    console.warn('[db] trips.discard_check:', e)
    return false
  }
}

/** Append desk offer_removed to the durable event log (best-effort). */
export async function persistOfferRemovedEvent(opts: {
  tripId: string
  offerId: string
  operatorName: string
  previousCount: number
  at: string
}): Promise<void> {
  if (!canPersist() || !isUuid(opts.tripId)) return
  await safeQuery('trip_events.offer_removed', () =>
    db().from('trip_events').insert({
      trip_id: opts.tripId,
      at: opts.at,
      actor: 'dispatcher',
      kind: 'offer_removed',
      payload: {
        offer_id: opts.offerId,
        operator_name: opts.operatorName,
        previous_count: opts.previousCount,
      },
    }),
  )
}
