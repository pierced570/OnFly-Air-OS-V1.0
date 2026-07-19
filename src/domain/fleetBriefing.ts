/**
 * Fleet / shift briefing signals — pure TypeScript.
 * Idle (≥10h) top operators, national WX snapshot, trips out flying.
 */

import type { FlightCategory } from '@/domain/flightCategory'

/** Part 135.267 rest heuristic window (advisory only). */
export const REST_IDLE_HOURS = 10
export const REST_IDLE_MS = REST_IDLE_HOURS * 3600 * 1000

/** CONUS sample hubs for a country-wide WX glance. */
export const NATIONAL_WX_HUBS = [
  { icao: 'KBOS', region: 'Northeast' },
  { icao: 'KJFK', region: 'Northeast' },
  { icao: 'KATL', region: 'Southeast' },
  { icao: 'KMIA', region: 'Southeast' },
  { icao: 'KORD', region: 'Midwest' },
  { icao: 'KDTW', region: 'Midwest' },
  { icao: 'KDFW', region: 'South-Central' },
  { icao: 'KDEN', region: 'Rockies' },
  { icao: 'KPHX', region: 'Southwest' },
  { icao: 'KLAX', region: 'West' },
  { icao: 'KSEA', region: 'Northwest' },
] as const

export type NationalWxHub = (typeof NATIONAL_WX_HUBS)[number]

export type TailActivityInput = {
  operator_id?: string | null
  operator_name: string
  phase: 'airborne' | 'on_ground' | 'no_data'
  lastTakeoffAt: string | null
  lastLandingAt: string | null
  seenAt?: string | null
}

export type TripActivityHint = {
  operator_id?: string | null
  operator_name: string
  /** Last known flight-related activity for this operator (ISO). */
  lastAt: string
}

export type OperatorFleetInput = {
  id: string
  name: string
  aircraft_count: number
  base_icao: string | null
}

export type OperatorIdleStatus =
  | 'flying_now'
  | 'flew_recently'
  | 'idle_10h'
  | 'unknown'

export type IdleOperatorRow = {
  operator_id: string
  operator_name: string
  aircraft_count: number
  base_icao: string | null
  status: OperatorIdleStatus
  /** ms since last known flight activity; null if unknown */
  idle_ms: number | null
  last_flew_at: string | null
  evidence: 'adsb' | 'trip' | 'none'
}

export type NationalWxStation = {
  icao: string
  region: string
  flightCat: FlightCategory | null
  tafWorstCat: FlightCategory | null
  hardFlags: string[]
}

export type NationalWxSummary = {
  headline: string
  counts: Record<FlightCategory | 'unknown', number>
  stations: NationalWxStation[]
  worst: Array<{ icao: string; region: string; cat: FlightCategory }>
}

export type FlyingTripRow = {
  id: string
  ref: number
  lane: string
  state: string
  operator_name: string | null
  active_leg_label: string | null
}

/** Latest flight activity timestamp for one tail (ms), or null. */
export function lastFlewMs(tail: TailActivityInput, nowMs: number): number | null {
  if (tail.phase === 'airborne') {
    const seen = tail.seenAt ? Date.parse(tail.seenAt) : NaN
    return Number.isFinite(seen) ? seen : nowMs
  }
  const times: number[] = []
  for (const iso of [tail.lastLandingAt, tail.lastTakeoffAt]) {
    if (!iso) continue
    const t = Date.parse(iso)
    if (Number.isFinite(t)) times.push(t)
  }
  if (tail.phase === 'on_ground' && tail.seenAt) {
    const t = Date.parse(tail.seenAt)
    if (Number.isFinite(t)) times.push(t)
  }
  if (!times.length) return null
  return Math.max(...times)
}

function matchOperator(
  op: OperatorFleetInput,
  operatorId: string | null | undefined,
  operatorName: string,
): boolean {
  if (operatorId && operatorId === op.id) return true
  return (
    Boolean(operatorName) &&
    operatorName.toLowerCase() === op.name.toLowerCase()
  )
}

/**
 * Top operators by fleet size who have not flown in the last REST_IDLE_HOURS.
 * When ADS-B is dark, trip activity hints fill the gap; else marked unknown
 * but still surfaced as idle candidates (no recent signal).
 */
export function idleTopOperators(opts: {
  operators: OperatorFleetInput[]
  tails: TailActivityInput[]
  tripHints?: TripActivityHint[]
  nowMs?: number
  topN?: number
  /** How many top operators to scan before filtering idle */
  scanN?: number
}): IdleOperatorRow[] {
  const now = opts.nowMs ?? Date.now()
  const scanN = opts.scanN ?? 12
  const topN = opts.topN ?? 8
  const ranked = [...opts.operators]
    .filter((o) => o.aircraft_count > 0)
    .sort(
      (a, b) =>
        b.aircraft_count - a.aircraft_count ||
        a.name.localeCompare(b.name),
    )
    .slice(0, scanN)

  const rows: IdleOperatorRow[] = []

  for (const op of ranked) {
    const opTails = opts.tails.filter((t) =>
      matchOperator(op, t.operator_id, t.operator_name),
    )
    let bestMs: number | null = null
    let evidence: IdleOperatorRow['evidence'] = 'none'
    let flying = false

    for (const t of opTails) {
      if (t.phase === 'airborne') flying = true
      const ms = lastFlewMs(t, now)
      if (ms != null && (bestMs == null || ms > bestMs)) {
        bestMs = ms
        evidence = 'adsb'
      }
    }

    for (const h of opts.tripHints ?? []) {
      if (!matchOperator(op, h.operator_id, h.operator_name)) continue
      const ms = Date.parse(h.lastAt)
      if (!Number.isFinite(ms)) continue
      if (bestMs == null || ms > bestMs) {
        bestMs = ms
        evidence = 'trip'
      }
    }

    let status: OperatorIdleStatus
    let idle_ms: number | null = null
    if (flying) {
      status = 'flying_now'
      idle_ms = 0
    } else if (bestMs == null) {
      status = 'unknown'
      idle_ms = null
    } else {
      idle_ms = Math.max(0, now - bestMs)
      status = idle_ms >= REST_IDLE_MS ? 'idle_10h' : 'flew_recently'
    }

    // Surface idle + unknown (no signal ≈ treat as available for brief)
    if (status !== 'idle_10h' && status !== 'unknown') continue

    rows.push({
      operator_id: op.id,
      operator_name: op.name,
      aircraft_count: op.aircraft_count,
      base_icao: op.base_icao,
      status,
      idle_ms,
      last_flew_at: bestMs != null ? new Date(bestMs).toISOString() : null,
      evidence,
    })
  }

  return rows
    .sort((a, b) => {
      // Prefer confirmed idle over unknown; then larger fleets
      if (a.status !== b.status) {
        return a.status === 'idle_10h' ? -1 : 1
      }
      return b.aircraft_count - a.aircraft_count
    })
    .slice(0, topN)
}

const CAT_RANK: Record<FlightCategory, number> = {
  VFR: 0,
  MVFR: 1,
  IFR: 2,
  LIFR: 3,
}

export function summarizeNationalWx(
  stations: NationalWxStation[],
): NationalWxSummary {
  const counts: NationalWxSummary['counts'] = {
    VFR: 0,
    MVFR: 0,
    IFR: 0,
    LIFR: 0,
    unknown: 0,
  }
  const worst: NationalWxSummary['worst'] = []

  for (const s of stations) {
    const cat = s.flightCat
    if (!cat) {
      counts.unknown += 1
      continue
    }
    counts[cat] += 1
    if (cat === 'IFR' || cat === 'LIFR' || cat === 'MVFR') {
      worst.push({ icao: s.icao, region: s.region, cat })
    }
  }

  worst.sort((a, b) => CAT_RANK[b.cat] - CAT_RANK[a.cat])

  const known = stations.length - counts.unknown
  let headline: string
  if (known === 0) {
    headline = 'National WX snapshot unavailable — refresh when aviationweather responds.'
  } else if (counts.LIFR + counts.IFR === 0 && counts.MVFR === 0) {
    headline = `Mostly VFR across the sample hubs (${counts.VFR}/${known} VFR).`
  } else if (counts.LIFR + counts.IFR === 0) {
    const pockets = worst
      .slice(0, 3)
      .map((w) => w.icao)
      .join(', ')
    headline = `VFR dominant with MVFR pockets${pockets ? ` (${pockets})` : ''}.`
  } else {
    const pockets = worst
      .filter((w) => w.cat === 'IFR' || w.cat === 'LIFR')
      .slice(0, 4)
      .map((w) => `${w.icao} ${w.cat}`)
      .join(' · ')
    headline = `IFR/LIFR in the system${pockets ? `: ${pockets}` : ''}. Check trip lanes.`
  }

  return { headline, counts, stations, worst: worst.slice(0, 6) }
}

export type TripFlyingInput = {
  id: string
  ref: number
  lane: string
  state: string
  operator_name?: string | null
  legs: Array<{
    status: string
    type?: string
    label?: string
    actual_start: string | null
    actual_end: string | null
  }>
}

/** Trips currently out — in progress, or booked with an open active leg. */
export function tripsCurrentlyFlying(trips: TripFlyingInput[]): FlyingTripRow[] {
  const out: FlyingTripRow[] = []
  for (const t of trips) {
    const openLeg = t.legs.find(
      (l) =>
        l.status === 'active' ||
        (Boolean(l.actual_start) && !l.actual_end),
    )
    const flying =
      t.state === 'in_progress' ||
      (t.state === 'booked' && Boolean(openLeg))
    if (!flying) continue
    out.push({
      id: t.id,
      ref: t.ref,
      lane: t.lane,
      state: t.state,
      operator_name: t.operator_name ?? null,
      active_leg_label: openLeg?.label ?? openLeg?.type ?? null,
    })
  }
  return out.sort((a, b) => a.ref - b.ref)
}

/** Human idle label for briefing cards. */
export function formatIdleLabel(row: IdleOperatorRow): string {
  if (row.status === 'unknown') {
    return 'No flight signal (ADS-B pending / no recent trip)'
  }
  if (row.idle_ms == null) return `Idle ≥${REST_IDLE_HOURS}h`
  const hrs = Math.floor(row.idle_ms / 3600000)
  if (hrs >= 48) return `Idle ~${Math.floor(hrs / 24)}d`
  return `Idle ~${hrs}h`
}
