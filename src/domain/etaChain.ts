/**
 * ONE ETA chain engine — trip spine source of truth.
 * Merge rule at origin FBO; all writes go through recompute.
 * Pure TS; drive times via MapsAdapter.
 */

import { DateTime } from 'luxon'
import type { MapsAdapter, LatLon } from '@/adapters/maps'
import { haversineNm } from '@/domain/geo'

/** Source tag on every duration / timestamp cell. */
export type EtaSource = 'assumed' | 'quoted' | 'manual' | 'actual'

/** Four service patterns (blueprint M9 auto-detect). */
export type ServicePattern = 'D2D' | 'D2A' | 'A2D' | 'A2A'

/** Dispatcher-editable defaults (minutes). */
export type EtaDefaults = {
  driver_ttp: number
  driver_load: number
  driver_unload: number
  fbo_transfer: number
  acft_ttp: number
  acft_turn: number
  taxi_pad: number
  slip_threshold: number
}

export const BUILTIN_ETA_DEFAULTS: EtaDefaults = {
  driver_ttp: 30,
  driver_load: 30,
  driver_unload: 30,
  fbo_transfer: 30,
  acft_ttp: 120,
  acft_turn: 60,
  taxi_pad: 12,
  slip_threshold: 15,
}

/** @deprecated use EtaDefaults / BUILTIN_ETA_DEFAULTS */
export type LegDefaults = {
  truckLoadMin: number
  truckTransferMin: number
  aircraftTurnaroundMin: number
  truckUnloadMin: number
  taxiAllowMin: number
  slipThresholdMin: number
}

/** @deprecated */
export const DEFAULT_LEG_DEFAULTS: LegDefaults = {
  truckLoadMin: BUILTIN_ETA_DEFAULTS.driver_load,
  truckTransferMin: BUILTIN_ETA_DEFAULTS.fbo_transfer,
  aircraftTurnaroundMin: BUILTIN_ETA_DEFAULTS.acft_turn,
  truckUnloadMin: BUILTIN_ETA_DEFAULTS.driver_unload,
  taxiAllowMin: BUILTIN_ETA_DEFAULTS.taxi_pad,
  slipThresholdMin: BUILTIN_ETA_DEFAULTS.slip_threshold,
}

export function legDefaultsToEta(d: LegDefaults): EtaDefaults {
  return {
    driver_ttp: BUILTIN_ETA_DEFAULTS.driver_ttp,
    driver_load: d.truckLoadMin,
    driver_unload: d.truckUnloadMin,
    fbo_transfer: d.truckTransferMin,
    acft_ttp: BUILTIN_ETA_DEFAULTS.acft_ttp,
    acft_turn: d.aircraftTurnaroundMin,
    taxi_pad: d.taxiAllowMin,
    slip_threshold: d.slipThresholdMin,
  }
}

export type DurationKey =
  | 'driver_ttp'
  | 'driver_load'
  | 'driver_unload'
  | 'fbo_transfer'
  | 'acft_ttp'
  | 'acft_turn'
  | 'drive_time'
  | 'air_time'
  | 'merge_wait'

export type ChainLegType =
  | 'truck_pickup'
  | 'position'
  | 'air_leg'
  | 'truck_delivery'
  | 'ground_stop'
  | 'offload'

export type Place = LatLon & { icao?: string; tz?: string; label?: string }

export type ChainLeg = {
  seq: number
  type: ChainLegType
  branch: 'truck' | 'air' | 'merged'
  label: string
  /** Sheet event name (Dispatch, At Shipper, Wheels Up, …). */
  event: string
  from: Place
  to: Place
  est_start: string
  est_end: string
  actual_start?: string | null
  actual_end?: string | null
  duration_min: number
  duration_key?: DurationKey
  /** Source of the duration assumption (or actual). */
  source: EtaSource
  /** @deprecated prefer source */
  duration_source: string
  distance_mi?: number | null
  distance_nm?: number | null
  /** Minutes early(+)/late(−) vs promised delivery at this node. */
  slack_min?: number | null
}

export type TripChainMeta = {
  pattern: ServicePattern
  promised_delivery_utc: string | null
  defaults_snapshot: EtaDefaults
}

export type TripEtaChain = {
  meta: TripChainMeta
  legs: ChainLeg[]
}

export type RoutingForChain = {
  originAirport: Place & { icao: string; tz: string }
  destAirport: Place & { icao: string; tz: string }
  aircraftBase: Place
  cruiseKts: number
  shipper?: Place
  consignee?: Place
  readyAtUtc: string
  /** Legacy modes map onto ServicePattern. */
  mode: 'a2a' | 'd2d' | 'mixed' | ServicePattern
  /** Override aircraft TTP minutes (quoted). */
  acftTtpMin?: number
  acftTtpSource?: EtaSource
  intermediateStops?: Array<Place & { icao: string; tz: string }>
}

export function detectServicePattern(input: {
  shipper?: Place | null
  consignee?: Place | null
  originAirport?: Place | null
  destAirport?: Place | null
  mode?: RoutingForChain['mode']
}): ServicePattern {
  if (
    input.mode === 'D2D' ||
    input.mode === 'D2A' ||
    input.mode === 'A2D' ||
    input.mode === 'A2A'
  ) {
    return input.mode
  }
  if (input.mode === 'a2a') return 'A2A'
  if (input.mode === 'd2d') return 'D2D'
  const doorOrigin = Boolean(input.shipper)
  const doorDest = Boolean(input.consignee)
  if (doorOrigin && doorDest) return 'D2D'
  if (doorOrigin && !doorDest) return 'D2A'
  if (!doorOrigin && doorDest) return 'A2D'
  return 'A2A'
}

function addMin(iso: string, min: number): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).plus({ minutes: min }).toUTC().toISO()!
}

function maxIso(a: string, b: string): string {
  const am = DateTime.fromISO(a, { zone: 'utc' }).toMillis()
  const bm = DateTime.fromISO(b, { zone: 'utc' }).toMillis()
  return am >= bm ? a : b
}

function flightMinutes(
  from: LatLon,
  to: LatLon,
  cruiseKts: number,
  taxiPad: number,
): { min: number; nm: number } {
  const nm = haversineNm(from.lat, from.lon, to.lat, to.lon)
  const cruise = cruiseKts > 0 ? cruiseKts : 200
  return { min: Math.round((nm / cruise) * 60) + taxiPad, nm: Math.round(nm * 10) / 10 }
}

function pushLeg(
  legs: ChainLeg[],
  partial: Omit<ChainLeg, 'seq' | 'duration_source'> & { duration_source?: string },
): ChainLeg {
  const leg: ChainLeg = {
    ...partial,
    seq: legs.length + 1,
    duration_source: partial.duration_source ?? partial.source,
  }
  legs.push(leg)
  return leg
}

function patternHasOriginTruck(p: ServicePattern): boolean {
  return p === 'D2D' || p === 'D2A'
}

function patternHasDestTruck(p: ServicePattern): boolean {
  return p === 'D2D' || p === 'A2D'
}

/**
 * Build the trip ETA chain. Truck + air run in parallel and MERGE at origin FBO.
 */
export async function buildTripChain(
  routing: RoutingForChain,
  maps: MapsAdapter,
  defaults: EtaDefaults = BUILTIN_ETA_DEFAULTS,
): Promise<TripEtaChain> {
  const pattern = detectServicePattern(routing)
  const legs: ChainLeg[] = []
  const ready = routing.readyAtUtc
  const origin = routing.originAirport
  const dest = routing.destAirport

  // ── TRUCK origin branch ────────────────────────────────────
  let truckFreightAirside = ready
  if (patternHasOriginTruck(pattern) && routing.shipper) {
    const shipper = routing.shipper
    const atShipper = addMin(ready, defaults.driver_ttp)
    pushLeg(legs, {
      type: 'truck_pickup',
      branch: 'truck',
      label: 'Driver to shipper',
      event: 'At Shipper',
      from: shipper,
      to: shipper,
      est_start: ready,
      est_end: atShipper,
      duration_min: defaults.driver_ttp,
      duration_key: 'driver_ttp',
      source: 'assumed',
    })
    // Dispatch is implied as est_start of first leg; sheet shows it as event 0 via helper

    const loaded = addMin(atShipper, defaults.driver_load)
    pushLeg(legs, {
      type: 'truck_pickup',
      branch: 'truck',
      label: 'Load at shipper',
      event: 'Loaded',
      from: shipper,
      to: shipper,
      est_start: atShipper,
      est_end: loaded,
      duration_min: defaults.driver_load,
      duration_key: 'driver_load',
      source: 'assumed',
    })

    const driveMin = await maps.driveMinutes(shipper, origin)
    const driveMi = await maps.driveMiles(shipper, origin)
    const atFbo = addMin(loaded, driveMin)
    pushLeg(legs, {
      type: 'truck_pickup',
      branch: 'truck',
      label: 'Drive shipper → origin FBO',
      event: 'At FBO',
      from: shipper,
      to: origin,
      est_start: loaded,
      est_end: atFbo,
      duration_min: driveMin,
      duration_key: 'drive_time',
      source: 'assumed',
      distance_mi: Math.round(driveMi * 10) / 10,
    })

    const airside = addMin(atFbo, defaults.fbo_transfer)
    pushLeg(legs, {
      type: 'offload',
      branch: 'truck',
      label: 'Transfer at origin FBO',
      event: 'Freight Airside',
      from: origin,
      to: origin,
      est_start: atFbo,
      est_end: airside,
      duration_min: defaults.fbo_transfer,
      duration_key: 'fbo_transfer',
      source: 'assumed',
    })
    truckFreightAirside = airside
  }

  // ── AIRCRAFT position branch ───────────────────────────────
  // Blueprint: position = base → origin flight time (NM ÷ cruise + taxi).
  // Flat defaults.acft_ttp is only the callout assumption when already at
  // origin, or when an operator quote overrides via acftTtpMin.
  const posFlight = flightMinutes(
    routing.aircraftBase,
    origin,
    routing.cruiseKts,
    defaults.taxi_pad,
  )
  let ttpMin: number
  let ttpSource: EtaSource
  if (routing.acftTtpMin != null) {
    ttpMin = routing.acftTtpMin
    ttpSource = routing.acftTtpSource ?? 'quoted'
  } else if (posFlight.nm < 5) {
    // Based at / next to origin — use dispatcher callout default, not taxi-only.
    ttpMin = defaults.acft_ttp
    ttpSource = routing.acftTtpSource ?? 'assumed'
  } else {
    ttpMin = posFlight.min
    ttpSource = routing.acftTtpSource ?? 'assumed'
  }
  const inPosition = addMin(ready, ttpMin)
  pushLeg(legs, {
    type: 'position',
    branch: 'air',
    label: 'Aircraft time-to-position',
    event: 'In Position',
    from: routing.aircraftBase,
    to: origin,
    est_start: ready,
    est_end: inPosition,
    duration_min: ttpMin,
    duration_key: 'acft_ttp',
    source: ttpSource,
    distance_nm: posFlight.nm,
  })

  const airReady = addMin(inPosition, defaults.acft_turn)
  pushLeg(legs, {
    type: 'ground_stop',
    branch: 'air',
    label: 'Turnaround at origin',
    event: 'Ready Wheels Up',
    from: origin,
    to: origin,
    est_start: inPosition,
    est_end: airReady,
    duration_min: defaults.acft_turn,
    duration_key: 'acft_turn',
    source: 'assumed',
  })

  // ── MERGE ──────────────────────────────────────────────────
  const wheelsUp = maxIso(truckFreightAirside, airReady)
  const mergeWait = Math.round(
    DateTime.fromISO(wheelsUp, { zone: 'utc' }).diff(
      DateTime.fromISO(maxIso(truckFreightAirside, airReady) === wheelsUp
        ? (truckFreightAirside === wheelsUp ? airReady : truckFreightAirside)
        : ready),
      'minutes',
    ).minutes,
  )
  // mergeWait unused for display duration; wheels-up is a zero-duration merge marker via air_leg start

  const stops = [origin, ...(routing.intermediateStops ?? []), dest]
  let cursor = wheelsUp
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]!
    const to = stops[i + 1]!
    const { min: airMin, nm } = flightMinutes(from, to, routing.cruiseKts, defaults.taxi_pad)
    const landAt = addMin(cursor, airMin)
    const isLast = i === stops.length - 2
    pushLeg(legs, {
      type: 'air_leg',
      branch: 'merged',
      label: isLast ? 'Live air leg' : `Air leg ${i + 1}`,
      event: i === 0 ? 'Wheels Up → Wheels Down' : `Wheels Up → Down (stop ${i + 1})`,
      from,
      to,
      est_start: cursor,
      est_end: landAt,
      duration_min: airMin,
      duration_key: 'air_time',
      source: 'assumed',
      distance_nm: nm,
    })
    cursor = landAt
    if (!isLast) {
      const turned = addMin(cursor, defaults.acft_turn)
      pushLeg(legs, {
        type: 'ground_stop',
        branch: 'merged',
        label: `Turnaround ${to.icao ?? ''}`,
        event: 'Turnaround',
        from: to,
        to,
        est_start: cursor,
        est_end: turned,
        duration_min: defaults.acft_turn,
        duration_key: 'acft_turn',
        source: 'assumed',
      })
      cursor = turned
    }
  }

  let deliveryEnd = cursor
  if (patternHasDestTruck(pattern) && routing.consignee) {
    const consignee = routing.consignee
    const xferEnd = addMin(cursor, defaults.fbo_transfer)
    pushLeg(legs, {
      type: 'offload',
      branch: 'merged',
      label: 'Transfer at dest FBO',
      event: 'Freight Roadside',
      from: dest,
      to: dest,
      est_start: cursor,
      est_end: xferEnd,
      duration_min: defaults.fbo_transfer,
      duration_key: 'fbo_transfer',
      source: 'assumed',
    })
    const driveMin = await maps.driveMinutes(dest, consignee)
    const driveMi = await maps.driveMiles(dest, consignee)
    const atConsignee = addMin(xferEnd, driveMin)
    pushLeg(legs, {
      type: 'truck_delivery',
      branch: 'merged',
      label: 'Drive dest FBO → consignee',
      event: 'At Consignee',
      from: dest,
      to: consignee,
      est_start: xferEnd,
      est_end: atConsignee,
      duration_min: driveMin,
      duration_key: 'drive_time',
      source: 'assumed',
      distance_mi: Math.round(driveMi * 10) / 10,
    })
    const unloaded = addMin(atConsignee, defaults.driver_unload)
    pushLeg(legs, {
      type: 'truck_delivery',
      branch: 'merged',
      label: 'Unload at consignee',
      event: 'Delivered',
      from: consignee,
      to: consignee,
      est_start: atConsignee,
      est_end: unloaded,
      duration_min: defaults.driver_unload,
      duration_key: 'driver_unload',
      source: 'assumed',
    })
    deliveryEnd = unloaded
  }

  const withSlack = annotateSlack(legs, deliveryEnd)
  void mergeWait

  return {
    meta: {
      pattern,
      promised_delivery_utc: deliveryEnd,
      defaults_snapshot: { ...defaults },
    },
    legs: withSlack,
  }
}

/** Annotate each leg's end slack vs promised delivery (positive = early buffer). */
export function annotateSlack(legs: ChainLeg[], promisedUtc: string): ChainLeg[] {
  const promised = DateTime.fromISO(promisedUtc, { zone: 'utc' })
  return legs.map((l) => {
    const end = DateTime.fromISO(l.est_end, { zone: 'utc' })
    return {
      ...l,
      slack_min: Math.round(promised.diff(end, 'minutes').minutes),
    }
  })
}

/** Legacy entry — returns legs only (routing / candidates). */
export async function buildChain(
  routing: RoutingForChain,
  maps: MapsAdapter,
  defaults: LegDefaults | EtaDefaults = BUILTIN_ETA_DEFAULTS,
): Promise<ChainLeg[]> {
  const eta =
    'driver_ttp' in defaults
      ? (defaults as EtaDefaults)
      : legDefaultsToEta(defaults as LegDefaults)
  const built = await buildTripChain(routing, maps, eta)
  return built.legs
}

export type ActualUpdate = {
  seq: number
  actual_start?: string
  actual_end?: string
}

/**
 * Cascade recompute from a slipped/actualized node through merge math downstream.
 * Prefer applyActual / editDuration / applyQuotedTtp helpers which call this.
 */
export function recompute(
  chain: ChainLeg[],
  update: ActualUpdate,
  _defaults: LegDefaults | EtaDefaults = BUILTIN_ETA_DEFAULTS,
): { chain: ChainLeg[]; slippedMinutes: number } {
  const next = chain.map((l) => ({ ...l }))
  const idx = next.findIndex((l) => l.seq === update.seq)
  if (idx < 0) return { chain: next, slippedMinutes: 0 }

  const leg = next[idx]!
  if (update.actual_start) {
    leg.actual_start = update.actual_start
    leg.source = 'actual'
    leg.duration_source = 'actual'
  }
  if (update.actual_end) {
    leg.actual_end = update.actual_end
    leg.source = 'actual'
    leg.duration_source = 'actual'
  }

  const anchorEnd = leg.actual_end ?? leg.est_end
  const slipped = DateTime.fromISO(anchorEnd, { zone: 'utc' }).diff(
    DateTime.fromISO(leg.est_end, { zone: 'utc' }),
    'minutes',
  ).minutes

  if (update.actual_start && !update.actual_end) {
    const slipStart = DateTime.fromISO(update.actual_start, { zone: 'utc' }).diff(
      DateTime.fromISO(leg.est_start, { zone: 'utc' }),
      'minutes',
    ).minutes
    const dur = leg.duration_min
    leg.est_start = update.actual_start
    leg.est_end = addMin(update.actual_start, dur)
    shiftDownstream(next, idx, slipStart)
    const promised = next[next.length - 1]?.est_end ?? leg.est_end
    return {
      chain: annotateSlack(remergeFromOrigin(next), promised),
      slippedMinutes: Math.round(slipStart),
    }
  }

  if (Math.abs(slipped) >= 0.5) {
    leg.est_end = anchorEnd
    if (leg.actual_end && leg.actual_start) {
      leg.duration_min = Math.max(
        0,
        Math.round(
          DateTime.fromISO(leg.actual_end, { zone: 'utc' }).diff(
            DateTime.fromISO(leg.actual_start, { zone: 'utc' }),
            'minutes',
          ).minutes,
        ),
      )
    }
    shiftDownstream(next, idx, slipped)
  }

  const remixed = remergeFromOrigin(next)
  const promised = remixed[remixed.length - 1]?.est_end ?? anchorEnd
  return {
    chain: annotateSlack(remixed, promised),
    slippedMinutes: Math.round(slipped),
  }
}

function shiftDownstream(chain: ChainLeg[], fromIdx: number, slipMin: number): void {
  if (Math.abs(slipMin) < 0.5) return
  for (let i = fromIdx + 1; i < chain.length; i++) {
    const l = chain[i]!
    // Never silently overwrite a manual duration's absolute times beyond slip —
    // we still shift EST; source stays. Manual duration_min is preserved.
    if (l.source === 'actual' && l.actual_end) continue
    l.est_start = addMin(l.est_start, slipMin)
    l.est_end = addMin(l.est_end, slipMin)
  }
}

/**
 * Re-apply origin merge: wheels-up of first air_leg = max(last truck-branch end, last air-branch ground_stop end before merge).
 * An actual wheels-up locks the merge node.
 */
function remergeFromOrigin(chain: ChainLeg[]): ChainLeg[] {
  const next = chain.map((l) => ({ ...l }))
  const firstAir = next.findIndex((l) => l.type === 'air_leg' && l.branch === 'merged')
  if (firstAir < 0) return next

  let truckReady: string | null = null
  let airReady: string | null = null
  for (let i = 0; i < firstAir; i++) {
    const l = next[i]!
    if (l.branch === 'truck') {
      truckReady = l.actual_end ?? l.est_end
    }
    if (l.branch === 'air') {
      airReady = l.actual_end ?? l.est_end
    }
  }
  if (!airReady) return next

  const airLeg = next[firstAir]!
  // Actual wheels-up is authoritative — never pull earlier via merge math
  const wheelsUp = airLeg.actual_start
    ? airLeg.actual_start
    : truckReady
      ? maxIso(truckReady, airReady)
      : airReady
  const oldStart = airLeg.est_start
  const slip = DateTime.fromISO(wheelsUp, { zone: 'utc' }).diff(
    DateTime.fromISO(oldStart, { zone: 'utc' }),
    'minutes',
  ).minutes
  if (Math.abs(slip) < 0.5) return next

  airLeg.est_start = wheelsUp
  airLeg.est_end = addMin(wheelsUp, airLeg.duration_min)
  for (let i = firstAir + 1; i < next.length; i++) {
    const l = next[i]!
    if (l.source === 'actual' && l.actual_end) continue
    l.est_start = addMin(l.est_start, slip)
    l.est_end = addMin(l.est_end, slip)
  }
  return next
}

/**
 * Operator quote TTP → write acft_ttp with source=quoted → recompute.
 * Does not overwrite manual acft_ttp unless force.
 */
export function applyQuotedTtp(
  chain: ChainLeg[],
  ttpMin: number,
  opts?: { force?: boolean },
): { chain: ChainLeg[]; slippedMinutes: number } {
  const next = chain.map((l) => ({ ...l }))
  const pos = next.find((l) => l.duration_key === 'acft_ttp' || l.type === 'position')
  if (!pos) return { chain: next, slippedMinutes: 0 }
  if (pos.source === 'manual' && !opts?.force) {
    return { chain: next, slippedMinutes: 0 }
  }
  if (pos.source === 'actual' && !opts?.force) {
    return { chain: next, slippedMinutes: 0 }
  }
  const oldEnd = pos.est_end
  pos.duration_min = ttpMin
  pos.source = 'quoted'
  pos.duration_source = 'quoted'
  pos.est_end = addMin(pos.est_start, ttpMin)
  const slip = DateTime.fromISO(pos.est_end, { zone: 'utc' }).diff(
    DateTime.fromISO(oldEnd, { zone: 'utc' }),
    'minutes',
  ).minutes
  const idx = next.findIndex((l) => l.seq === pos.seq)
  shiftDownstream(next, idx, slip)
  const remixed = remergeFromOrigin(next)
  const promised = remixed[remixed.length - 1]?.est_end ?? pos.est_end
  return {
    chain: annotateSlack(remixed, promised),
    slippedMinutes: Math.round(slip),
  }
}

/**
 * Dispatcher edits an assumption duration. Manual wins over assumed/quoted.
 * Never overwrites actual. Instant recompute.
 */
export function editDuration(
  chain: ChainLeg[],
  seq: number,
  durationMin: number,
  source: EtaSource = 'manual',
  opts?: { allowReset?: boolean },
): { chain: ChainLeg[]; slippedMinutes: number } {
  const next = chain.map((l) => ({ ...l }))
  const idx = next.findIndex((l) => l.seq === seq)
  if (idx < 0) return { chain: next, slippedMinutes: 0 }
  const leg = next[idx]!
  if (leg.source === 'actual') return { chain: next, slippedMinutes: 0 }
  // Manual edits stick until an explicit reset-to-default.
  if (leg.source === 'manual' && source === 'assumed' && !opts?.allowReset) {
    return { chain: next, slippedMinutes: 0 }
  }
  const oldEnd = leg.est_end
  leg.duration_min = durationMin
  leg.source = source
  leg.duration_source = source
  leg.est_end = addMin(leg.est_start, durationMin)
  const slip = DateTime.fromISO(leg.est_end, { zone: 'utc' }).diff(
    DateTime.fromISO(oldEnd, { zone: 'utc' }),
    'minutes',
  ).minutes
  shiftDownstream(next, idx, slip)
  const remixed = remergeFromOrigin(next)
  const promised = remixed[remixed.length - 1]?.est_end ?? leg.est_end
  return {
    chain: annotateSlack(remixed, promised),
    slippedMinutes: Math.round(slip),
  }
}

/** Reset one assumption cell to a default key value (source → assumed). */
export function resetDurationToDefault(
  chain: ChainLeg[],
  seq: number,
  defaults: EtaDefaults,
): { chain: ChainLeg[]; slippedMinutes: number } {
  const leg = chain.find((l) => l.seq === seq)
  if (!leg?.duration_key) return { chain, slippedMinutes: 0 }
  const key = leg.duration_key
  if (key === 'drive_time' || key === 'air_time' || key === 'merge_wait') {
    return { chain, slippedMinutes: 0 }
  }
  const val = defaults[key]
  return editDuration(chain, seq, val, 'assumed', { allowReset: true })
}

export function applyActual(
  chain: ChainLeg[],
  update: ActualUpdate,
): { chain: ChainLeg[]; slippedMinutes: number } {
  return recompute(chain, update, BUILTIN_ETA_DEFAULTS)
}

export type MileageBlock = {
  segments: Array<{
    seq: number
    label: string
    kind: 'truck' | 'air'
    distance: number
    unit: 'mi' | 'nm'
    duration_min: number
  }>
  total_truck_mi: number
  total_air_nm: number
  total_elapsed_min: number
}

export function mileageBlock(chain: ChainLeg[]): MileageBlock {
  const segments: MileageBlock['segments'] = []
  let total_truck_mi = 0
  let total_air_nm = 0
  for (const l of chain) {
    if (l.distance_mi != null && l.distance_mi > 0) {
      segments.push({
        seq: l.seq,
        label: l.label,
        kind: 'truck',
        distance: l.distance_mi,
        unit: 'mi',
        duration_min: l.duration_min,
      })
      total_truck_mi += l.distance_mi
    }
    if (l.distance_nm != null && l.distance_nm > 0) {
      segments.push({
        seq: l.seq,
        label: l.label,
        kind: 'air',
        distance: l.distance_nm,
        unit: 'nm',
        duration_min: l.duration_min,
      })
      total_air_nm += l.distance_nm
    }
  }
  const first = chain[0]
  const last = chain[chain.length - 1]
  const total_elapsed_min =
    first && last
      ? Math.round(
          DateTime.fromISO(last.est_end, { zone: 'utc' }).diff(
            DateTime.fromISO(first.est_start, { zone: 'utc' }),
            'minutes',
          ).minutes,
        )
      : 0
  return {
    segments,
    total_truck_mi: Math.round(total_truck_mi * 10) / 10,
    total_air_nm: Math.round(total_air_nm * 10) / 10,
    total_elapsed_min,
  }
}

/** Deep-copy chain onto a trip (book/accept). */
export function copyChainToTrip(chain: ChainLeg[]): ChainLeg[] {
  return chain.map((l) => ({
    ...l,
    from: { ...l.from },
    to: { ...l.to },
  }))
}

export function projectedDeliveryUtc(chain: ChainLeg[]): string | null {
  return chain[chain.length - 1]?.est_end ?? null
}

export function deliveryDeltaMin(
  projectedUtc: string | null,
  promisedUtc: string | null,
): number | null {
  if (!projectedUtc || !promisedUtc) return null
  return Math.round(
    DateTime.fromISO(projectedUtc, { zone: 'utc' }).diff(
      DateTime.fromISO(promisedUtc, { zone: 'utc' }),
      'minutes',
    ).minutes,
  )
}

export { defaultsSlipThreshold }
function defaultsSlipThreshold(d: LegDefaults | EtaDefaults = BUILTIN_ETA_DEFAULTS) {
  if ('slip_threshold' in d) return d.slip_threshold
  return (d as LegDefaults).slipThresholdMin
}
