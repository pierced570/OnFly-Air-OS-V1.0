/**
 * Map FlightAware / ADS-B takeoff & landing stamps onto the trip ETA chain.
 * Pure TS — no React / Supabase. Only high-confidence *actual* off/on times
 * become chain actuals (estimates stay display-only).
 */

import type { AdsbPosition } from '@/adapters/adsb'
import type { ActualUpdate, ChainLeg } from '@/domain/etaChain'

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

  const routeOk =
    (!faOrigin && !faDest) ||
    (icaoMatch(faOrigin, airFrom) && icaoMatch(faDest, airTo)) ||
    (icaoMatch(faOrigin, airFrom) && !faDest) ||
    (icaoMatch(faDest, airTo) && !faOrigin) ||
    // Positioning flight into the live-leg origin (e.g. land KCAK before takeoff).
    icaoMatch(faDest, airFrom)

  if (!routeOk) return empty

  const useOff =
    adsb.takeoffIsActual === true ? (adsb.lastTakeoffAt ?? null) : null
  const useOn =
    adsb.landingIsActual === true ? (adsb.lastLandingAt ?? null) : null

  if (!useOff && !useOn) return empty

  let originArrivalAt: string | null = null
  let destLandingAt: string | null = null
  const takeoff = useOff

  if (useOn) {
    const onMs = parseIso(useOn)!
    const offMs = parseIso(takeoff)
    if (offMs != null && onMs >= offMs) {
      destLandingAt = useOn
    } else if (
      icaoMatch(faDest, airFrom) ||
      (!faDest && !faOrigin && (offMs == null || onMs <= offMs))
    ) {
      originArrivalAt = useOn
    } else if (icaoMatch(faDest, airTo)) {
      destLandingAt = useOn
    } else if (offMs == null) {
      originArrivalAt = useOn
    } else {
      destLandingAt = useOn
    }
  }

  const nowIso = opts.nowIso ?? new Date().toISOString()
  const airTimeMin = minutesBetween(takeoff, destLandingAt)
  const groundTimeDestMin = destLandingAt
    ? minutesBetween(destLandingAt, nowIso)
    : null

  return {
    originArrivalAt,
    takeoffAt: takeoff,
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
