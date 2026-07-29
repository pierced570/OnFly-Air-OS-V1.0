/**
 * Build trip.eta_chain from Quick Dispatch desk inputs (repo + live times).
 * Pure — no React / Supabase. A2A spine: position → air → (repeat) → offload.
 */

import { DateTime } from 'luxon'
import { lookupAirport } from '@/domain/airports'
import {
  BUILTIN_ETA_DEFAULTS,
  type ChainLeg,
  type Place,
} from '@/domain/etaChain'
import { haversineNm } from '@/domain/geo'
import { localInputToUtc } from '@/domain/timeFmt'

export type QuickDispatchLegInput = {
  origin_icao: string
  dest_icao: string
  date?: string
  repo_time: string
  live_leg_time: string
}

/** Parse "1.5h", "90m", "1h 20min" style duration strings → minutes. */
export function parseLooseDurationMinutes(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
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

/**
 * Materialize an A2A-ish ETA chain from Quick Dispatch leg times.
 * Empty repo → default aircraft TTP; empty live → great-circle estimate.
 */
export function buildQuickDispatchChain(
  legs: QuickDispatchLegInput[],
  opts?: {
    timing?: 'asap' | 'scheduled'
    now?: Date
    defaultRepoMin?: number
  },
): ChainLeg[] {
  if (!legs.length) return []
  const now = opts?.now ?? new Date()
  const timing = opts?.timing ?? 'asap'
  const defaultRepo =
    opts?.defaultRepoMin ?? BUILTIN_ETA_DEFAULTS.acft_ttp
  let cursor = readyAtUtc(legs, timing, now)
  const chain: ChainLeg[] = []
  let seq = 1

  for (const [i, leg] of legs.entries()) {
    const origin = placeFromIcao(leg.origin_icao)
    const dest = placeFromIcao(leg.dest_icao)
    const repo =
      parseLooseDurationMinutes(leg.repo_time) ?? defaultRepo
    const live =
      parseLooseDurationMinutes(leg.live_leg_time) ??
      estimateLiveMin(origin, dest)

    const posEnd = addMin(cursor, repo)
    chain.push({
      seq: seq++,
      type: 'position',
      branch: 'air',
      label: `Position to ${origin.icao || '?'}`,
      event: 'Aircraft TTP',
      from: { lat: origin.lat, lon: origin.lon, tz: origin.tz },
      to: origin,
      est_start: cursor,
      est_end: posEnd,
      actual_start: null,
      actual_end: null,
      duration_min: repo,
      duration_key: 'acft_ttp',
      source: parseLooseDurationMinutes(leg.repo_time) ? 'quoted' : 'assumed',
      duration_source: parseLooseDurationMinutes(leg.repo_time)
        ? 'quoted'
        : 'assumed',
    })
    cursor = posEnd

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
      source: parseLooseDurationMinutes(leg.live_leg_time)
        ? 'quoted'
        : 'assumed',
      duration_source: parseLooseDurationMinutes(leg.live_leg_time)
        ? 'quoted'
        : 'assumed',
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
  const offloadMin = BUILTIN_ETA_DEFAULTS.fbo_transfer
  const offEnd = addMin(cursor, offloadMin)
  chain.push({
    seq: seq++,
    type: 'offload',
    branch: 'merged',
    label: 'Delivered / POD',
    event: 'Freight Roadside',
    from: lastDest,
    to: lastDest,
    est_start: cursor,
    est_end: offEnd,
    actual_start: null,
    actual_end: null,
    duration_min: offloadMin,
    duration_key: 'fbo_transfer',
    source: 'assumed',
    duration_source: 'assumed',
  })

  return chain
}
