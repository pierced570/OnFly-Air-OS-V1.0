/**
 * Build trip.eta_chain from Quick Dispatch desk inputs.
 * Same A2A spine shape as waterfall `buildTripChain`:
 *   position (TTP) → ground_stop / load-taxi (+40) → air_leg(s) → parking/handoff (+10)
 * Desk-entered repo / live / turn override assumptions as `quoted`.
 */

import { DateTime } from 'luxon'
import { lookupAirport } from '@/domain/airports'
import {
  BUILTIN_ETA_DEFAULTS,
  type ChainLeg,
  type EtaSource,
  type Place,
} from '@/domain/etaChain'
import { haversineNm } from '@/domain/geo'
import { DEFAULT_QUICK_TURN_MIN } from '@/domain/offerQuoteTiming'
import { localInputToUtc } from '@/domain/timeFmt'

/** Standard origin ground time after arrive: loading + taxi out (= spine turn). */
export const QD_LOADING_TAXI_MIN = DEFAULT_QUICK_TURN_MIN

/** Standard dest ground time after landing: taxi to parking + shutdown. */
export const QD_PARKING_SHUTDOWN_MIN = 10

export type QuickDispatchLegInput = {
  origin_icao: string
  dest_icao: string
  date?: string
  repo_time: string
  live_leg_time: string
  /** Optional turn override (minutes string, same loose format). */
  turn_time?: string
}

/** Parse "1.5h", "90m", "1h 20min", bare "2" (hours) → minutes. */
export function parseLooseDurationMinutes(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  // Bare number = hours (desk habit: typing "2" for 2h).
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const hours = Number(s)
    if (!Number.isFinite(hours) || hours < 0) return null
    return Math.round(hours * 60)
  }
  const re =
    /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/g
  let total = 0
  let matched = false
  for (;;) {
    const m = re.exec(s)
    if (!m) break
    matched = true
    const value = Number(m[1])
    const unit = m[2]!
    if (!Number.isFinite(value)) continue
    if (unit.startsWith('h')) total += value * 60
    else total += value
  }
  if (!matched || !Number.isFinite(total)) return null
  return Math.round(total)
}

/** Format minutes → "2h", "30m", or "1h 30m" for storage / display. */
export function formatLooseDurationMinutes(totalMin: number): string {
  const t = Math.max(0, Math.round(totalMin) || 0)
  if (t <= 0) return ''
  const h = Math.floor(t / 60)
  const m = t % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function placeFromIcao(icao: string): Place {
  const code = icao.trim().toUpperCase()
  const ap = lookupAirport(code)
  if (ap) {
    return {
      lat: ap.lat,
      lon: ap.lon,
      icao: ap.icao,
      tz: ap.tz,
      label: ap.name,
    }
  }
  return { lat: 0, lon: 0, icao: code || undefined, tz: 'UTC', label: code || '—' }
}

function addMin(iso: string, min: number): string {
  return DateTime.fromISO(iso, { zone: 'utc' })
    .plus({ minutes: min })
    .toUTC()
    .toISO()!
}

function estimateLiveMin(from: Place, to: Place): number {
  if (
    (!from.lat && !from.lon) ||
    (!to.lat && !to.lon) ||
    (from.lat === 0 && from.lon === 0 && to.lat === 0 && to.lon === 0)
  ) {
    return 90
  }
  const nm = haversineNm(from.lat, from.lon, to.lat, to.lon)
  const cruise = 250
  const taxi = BUILTIN_ETA_DEFAULTS.taxi_pad
  return Math.max(30, Math.round((nm / cruise) * 60) + taxi)
}

function readyAtUtc(
  legs: QuickDispatchLegInput[],
  timing: 'asap' | 'scheduled',
  now: Date,
): string {
  if (timing === 'scheduled') {
    const first = legs[0]
    const date = first?.date?.trim()
    if (date) {
      const origin = placeFromIcao(first?.origin_icao ?? '')
      const tz = origin.tz || 'UTC'
      try {
        return localInputToUtc(`${date}T09:00`, tz)
      } catch {
        return `${date}T13:00:00.000Z`
      }
    }
  }
  return now.toISOString()
}

function quotedOrAssumed(raw: string | undefined): {
  min: number | null
  source: EtaSource
} {
  const parsed = parseLooseDurationMinutes(raw ?? '')
  if (parsed != null) return { min: parsed, source: 'quoted' }
  return { min: null, source: 'assumed' }
}

/**
 * Materialize the shared A2A ETA spine from Quick Dispatch leg times.
 * Empty repo → default aircraft TTP; empty turn → QD_LOADING_TAXI_MIN (40);
 * empty live → great-circle estimate. Dest parking = QD_PARKING_SHUTDOWN_MIN (10).
 * Same leg types / duration_keys as waterfall booking.
 */
export function buildQuickDispatchChain(
  legs: QuickDispatchLegInput[],
  opts?: {
    timing?: 'asap' | 'scheduled'
    now?: Date
    defaultRepoMin?: number
    /** Origin turn autofill — defaults to shared spine 40. */
    defaultTurnMin?: number
    /** Override standard +40 loading/taxi at origin. */
    loadingTaxiMin?: number
    /** Override standard +10 parking/shutdown at dest. */
    parkingShutdownMin?: number
  },
): ChainLeg[] {
  if (!legs.length) return []
  const now = opts?.now ?? new Date()
  const timing = opts?.timing ?? 'asap'
  const defaultRepo = opts?.defaultRepoMin ?? BUILTIN_ETA_DEFAULTS.acft_ttp
  const defaultTurn = Math.max(
    0,
    opts?.loadingTaxiMin ?? opts?.defaultTurnMin ?? QD_LOADING_TAXI_MIN,
  )
  const parkingShutdown = Math.max(
    0,
    opts?.parkingShutdownMin ?? QD_PARKING_SHUTDOWN_MIN,
  )
  let cursor = readyAtUtc(legs, timing, now)
  const chain: ChainLeg[] = []
  let seq = 1

  for (const [i, leg] of legs.entries()) {
    const origin = placeFromIcao(leg.origin_icao)
    const dest = placeFromIcao(leg.dest_icao)
    const repoQ = quotedOrAssumed(leg.repo_time)
    const liveQ = quotedOrAssumed(leg.live_leg_time)
    const turnQ = quotedOrAssumed(leg.turn_time)

    // Skip a full reposition when the previous landing left us at this origin.
    const alreadyHere =
      i > 0 &&
      (legs[i - 1]?.dest_icao ?? '').trim().toUpperCase() ===
        (leg.origin_icao ?? '').trim().toUpperCase()

    if (!alreadyHere) {
      const repo = repoQ.min ?? defaultRepo
      const posEnd = addMin(cursor, repo)
      chain.push({
        seq: seq++,
        type: 'position',
        branch: 'air',
        label: `Position to ${origin.icao || '?'}`,
        event: 'In Position',
        from: {
          lat: origin.lat,
          lon: origin.lon,
          icao: origin.icao,
          tz: origin.tz,
        },
        to: origin,
        est_start: cursor,
        est_end: posEnd,
        actual_start: null,
        actual_end: null,
        duration_min: repo,
        duration_key: 'acft_ttp',
        source: repoQ.source,
        duration_source: repoQ.source,
      })
      cursor = posEnd
    }

    // Origin / intermediate turn (load + taxi) — same key as waterfall acft_turn.
    const turn =
      turnQ.min ??
      (alreadyHere ? (repoQ.min ?? defaultTurn) : defaultTurn)
    const turnSrc: EtaSource =
      turnQ.min != null || (alreadyHere && repoQ.min != null)
        ? 'quoted'
        : 'assumed'
    if (turn > 0) {
      const turnEnd = addMin(cursor, turn)
      chain.push({
        seq: seq++,
        type: 'ground_stop',
        branch: alreadyHere ? 'merged' : 'air',
        label: alreadyHere
          ? `Turnaround ${origin.icao || ''}`
          : `Load / taxi ${origin.icao || '?'}`,
        event: alreadyHere ? 'Turnaround' : 'Ready Wheels Up',
        from: origin,
        to: origin,
        est_start: cursor,
        est_end: turnEnd,
        actual_start: null,
        actual_end: null,
        duration_min: turn,
        duration_key: 'acft_turn',
        source: turnSrc,
        duration_source: turnSrc,
      })
      cursor = turnEnd
    }

    const live = liveQ.min ?? estimateLiveMin(origin, dest)
    const landAt = addMin(cursor, live)
    chain.push({
      seq: seq++,
      type: 'air_leg',
      branch: 'merged',
      label: `Air ${origin.icao || '?'}→${dest.icao || '?'}`,
      event:
        i === 0 ? 'Wheels Up → Wheels Down' : `Wheels Up → Down (leg ${i + 1})`,
      from: origin,
      to: dest,
      est_start: cursor,
      est_end: landAt,
      actual_start: null,
      actual_end: null,
      duration_min: live,
      duration_key: 'air_time',
      source: liveQ.source,
      duration_source: liveQ.source,
      distance_nm:
        origin.lat || dest.lat
          ? Math.round(
              haversineNm(origin.lat, origin.lon, dest.lat, dest.lon) * 10,
            ) / 10
          : null,
    })
    cursor = landAt
  }

  const lastDest = placeFromIcao(legs.at(-1)!.dest_icao)
  const offEnd = addMin(cursor, parkingShutdown)
  chain.push({
    seq: seq++,
    type: 'offload',
    branch: 'merged',
    label: 'Delivered / POD',
    event: 'Taxi to parking + shutdown',
    from: lastDest,
    to: lastDest,
    est_start: cursor,
    est_end: offEnd,
    actual_start: null,
    actual_end: null,
    duration_min: parkingShutdown,
    duration_key: 'fbo_transfer',
    source: 'assumed',
    duration_source: 'assumed',
  })

  return chain
}
