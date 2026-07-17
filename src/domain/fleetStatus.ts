/**
 * Fleet status from ADS-B — position + last takeoff/landing.
 * No crew-rest legal determination.
 */

import { haversineNm } from '@/domain/geo'
import type { AdsbPosition } from '@/adapters/adsb'

export type FlightPhase = 'airborne' | 'on_ground' | 'no_data'

export type FleetStatus = {
  tail: string
  lat: number
  lon: number
  alt: number
  gs: number
  seenAt: string
  phase: FlightPhase
  inPositionOfBase: boolean
  nmFromBase: number | null
  laddBlocked: boolean
  lastTakeoffAt: string | null
  lastLandingAt: string | null
  operator_name?: string
  type_name?: string | null
  base_icao?: string | null
  source?: string
}

export type FleetStatusInput = {
  position: AdsbPosition
  base?: { lat: number; lon: number; icao?: string } | null
  inPositionNm?: number
  operator_name?: string
  type_name?: string | null
  base_icao?: string | null
  source?: string
}

export function deriveFlightPhase(p: AdsbPosition): FlightPhase {
  if (p.laddBlocked) return 'no_data'
  if (p.phase) return p.phase
  if (p.gs > 50 || p.alt > 500) return 'airborne'
  return 'on_ground'
}

export function deriveFleetStatus(input: FleetStatusInput): FleetStatus {
  const p = input.position
  const phase = deriveFlightPhase(p)
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
    phase,
    inPositionOfBase,
    nmFromBase,
    laddBlocked: Boolean(p.laddBlocked),
    lastTakeoffAt: p.lastTakeoffAt ?? null,
    lastLandingAt: p.lastLandingAt ?? null,
    operator_name: input.operator_name,
    type_name: input.type_name,
    base_icao: input.base_icao ?? input.base?.icao,
    source: input.source,
  }
}

/** Ranking: prefer on-ground near base; deprioritize no-data / airborne far out. */
export function radarRankPenalty(status: FleetStatus | undefined): number {
  if (!status || status.laddBlocked || status.phase === 'no_data') return 2
  let p = 0
  if (status.phase === 'airborne') p += 0.8
  if (status.inPositionOfBase) p -= 0.8
  return p
}
