/**
 * Fleet status derived from ADS-B positions + base proximity.
 * Advisory only — not a Part 135.267 legal determination.
 */

import { haversineNm } from '@/domain/geo'
import type { AdsbPosition } from '@/adapters/adsb'

export type RestChip = 'likely_rested' | 'rest_clock_running' | 'unknown'

export type FleetStatus = {
  tail: string
  lat: number
  lon: number
  alt: number
  gs: number
  seenAt: string
  rest: RestChip
  inPositionOfBase: boolean
  nmFromBase: number | null
  laddBlocked: boolean
  lastFlewAt: string | null
  operator_name?: string
  type_name?: string | null
  base_icao?: string | null
}

export type FleetStatusInput = {
  position: AdsbPosition & {
    laddBlocked?: boolean
    lastFlewAt?: string | null
  }
  base?: { lat: number; lon: number; icao?: string } | null
  /** NM radius considered "in position" at base (default 40) */
  inPositionNm?: number
  /** Hours since last session end to count as rested (default 10) */
  restHours?: number
  now?: Date
  operator_name?: string
  type_name?: string | null
  base_icao?: string | null
}

export function deriveRestChip(opts: {
  gs: number
  lastFlewAt: string | null | undefined
  laddBlocked?: boolean
  restHours?: number
  now?: Date
}): RestChip {
  if (opts.laddBlocked) return 'unknown'
  if (opts.gs > 50) return 'rest_clock_running'
  if (!opts.lastFlewAt) return 'unknown'
  const now = opts.now ?? new Date()
  const last = new Date(opts.lastFlewAt).getTime()
  const hrs = (now.getTime() - last) / (1000 * 60 * 60)
  const threshold = opts.restHours ?? 10
  if (hrs >= threshold) return 'likely_rested'
  return 'rest_clock_running'
}

export function deriveFleetStatus(input: FleetStatusInput): FleetStatus {
  const p = input.position
  const rest = deriveRestChip({
    gs: p.gs,
    lastFlewAt: p.lastFlewAt,
    laddBlocked: p.laddBlocked,
    restHours: input.restHours,
    now: input.now,
  })
  let nmFromBase: number | null = null
  let inPositionOfBase = false
  if (input.base) {
    nmFromBase = haversineNm(p.lat, p.lon, input.base.lat, input.base.lon)
    inPositionOfBase = nmFromBase <= (input.inPositionNm ?? 40)
  }
  return {
    tail: p.tail,
    lat: p.lat,
    lon: p.lon,
    alt: p.alt,
    gs: p.gs,
    seenAt: p.seenAt,
    rest,
    inPositionOfBase,
    nmFromBase,
    laddBlocked: Boolean(p.laddBlocked),
    lastFlewAt: p.lastFlewAt ?? null,
    operator_name: input.operator_name,
    type_name: input.type_name,
    base_icao: input.base_icao ?? input.base?.icao,
  }
}

/** Ranking boost: lower is better (used in best-score sort). */
export function radarRankPenalty(status: FleetStatus | undefined): number {
  if (!status || status.laddBlocked || status.rest === 'unknown') return 2
  let p = 0
  if (status.rest === 'rest_clock_running') p += 1.5
  if (status.rest === 'likely_rested') p -= 0.5
  if (status.inPositionOfBase) p -= 0.8
  return p
}

export const REST_CHIP_TOOLTIP =
  'estimate from ADS-B; operator confirms legality'
