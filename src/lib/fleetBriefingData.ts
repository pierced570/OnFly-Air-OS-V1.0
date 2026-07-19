/**
 * Assemble fleet briefing inputs from network, radar, trips, WX.
 */

import { createWxAdapter } from '@/adapters/wx'
import {
  NATIONAL_WX_HUBS,
  idleTopOperators,
  summarizeNationalWx,
  tripsCurrentlyFlying,
  type IdleOperatorRow,
  type NationalWxSummary,
  type FlyingTripRow,
  type TripActivityHint,
} from '@/domain/fleetBriefing'
import { loadFleetStatuses } from '@/lib/fleetRadar'
import { loadNetwork } from '@/lib/networkData'
import { listTripsStable, type TripStoreRow } from '@/lib/tripStore'

function tripOperatorName(t: TripStoreRow): string | null {
  const selected = t.offers.find((o) => o.state === 'selected')
  if (selected?.operator_name) return selected.operator_name
  if (t.quick?.operator_name) return t.quick.operator_name
  return null
}

function tripOperatorId(t: TripStoreRow): string | null {
  const selected = t.offers.find((o) => o.state === 'selected')
  return selected?.operator_id ?? null
}

/** Last flight-related timestamp per operator from trip spine. */
export function tripActivityHints(trips: TripStoreRow[]): TripActivityHint[] {
  const best = new Map<string, TripActivityHint>()
  for (const t of trips) {
    const name = tripOperatorName(t)
    if (!name) continue
    const id = tripOperatorId(t)
    const key = id ?? name.toLowerCase()
    const times: string[] = []
    for (const leg of t.legs) {
      if (leg.actual_end) times.push(leg.actual_end)
      if (leg.actual_start) times.push(leg.actual_start)
    }
    for (const e of t.events) {
      if (
        e.kind.includes('wheels') ||
        e.kind.includes('in_progress') ||
        e.kind === 'state_change' ||
        e.kind === 'one_tap'
      ) {
        times.push(e.at)
      }
    }
    if (
      t.state === 'in_progress' ||
      t.state === 'delivered' ||
      t.state === 'booked'
    ) {
      const latestEvent = t.events.at(-1)?.at
      if (latestEvent) times.push(latestEvent)
    }
    if (!times.length) continue
    const lastAt = times.sort().at(-1)!
    const prev = best.get(key)
    if (!prev || lastAt > prev.lastAt) {
      best.set(key, {
        operator_id: id,
        operator_name: name,
        lastAt,
      })
    }
  }
  return [...best.values()]
}

export type FleetBriefingBundle = {
  idleOperators: IdleOperatorRow[]
  nationalWx: NationalWxSummary
  flyingTrips: FlyingTripRow[]
  fetchedAt: string
  adsbPending: boolean
}

export async function loadFleetBriefing(): Promise<FleetBriefingBundle> {
  const net = await loadNetwork()
  const statuses = await loadFleetStatuses()
  const trips = listTripsStable()
  const hints = tripActivityHints(trips)

  const idleOperators = idleTopOperators({
    operators: net.operators.map((o) => ({
      id: o.id,
      name: o.name,
      aircraft_count: o.aircraft_count,
      base_icao: o.base_icao,
    })),
    tails: statuses.map((s) => ({
      operator_id: null,
      operator_name: s.operator_name ?? '',
      phase: s.phase,
      lastTakeoffAt: s.lastTakeoffAt,
      lastLandingAt: s.lastLandingAt,
      seenAt: s.seenAt,
    })),
    tripHints: hints,
  })

  const wx = createWxAdapter()
  const briefs = await Promise.all(
    NATIONAL_WX_HUBS.map(async (h) => {
      const b = await wx.brief(h.icao)
      return {
        icao: h.icao,
        region: h.region,
        flightCat: b.flightCat,
        tafWorstCat: b.tafWorstCat,
        hardFlags: b.hardFlags,
      }
    }),
  )
  const nationalWx = summarizeNationalWx(briefs)

  const flyingTrips = tripsCurrentlyFlying(
    trips.map((t) => ({
      id: t.id,
      ref: t.ref,
      lane: t.lane,
      state: t.state,
      operator_name: tripOperatorName(t),
      legs: t.legs.map((l) => ({
        status: l.status,
        type: l.type,
        label: l.label,
        actual_start: l.actual_start,
        actual_end: l.actual_end,
      })),
    })),
  )

  return {
    idleOperators,
    nationalWx,
    flyingTrips,
    fetchedAt: new Date().toISOString(),
    adsbPending: statuses.every(
      (s) => s.phase === 'no_data' || s.laddBlocked,
    ),
  }
}
