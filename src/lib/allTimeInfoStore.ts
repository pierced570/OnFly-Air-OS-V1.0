/**
 * All Time Info store — persists master trip metric rows + event journal.
 * Syncs from the trip spine; retains discarded trip snapshots for history.
 */

import {
  buildAllTimeTripRow,
  mergeAllTimeTripRow,
  sortAllTimeRows,
  type AllTimeEvent,
  type AllTimeEventKind,
  type AllTimeTripInput,
  type AllTimeTripRow,
} from '@/domain/allTimeInfo'
import type { FinancialRecord } from '@/domain/financials'
import {
  getTrip,
  listTrips,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'
import { listFinancials, subscribeFinancials } from '@/lib/financialsStore'

const ROWS_KEY = 'onfly.all_time.rows.v1'
const EVENTS_KEY = 'onfly.all_time.events.v1'
const MAX_EVENTS = 2000

const rows = new Map<string, AllTimeTripRow>()
let events: AllTimeEvent[] = []
let rowSnapshot: AllTimeTripRow[] = []
let eventSnapshot: AllTimeEvent[] = []
const listeners = new Set<() => void>()
let wired = false

function bump() {
  rowSnapshot = sortAllTimeRows([...rows.values()])
  eventSnapshot = [...events]
  persist()
  for (const l of listeners) l()
}

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(ROWS_KEY, JSON.stringify([...rows.values()]))
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)))
  } catch {
    /* quota */
  }
}

function load() {
  if (typeof localStorage === 'undefined') return
  try {
    const rawRows = localStorage.getItem(ROWS_KEY)
    if (rawRows) {
      const parsed = JSON.parse(rawRows) as AllTimeTripRow[]
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          if (r?.trip_id) rows.set(r.trip_id, r)
        }
      }
    }
    const rawEv = localStorage.getItem(EVENTS_KEY)
    if (rawEv) {
      const parsed = JSON.parse(rawEv) as AllTimeEvent[]
      if (Array.isArray(parsed)) events = parsed
    }
  } catch {
    /* ignore */
  }
}

function financialForTrip(
  tripId: string,
  financials: FinancialRecord[],
): FinancialRecord | null {
  const id = `trip-${tripId}`
  return (
    financials.find((f) => f.id === id || f.id === tripId) ??
    null
  )
}

function tripToInput(
  trip: TripStoreRow,
  opts?: {
    discarded?: boolean
    discarded_at?: string | null
    financial?: FinancialRecord | null
  },
): AllTimeTripInput {
  return {
    id: trip.id,
    ref: trip.ref,
    code: trip.code,
    state: trip.state,
    lane: trip.lane,
    client_name: trip.client_name,
    client_id: trip.client_id,
    po_number: trip.po_number,
    lost_reason: trip.lost_reason,
    discarded: opts?.discarded,
    discarded_at: opts?.discarded_at,
    quick: trip.quick,
    hard_quote: trip.hard_quote,
    invoice: trip.invoice,
    offers: trip.offers,
    events: trip.events,
    eta_chain: trip.eta_chain,
    legs: trip.legs,
    financial: opts?.financial
      ? {
          client_invoiced_amount: opts.financial.client_invoiced_amount,
          vendor_amount: opts.financial.vendor_amount,
          margin: opts.financial.margin,
          referral_name: opts.financial.referral_name,
          operator_po: opts.financial.operator_po,
        }
      : null,
  }
}

function upsertFromInput(input: AllTimeTripInput) {
  const next = buildAllTimeTripRow(input)
  const merged = mergeAllTimeTripRow(rows.get(input.id), next)
  rows.set(input.id, merged)
}

export function syncTripToAllTime(
  trip: TripStoreRow,
  opts?: { discarded?: boolean; discarded_at?: string | null },
) {
  const fin = financialForTrip(trip.id, listFinancials())
  upsertFromInput(tripToInput(trip, { ...opts, financial: fin }))
  bump()
}

export function syncAllTripsToAllTime() {
  const financials = listFinancials()
  for (const trip of listTrips()) {
    upsertFromInput(
      tripToInput(trip, { financial: financialForTrip(trip.id, financials) }),
    )
  }
  bump()
}

/** Snapshot a trip before discard so history survives removal from trip Map. */
export function recordTripDiscarded(trip: TripStoreRow, atIso?: string) {
  const at = atIso ?? new Date().toISOString()
  const fin = financialForTrip(trip.id, listFinancials())
  upsertFromInput(
    tripToInput(trip, {
      discarded: true,
      discarded_at: at,
      financial: fin,
    }),
  )
  logAllTimeEvent({
    kind: 'trip_discarded',
    trip_id: trip.id,
    trip_code: trip.code,
    summary: `Discarded ${trip.code || trip.id} · ${trip.lane || 'lane?'}`,
    payload: { state: trip.state, client: trip.client_name ?? trip.quick?.client_name },
    at,
  })
}

export function logAllTimeEvent(input: {
  kind: AllTimeEventKind
  trip_id?: string | null
  trip_code?: string | null
  summary: string
  payload?: Record<string, unknown>
  at?: string
}) {
  const ev: AllTimeEvent = {
    id: crypto.randomUUID(),
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    trip_id: input.trip_id ?? null,
    trip_code: input.trip_code ?? null,
    summary: input.summary,
    payload: input.payload,
  }
  events = [ev, ...events].slice(0, MAX_EVENTS)
  bump()
}

/** Desk / scratch parse — may not have a trip_id yet. */
export function logRequestParsed(opts: {
  summary: string
  trip_id?: string | null
  trip_code?: string | null
  payload?: Record<string, unknown>
}) {
  logAllTimeEvent({
    kind: 'request_parsed',
    trip_id: opts.trip_id,
    trip_code: opts.trip_code,
    summary: opts.summary,
    payload: opts.payload,
  })
}

export function listAllTimeRows(): AllTimeTripRow[] {
  return rowSnapshot
}

export function listAllTimeEvents(): AllTimeEvent[] {
  return eventSnapshot
}

export function subscribeAllTime(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Wire trip + financials subscriptions once (call from app shell / page). */
export function ensureAllTimeSync(): () => void {
  if (wired) return () => {}
  wired = true
  syncAllTripsToAllTime()
  const unsubTrips = subscribeTrips(() => {
    syncAllTripsToAllTime()
  })
  const unsubFin = subscribeFinancials(() => {
    syncAllTripsToAllTime()
  })
  return () => {
    wired = false
    unsubTrips()
    unsubFin()
  }
}

/** Capture discard if trip still in memory. */
export function captureDiscardIfPresent(tripId: string) {
  const trip = getTrip(tripId)
  if (trip) recordTripDiscarded(trip)
}

load()
rowSnapshot = sortAllTimeRows([...rows.values()])
eventSnapshot = [...events]
