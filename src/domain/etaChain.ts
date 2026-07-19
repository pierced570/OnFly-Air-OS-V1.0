/**
 * ETA chain builder — merge rule at origin FBO.
 * Pure TS; drive times via MapsAdapter.
 */

import { DateTime } from 'luxon'
import type { MapsAdapter, LatLon } from '@/adapters/maps'
import { haversineNm } from '@/domain/geo'

export type LegDefaults = {
  truckLoadMin: number
  truckTransferMin: number
  aircraftTurnaroundMin: number
  truckUnloadMin: number
  taxiAllowMin: number
  slipThresholdMin: number
}

export const DEFAULT_LEG_DEFAULTS: LegDefaults = {
  truckLoadMin: 30,
  truckTransferMin: 30,
  aircraftTurnaroundMin: 60,
  truckUnloadMin: 30,
  taxiAllowMin: 12,
  slipThresholdMin: 20,
}

export type ChainLegType =
  | 'truck_pickup'
  | 'position'
  | 'air_leg'
  | 'truck_delivery'
  | 'ground_stop'
  | 'offload'

export type ChainLeg = {
  seq: number
  type: ChainLegType
  branch: 'truck' | 'air' | 'merged'
  label: string
  from: LatLon & { icao?: string; tz?: string }
  to: LatLon & { icao?: string; tz?: string }
  est_start: string // UTC ISO
  est_end: string
  actual_start?: string | null
  actual_end?: string | null
  duration_min: number
  duration_source: string
}

export type RoutingForChain = {
  originAirport: LatLon & { icao: string; tz: string }
  destAirport: LatLon & { icao: string; tz: string }
  aircraftBase: LatLon & { icao?: string; tz?: string }
  cruiseKts: number
  shipper?: LatLon & { tz?: string }
  consignee?: LatLon & { tz?: string }
  readyAtUtc: string
  mode: 'a2a' | 'd2d' | 'mixed'
}

function addMin(iso: string, min: number): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).plus({ minutes: min }).toUTC().toISO()!
}

function flightMinutes(
  from: LatLon,
  to: LatLon,
  cruiseKts: number,
  taxiAllowMin: number,
): number {
  const nm = haversineNm(from.lat, from.lon, to.lat, to.lon)
  const cruise = cruiseKts > 0 ? cruiseKts : 200
  return Math.round((nm / cruise) * 60) + taxiAllowMin
}

export async function buildChain(
  routing: RoutingForChain,
  maps: MapsAdapter,
  defaults: LegDefaults = DEFAULT_LEG_DEFAULTS,
): Promise<ChainLeg[]> {
  const legs: ChainLeg[] = []
  let seq = 1
  const ready = routing.readyAtUtc
  const d2d = routing.mode === 'd2d' || routing.mode === 'mixed'

  // --- truck branch ---
  let truckAtOrigin = ready
  if (d2d && routing.shipper) {
    const loadEnd = addMin(ready, defaults.truckLoadMin)
    legs.push({
      seq: seq++,
      type: 'truck_pickup',
      branch: 'truck',
      label: 'Truck load at shipper',
      from: routing.shipper,
      to: routing.shipper,
      est_start: ready,
      est_end: loadEnd,
      duration_min: defaults.truckLoadMin,
      duration_source: 'default',
    })
    const driveMin = await maps.driveMinutes(routing.shipper, routing.originAirport)
    const driveEnd = addMin(loadEnd, driveMin)
    legs.push({
      seq: seq++,
      type: 'truck_pickup',
      branch: 'truck',
      label: 'Drive shipper → origin FBO',
      from: routing.shipper,
      to: routing.originAirport,
      est_start: loadEnd,
      est_end: driveEnd,
      duration_min: driveMin,
      duration_source: 'maps',
    })
    const xferEnd = addMin(driveEnd, defaults.truckTransferMin)
    legs.push({
      seq: seq++,
      type: 'offload',
      branch: 'truck',
      label: 'Transfer at origin FBO',
      from: routing.originAirport,
      to: routing.originAirport,
      est_start: driveEnd,
      est_end: xferEnd,
      duration_min: defaults.truckTransferMin,
      duration_source: 'default',
    })
    truckAtOrigin = xferEnd
  }

  // --- air position branch ---
  const posMin = flightMinutes(
    routing.aircraftBase,
    routing.originAirport,
    routing.cruiseKts,
    defaults.taxiAllowMin,
  )
  const posEnd = addMin(ready, posMin)
  legs.push({
    seq: seq++,
    type: 'position',
    branch: 'air',
    label: 'Position to origin',
    from: routing.aircraftBase,
    to: routing.originAirport,
    est_start: ready,
    est_end: posEnd,
    duration_min: posMin,
    duration_source: 'flight',
  })
  const turnEnd = addMin(posEnd, defaults.aircraftTurnaroundMin)
  legs.push({
    seq: seq++,
    type: 'ground_stop',
    branch: 'air',
    label: 'Turnaround at origin',
    from: routing.originAirport,
    to: routing.originAirport,
    est_start: posEnd,
    est_end: turnEnd,
    duration_min: defaults.aircraftTurnaroundMin,
    duration_source: 'default',
  })

  // --- merge: wheels up ---
  const truckReadyMs = DateTime.fromISO(truckAtOrigin, { zone: 'utc' }).toMillis()
  const airReadyMs = DateTime.fromISO(turnEnd, { zone: 'utc' }).toMillis()
  const wheelsUp = DateTime.fromMillis(Math.max(truckReadyMs, airReadyMs), {
    zone: 'utc',
  }).toISO()!

  const liveMin = flightMinutes(
    routing.originAirport,
    routing.destAirport,
    routing.cruiseKts,
    defaults.taxiAllowMin,
  )
  const landAt = addMin(wheelsUp, liveMin)
  legs.push({
    seq: seq++,
    type: 'air_leg',
    branch: 'merged',
    label: 'Live air leg',
    from: routing.originAirport,
    to: routing.destAirport,
    est_start: wheelsUp,
    est_end: landAt,
    duration_min: liveMin,
    duration_source: 'flight',
  })

  if (d2d && routing.consignee) {
    const xferEnd = addMin(landAt, defaults.truckTransferMin)
    legs.push({
      seq: seq++,
      type: 'offload',
      branch: 'merged',
      label: 'Transfer at dest FBO',
      from: routing.destAirport,
      to: routing.destAirport,
      est_start: landAt,
      est_end: xferEnd,
      duration_min: defaults.truckTransferMin,
      duration_source: 'default',
    })
    const driveMin = await maps.driveMinutes(routing.destAirport, routing.consignee)
    const driveEnd = addMin(xferEnd, driveMin)
    legs.push({
      seq: seq++,
      type: 'truck_delivery',
      branch: 'merged',
      label: 'Drive dest FBO → consignee',
      from: routing.destAirport,
      to: routing.consignee,
      est_start: xferEnd,
      est_end: driveEnd,
      duration_min: driveMin,
      duration_source: 'maps',
    })
    const unloadEnd = addMin(driveEnd, defaults.truckUnloadMin)
    legs.push({
      seq: seq++,
      type: 'truck_delivery',
      branch: 'merged',
      label: 'Unload at consignee',
      from: routing.consignee,
      to: routing.consignee,
      est_start: driveEnd,
      est_end: unloadEnd,
      duration_min: defaults.truckUnloadMin,
      duration_source: 'default',
    })
  }

  return legs
}

export type ActualUpdate = {
  seq: number
  actual_start?: string
  actual_end?: string
}

export function recompute(
  chain: ChainLeg[],
  update: ActualUpdate,
  _defaults: LegDefaults = DEFAULT_LEG_DEFAULTS,
): { chain: ChainLeg[]; slippedMinutes: number } {
  const next = chain.map((l) => ({ ...l }))
  const idx = next.findIndex((l) => l.seq === update.seq)
  if (idx < 0) return { chain: next, slippedMinutes: 0 }

  const leg = next[idx]!
  if (update.actual_start) leg.actual_start = update.actual_start
  if (update.actual_end) leg.actual_end = update.actual_end

  const anchorEnd = leg.actual_end ?? leg.est_end
  const slipped = DateTime.fromISO(anchorEnd, { zone: 'utc' }).diff(
    DateTime.fromISO(leg.est_end, { zone: 'utc' }),
    'minutes',
  ).minutes

  // Shift all subsequent merged/downstream legs by slip
  if (Math.abs(slipped) >= 0.5) {
    for (let i = idx + 1; i < next.length; i++) {
      const l = next[i]!
      l.est_start = addMin(l.est_start, slipped)
      l.est_end = addMin(l.est_end, slipped)
    }
  }

  return {
    chain: next,
    slippedMinutes: Math.round(slipped),
  }
}

export { defaultsSlipThreshold }
function defaultsSlipThreshold(d: LegDefaults = DEFAULT_LEG_DEFAULTS) {
  return d.slipThresholdMin
}
