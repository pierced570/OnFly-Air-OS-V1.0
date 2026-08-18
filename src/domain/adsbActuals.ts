/**
 * Map FlightAware / ADS-B takeoff & landing stamps onto the trip ETA chain.
 * Pure TS — no React / Supabase. Only high-confidence *actual* off/on times
 * become chain actuals (estimates stay display-only).
 */

import type { AdsbPosition } from '@/adapters/adsb'
import type { ActualUpdate, ChainLeg } from '@/domain/etaChain'

/** On-ground at dest this long → portal Delivered + trip_transition. */
export const DEST_GROUND_DELIVERED_MIN = 10

export type AdsbActualProposal = {
  /** Wheels-down at origin before the live leg (e.g. landed KCAK). */
  originArrivalAt: string | null
  /** Wheels-up for the live leg. */
  takeoffAt: string | null
  /** Wheels-down at destination. */
  destLandingAt: string | null
  originIcao: string | null
  destIcao: string | null
  /** Actual air time minutes when takeoff + landing known. */
  airTimeMin: number | null
  /** Minutes on ground at dest since landing. */
  groundTimeDestMin: number | null
  /** True when proposal used ADS-B actual_off / actual_on (not estimates). */
  fromActuals: boolean
}

export function destDwellComplete(
  landingAt: string | null | undefined,
  nowIso: string,
  min = DEST_GROUND_DELIVERED_MIN,
): boolean {
  const dwell = minutesBetween(landingAt ?? null, nowIso)
  return dwell != null && dwell >= min
}

export function normalizeIcao(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

/** Match KCAK ↔ CAK, etc. */
export function icaoMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = normalizeIcao(a)
  const y = normalizeIcao(b)
  if (!x || !y) return false
  if (x === y) return true
  const sx = x.length === 4 && x.startsWith('K') ? x.slice(1) : x
  const sy = y.length === 4 && y.startsWith('K') ? y.slice(1) : y
  return sx.length >= 3 && sx === sy
}

function parseIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function minutesBetween(a: string | null, b: string | null): number | null {
  const x = parseIso(a)
  const y = parseIso(b)
  if (x == null || y == null) return null
  return Math.max(0, Math.round((y - x) / 60_000))
}

/**
 * Derive client-facing ADS-B actuals for an air leg origin→dest.
 * Requires takeoffIsActual / landingIsActual === true (FlightAware actual_off/on).
 */
export function proposeAdsbActuals(opts: {
  adsb: AdsbPosition | null | undefined
  airFromIcao?: string | null
  airToIcao?: string | null
  nowIso?: string
}): AdsbActualProposal {
  const empty: AdsbActualProposal = {
    originArrivalAt: null,
    takeoffAt: null,
    destLandingAt: null,
    originIcao: normalizeIcao(opts.airFromIcao) || null,
    destIcao: normalizeIcao(opts.airToIcao) || null,
    airTimeMin: null,
    groundTimeDestMin: null,
    fromActuals: false,
  }
  const adsb = opts.adsb
  if (!adsb) return empty
  // Allow actual_off/on even when position is blocked / no_data (LADD).
  if (
    adsb.phase === 'no_data' &&
    adsb.takeoffIsActual !== true &&
    adsb.landingIsActual !== true
  ) {
    return empty
  }

  const airFrom = opts.airFromIcao
  const airTo = opts.airToIcao
  const faOrigin = adsb.originIcao ?? null
  const faDest = adsb.destinationIcao ?? null
  const airborne = adsb.phase === 'airborne'
  const onGround = adsb.phase === 'on_ground'

  /** Last completed FA flight ended at pickup — not an unrelated airport. */
  const positioningIntoOrigin =
    icaoMatch(faDest, airFrom) && !icaoMatch(faDest, airTo)
  /** Current FA flight is the live origin → dest leg. */
  const liveRoute = icaoMatch(faOrigin, airFrom) && icaoMatch(faDest, airTo)

  const useOff =
    adsb.takeoffIsActual === true ? (adsb.lastTakeoffAt ?? null) : null
  const useOn =
    adsb.landingIsActual === true ? (adsb.lastLandingAt ?? null) : null

  let originArrivalAt: string | null = null
  let destLandingAt: string | null = null
  let takeoffAt: string | null = null

  // Stage 1→2: landing at pickup ICAO (on the ground there). Never treat a
  // positioning takeoff+landing as the dest arrival just because on ≥ off.
  if (positioningIntoOrigin && !airborne && (onGround || Boolean(useOn))) {
    originArrivalAt =
      useOn ??
      (adsb.landingIsActual === true ? adsb.lastLandingAt : null) ??
      adsb.seenAt ??
      null
  }

  // Stage 2→3: wheels-up on the live origin → dest flight only.
  if (useOff && liveRoute && !positioningIntoOrigin) {
    takeoffAt = useOff
  }

  // Stage 3→4: actual wheels-down at dest ICAO on the live origin → dest flight.
  if (
    useOn &&
    !airborne &&
    icaoMatch(faDest, airTo) &&
    (liveRoute || (useOff && icaoMatch(faOrigin, airFrom)))
  ) {
    destLandingAt = useOn
  }

  // No ICAOs on the FA payload — fall back to actual off/on order.
  if (!faOrigin && !faDest && (useOff || useOn)) {
    takeoffAt = useOff
    if (useOn) {
      const onMs = parseIso(useOn)!
      const offMs = parseIso(useOff)
      if (offMs != null && onMs >= offMs) destLandingAt = useOn
      else originArrivalAt = useOn
    }
  }

  if (!originArrivalAt && !takeoffAt && !destLandingAt) return empty

  const nowIso = opts.nowIso ?? new Date().toISOString()
  const airTimeMin = minutesBetween(takeoffAt, destLandingAt)
  const groundTimeDestMin = destLandingAt
    ? minutesBetween(destLandingAt, nowIso)
    : null

  return {
    originArrivalAt,
    takeoffAt,
    destLandingAt,
    originIcao: normalizeIcao(airFrom) || normalizeIcao(faOrigin) || null,
    destIcao: normalizeIcao(airTo) || normalizeIcao(faDest) || null,
    airTimeMin,
    groundTimeDestMin,
    fromActuals: true,
  }
}

/**
 * Build eta_chain ActualUpdates from an ADS-B proposal (skip stamps already set).
 */
export function adsbUpdatesForChain(
  chain: ChainLeg[],
  proposal: AdsbActualProposal,
): ActualUpdate[] {
  if (!proposal.fromActuals) return []
  const air = chain.find((l) => l.type === 'air_leg')
  const position =
    chain.find((l) => l.type === 'position') ??
    chain.find((l) => l.duration_key === 'acft_ttp')
  const updates: ActualUpdate[] = []

  if (proposal.originArrivalAt && position && !position.actual_end) {
    const atOrigin =
      !air ||
      icaoMatch(position.to.icao, proposal.originIcao) ||
      icaoMatch(position.to.icao, air.from.icao)
    if (atOrigin) {
      updates.push({
        seq: position.seq,
        actual_end: proposal.originArrivalAt,
      })
    }
  }

  if (air) {
    const patch: ActualUpdate = { seq: air.seq }
    if (proposal.takeoffAt && !air.actual_start) {
      patch.actual_start = proposal.takeoffAt
    }
    if (proposal.destLandingAt && !air.actual_end) {
      patch.actual_end = proposal.destLandingAt
    }
    if (patch.actual_start || patch.actual_end) updates.push(patch)
  }

  return updates
}
