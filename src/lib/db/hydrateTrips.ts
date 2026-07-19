/**
 * Hydrate trips + legs + offers from Supabase into the session tripStore.
 */

import type { TripState } from '@/domain/stateMachine'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import {
  replaceTripsFromDb,
  type OfferRow,
  type TripLegRow,
  type TripStoreRow,
} from '@/lib/tripStore'

export async function hydrateTrips(): Promise<number> {
  if (!canPersist()) return 0

  const tripRows = await safeQuery('trips.hydrate', () =>
    db()
      .from('trips')
      .select(
        'id,ref,state,client_id,lane_label,payload_summary,ready_label,accept_token,session_meta,po_number,created_at',
      )
      .not('state', 'in', '("closed","lost","cancelled")')
      .order('ref', { ascending: false })
      .limit(200),
  )
  if (!Array.isArray(tripRows) || !tripRows.length) {
    // Still flush anything sitting in localStorage/session
    const { flushAllTrips } = await import('@/lib/tripStore')
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
      let notes: Record<string, unknown> = {}
      try {
        notes = r.notes ? JSON.parse(String(r.notes)) : {}
      } catch {
        notes = {}
      }
      const list = offersByTrip.get(tripId) ?? []
      list.push({
        id: String(r.id),
        trip_id: tripId,
        operator_id: String(r.operator_id || ''),
        operator_name: String(notes.operator_name || 'Operator'),
        aircraft_id: String(r.aircraft_id || ''),
        tail: String(notes.tail || ''),
        type_name: notes.type_name == null ? null : String(notes.type_name),
        state: (String(r.state) as OfferRow['state']) || 'pinged',
        ping_sent_at: r.ping_sent_at ? String(r.ping_sent_at) : null,
        replied_at: r.replied_at ? String(r.replied_at) : null,
        time_to_position_min:
          r.time_to_position_min == null ? null : Number(r.time_to_position_min),
        live_leg_min: r.live_leg_min == null ? null : Number(r.live_leg_min),
        wait_ok: r.wait_ok == null ? null : Boolean(r.wait_ok),
        max_wait_hrs: r.max_wait_hrs == null ? null : Number(r.max_wait_hrs),
        price_net: r.price_net == null ? null : Number(r.price_net),
        magic_token: String(r.magic_token || ''),
        bookingGated: Boolean(notes.bookingGated),
        needsInfo: Array.isArray(notes.needsInfo)
          ? (notes.needsInfo as string[])
          : [],
        contact_cell: String(notes.contact_cell || ''),
      })
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
        cell: String(r.cell || ''),
        email: String(r.email || ''),
      })
      partsByTrip.set(tripId, list)
    }
  }

  const mapped: TripStoreRow[] = tripRows.map((r: Record<string, unknown>) => {
    const meta = (r.session_meta as Record<string, unknown>) || {}
    const hard = meta.hard_quote as TripStoreRow['hard_quote'] | undefined
    return {
      id: String(r.id),
      ref: Number(r.ref ?? meta.ref ?? 0),
      state: String(r.state) as TripState,
      lane: String(r.lane_label || ''),
      payload_summary: String(r.payload_summary || ''),
      ready_label: String(r.ready_label || ''),
      candidates: Array.isArray(meta.candidates)
        ? (meta.candidates as TripStoreRow['candidates'])
        : [],
      offers: offersByTrip.get(String(r.id)) ?? [],
      events: [],
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
      legs: legsByTrip.get(String(r.id)) ?? [],
      participants: partsByTrip.get(String(r.id)) ?? [],
      thread: [],
      documents: [],
      invoice: (meta.invoice as TripStoreRow['invoice']) ?? null,
      client_id: r.client_id ? String(r.client_id) : undefined,
    }
  })

  replaceTripsFromDb(mapped)
  return mapped.length
}
