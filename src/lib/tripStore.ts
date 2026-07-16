/**
 * In-memory trip/offers store for Chunk 3 demos (mock path).
 */

import type { Candidate } from '@/domain/routing'
import type { TripState } from '@/domain/stateMachine'
import { transition } from '@/domain/stateMachine'

export type OfferState =
  | 'pinged'
  | 'available'
  | 'unavailable'
  | 'quoted'
  | 'selected'
  | 'stood_down'
  | 'expired'

export type OfferRow = {
  id: string
  trip_id: string
  operator_id: string
  operator_name: string
  aircraft_id: string
  tail: string
  type_name: string | null
  state: OfferState
  ping_sent_at: string | null
  replied_at: string | null
  time_to_position_min: number | null
  live_leg_min: number | null
  wait_ok: boolean | null
  max_wait_hrs: number | null
  price_net: number | null
  magic_token: string
  bookingGated: boolean
  needsInfo: string[]
  contact_cell: string
}

export type TripStoreRow = {
  id: string
  ref: number
  state: TripState
  lane: string
  payload_summary: string
  ready_label: string
  candidates: Candidate[]
  offers: OfferRow[]
  events: Array<{ at: string; actor: string; kind: string; payload: Record<string, unknown> }>
  hard_quote?: {
    total: number
    accept_token: string
    disclosure_text?: string
    disclosure_at?: string
    payload_kind: 'cargo' | 'pax' | 'both'
  }
  lost_reason?: string
}

const trips = new Map<string, TripStoreRow>()
let refSeq = 2000

export function createTripFromCandidates(opts: {
  lane: string
  payload_summary: string
  ready_label: string
  candidates: Candidate[]
  payload_kind: 'cargo' | 'pax' | 'both'
}): TripStoreRow {
  const id = crypto.randomUUID()
  const row: TripStoreRow = {
    id,
    ref: ++refSeq,
    state: 'quoted_estimated',
    lane: opts.lane,
    payload_summary: opts.payload_summary,
    ready_label: opts.ready_label,
    candidates: opts.candidates,
    offers: opts.candidates.slice(0, 5).map((c, i) => ({
      id: crypto.randomUUID(),
      trip_id: id,
      operator_id: c.operator_id,
      operator_name: c.operator_name,
      aircraft_id: c.aircraft_id,
      tail: c.tail,
      type_name: c.type_name,
      state: 'pinged',
      ping_sent_at: null,
      replied_at: null,
      time_to_position_min: null,
      live_leg_min: null,
      wait_ok: null,
      max_wait_hrs: null,
      price_net: null,
      magic_token: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      bookingGated: c.bookingGated,
      needsInfo: c.needsInfo,
      contact_cell: `+1555000${String(1000 + i).slice(-4)}`,
    })),
    events: [
      {
        at: new Date().toISOString(),
        actor: 'dispatcher',
        kind: 'created_from_estimate',
        payload: {},
      },
      {
        at: new Date().toISOString(),
        actor: 'system',
        kind: 'payload_kind',
        payload: { payload_kind: opts.payload_kind },
      },
    ],
  }
  trips.set(id, row)
  return row
}

export function getTrip(id: string) {
  return trips.get(id) ?? null
}

export function getTripByOfferToken(token: string) {
  for (const t of trips.values()) {
    const o = t.offers.find((x) => x.magic_token === token)
    if (o) return { trip: t, offer: o }
  }
  return null
}

export function getTripByAcceptToken(token: string) {
  for (const t of trips.values()) {
    if (t.hard_quote?.accept_token === token) return t
  }
  return null
}

export function listTrips() {
  return [...trips.values()].sort((a, b) => b.ref - a.ref)
}

export function mutateTrip(id: string, fn: (t: TripStoreRow) => void) {
  const t = trips.get(id)
  if (!t) throw new Error('trip not found')
  fn(t)
  trips.set(id, t)
  return t
}

export function safeTransitionTrip(
  id: string,
  to: TripState,
  actor: string,
  payload: Record<string, unknown> = {},
) {
  return mutateTrip(id, (t) => {
    const result = transition(t.state, to, actor, payload)
    t.state = result.to
    t.events.push({
      at: new Date().toISOString(),
      actor,
      kind: result.event.kind,
      payload: result.event.payload,
    })
  })
}

export function payloadKindOf(t: TripStoreRow): 'cargo' | 'pax' | 'both' {
  const ev = [...t.events].reverse().find((e) => e.kind === 'payload_kind')
  return (ev?.payload.payload_kind as 'cargo' | 'pax' | 'both') ?? 'cargo'
}
