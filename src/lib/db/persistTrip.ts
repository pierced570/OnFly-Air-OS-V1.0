/**
 * Persist trips / legs / offers through Supabase.
 * State changes go through trip_transition RPC — never UPDATE trips.state.
 */

import type { TripState } from '@/domain/stateMachine'
import { toDbLegType } from '@/domain/tripLegs'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import { tripTransition } from '@/lib/supabase'
import type { OfferRow, TripLegRow, TripStoreRow } from '@/lib/tripStore'

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

  const inserted = await safeQuery('trips.insert', () =>
    db().from('trips').insert({
      id: trip.id,
      state: trip.state,
      client_id: clientUuid,
      payload_kind: payloadKind,
      lane_label: trip.lane,
      payload_summary: trip.payload_summary,
      ready_label: trip.ready_label,
      accept_token: trip.hard_quote?.accept_token ?? null,
      po_number: trip.quick?.po || null,
      session_meta: {
        ref: trip.ref,
        quick: trip.quick ?? null,
        hard_quote: trip.hard_quote ?? null,
        candidates: trip.candidates.slice(0, 8),
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
  await safeQuery('trips.shell', () =>
    db()
      .from('trips')
      .update({
        client_id: clientUuid,
        lane_label: trip.lane,
        payload_summary: trip.payload_summary,
        ready_label: trip.ready_label,
        accept_token: trip.hard_quote?.accept_token ?? null,
        po_number: trip.quick?.po || null,
        thread_number: trip.thread_number,
        thread_disbanded_at: trip.thread_disbanded_at,
        session_meta: {
          ref: trip.ref,
          quick: trip.quick ?? null,
          hard_quote: trip.hard_quote ?? null,
          candidates: trip.candidates.slice(0, 8),
          invoice: trip.invoice,
        },
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
    bookingGated: o.bookingGated,
    needsInfo: o.needsInfo,
    fee_scope: o.fee_scope,
    offer_notes: o.notes,
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
    db().from('offers').upsert(
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
    ),
  )
  return data !== null
}

async function persistOffers(tripId: string, offers: OfferRow[]): Promise<void> {
  if (!canPersist() || !offers.length) return
  for (const o of offers) {
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
  if (!canPersist()) {
    throw new Error(
      'Supabase is not configured — offer links cannot be opened on other devices',
    )
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
        session_meta: { ref: trip.ref },
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
