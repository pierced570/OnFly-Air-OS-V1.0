/**
 * Mission endpoint modes — Airport (A) vs Door (D).
 * Patterns: A2A, D2D, A2D, D2A. Pure TS for parse + waterfall sheets.
 */

import { resolvePlaceToAirport } from '@/domain/resolvePlace'
import type { ServicePattern } from '@/domain/etaChain'
import {
  forkliftHandlingFromPieces,
  type ForkliftHandling,
} from '@/domain/forkliftHandling'
import { parseDims } from '@/domain/dimsParser'
import { toolingDimsForParse } from '@/domain/standardTooling'

export type EndpointKind = 'airport' | 'door'

export type MissionEndpoint = {
  kind: EndpointKind
  /** Free text: ICAO/city or street address */
  text: string
  /** Air-segment ICAO (nearest airport when kind=door) */
  icao: string
}

export type MissionSheet = {
  pattern: ServicePattern
  /** Short badge e.g. D2D */
  badge: string
  /** Dispatcher sheet title */
  title: string
  /** One-line workflow hint */
  blurb: string
  needs_origin_courier: boolean
  needs_dest_courier: boolean
  /** Airports still required for the live air leg */
  air_origin_icao: string
  air_dest_icao: string
}

export type MissionOpsFlags = {
  pattern: ServicePattern
  sheet: MissionSheet
  forklift: ForkliftHandling
  /** True when any door endpoint needs a ground courier assignment */
  needs_ground_courier: boolean
  /** Waterfall / Board chips */
  chips: string[]
}

const STREET_RE =
  /\b(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|way|cir|circle|ct|court|pl|place|hwy|highway|pkwy|parkway|terrace|trl|trail)\b/i

/** Street-ish free text → door; strong ICAO/city match → airport. */
export function classifyEndpointText(raw: string): EndpointKind {
  const text = raw.trim()
  if (!text) return 'airport'

  const hasStreetWord = STREET_RE.test(text)
  const hasHouseNumber = /^\d{1,6}\s/.test(text) || /\s\d{1,6}\s/.test(text)
  const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(text)
  if (hasStreetWord && (hasHouseNumber || hasZip || text.length > 24)) {
    return 'door'
  }
  if (hasHouseNumber && hasZip) return 'door'

  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^[A-Z]{3,4}$/.test(compact) && resolvePlaceToAirport(text)) {
    return 'airport'
  }

  const hit = resolvePlaceToAirport(text)
  if (hit && text.length <= 48 && !hasStreetWord) return 'airport'
  if (hit && !hasHouseNumber) return 'airport'
  return hit ? 'airport' : 'door'
}

/** Pull a city/state hint from a street address for nearest-airport search. */
export function cityHintFromAddress(address: string): string {
  const raw = address.trim()
  if (!raw) return ''
  // "… Nesquehoning PA 18240" or "… Oceanside, CA 92056"
  const m = raw.match(
    /([A-Za-z .'-]+?)\s*,?\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/,
  )
  if (m) return `${m[1]!.trim()}, ${m[2]}`
  const parts = raw.split(/[,\n]/).map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts.slice(-2).join(', ')
  return raw
}

export function resolveAirIcaoForEndpoint(
  kind: EndpointKind,
  text: string,
  existingIcao?: string,
): string {
  const prior = (existingIcao ?? '').trim().toUpperCase()
  if (prior && resolvePlaceToAirport(prior)) return prior

  if (kind === 'airport') {
    return resolvePlaceToAirport(text)?.icao ?? prior
  }

  const fromFull = resolvePlaceToAirport(text)
  if (fromFull) return fromFull.icao
  const hint = cityHintFromAddress(text)
  if (hint) {
    const fromCity = resolvePlaceToAirport(hint)
    if (fromCity) return fromCity.icao
  }
  return prior
}

export function buildMissionEndpoint(
  text: string,
  kind?: EndpointKind,
  icao?: string,
): MissionEndpoint {
  const trimmed = text.trim()
  const k = kind ?? classifyEndpointText(trimmed)
  return {
    kind: k,
    text: trimmed,
    icao: resolveAirIcaoForEndpoint(k, trimmed, icao),
  }
}

export function servicePatternFromEndpoints(
  origin: Pick<MissionEndpoint, 'kind'>,
  dest: Pick<MissionEndpoint, 'kind'>,
): ServicePattern {
  const oDoor = origin.kind === 'door'
  const dDoor = dest.kind === 'door'
  if (oDoor && dDoor) return 'D2D'
  if (oDoor && !dDoor) return 'D2A'
  if (!oDoor && dDoor) return 'A2D'
  return 'A2A'
}

export function missionSheetFor(
  pattern: ServicePattern,
  originIcao: string,
  destIcao: string,
): MissionSheet {
  const air_origin_icao = originIcao.trim().toUpperCase()
  const air_dest_icao = destIcao.trim().toUpperCase()
  switch (pattern) {
    case 'D2D':
      return {
        pattern,
        badge: 'D2D',
        title: 'Door → Door sheet',
        blurb:
          'Ground courier pickup + air segment + ground courier delivery. Assign couriers and nearest airports.',
        needs_origin_courier: true,
        needs_dest_courier: true,
        air_origin_icao,
        air_dest_icao,
      }
    case 'D2A':
      return {
        pattern,
        badge: 'D2A',
        title: 'Door → Airport sheet',
        blurb:
          'Ground courier to origin airport, then air to destination airport.',
        needs_origin_courier: true,
        needs_dest_courier: false,
        air_origin_icao,
        air_dest_icao,
      }
    case 'A2D':
      return {
        pattern,
        badge: 'A2D',
        title: 'Airport → Door sheet',
        blurb:
          'Air to destination airport, then ground courier to door.',
        needs_origin_courier: false,
        needs_dest_courier: true,
        air_origin_icao,
        air_dest_icao,
      }
    default:
      return {
        pattern: 'A2A',
        badge: 'A2A',
        title: 'Airport → Airport sheet',
        blurb: 'Air segment only — no ground courier required.',
        needs_origin_courier: false,
        needs_dest_courier: false,
        air_origin_icao,
        air_dest_icao,
      }
  }
}

/** Lane label that preserves door addresses when present. */
export function missionLaneLabel(
  origin: MissionEndpoint,
  dest: MissionEndpoint,
): string {
  const o =
    origin.kind === 'door'
      ? `Door→${origin.icao || '?'}`
      : origin.icao || origin.text || '?'
  const d =
    dest.kind === 'door'
      ? `${dest.icao || '?'}→Door`
      : dest.icao || dest.text || '?'
  if (origin.kind === 'door' && dest.kind === 'door') {
    return `D2D ${origin.icao || '?'}→${dest.icao || '?'}`
  }
  if (origin.kind === 'door') return `D2A ${o}→${d}`
  if (dest.kind === 'door') return `A2D ${o}→${d}`
  return `${o}→${d}`
}

export function buildMissionOpsFlags(opts: {
  origin: MissionEndpoint
  dest: MissionEndpoint
  pieces_text?: string
}): MissionOpsFlags {
  const pattern = servicePatternFromEndpoints(opts.origin, opts.dest)
  const sheet = missionSheetFor(pattern, opts.origin.icao, opts.dest.icao)
  const pieces = parseDims(
    toolingDimsForParse((opts.pieces_text ?? '').trim() || ''),
  ).pieces
  const forklift = forkliftHandlingFromPieces(pieces)
  const needs_ground_courier =
    sheet.needs_origin_courier || sheet.needs_dest_courier
  const chips: string[] = [sheet.badge]
  if (forklift.summary_bit) chips.push(forklift.summary_bit)
  if (needs_ground_courier) chips.push('ground courier')
  return {
    pattern,
    sheet,
    forklift,
    needs_ground_courier,
    chips,
  }
}

/** Routing mode for generateCandidates. */
export function routingModeForPattern(
  pattern: ServicePattern,
): 'a2a' | 'd2d' | 'mixed' {
  if (pattern === 'A2A') return 'a2a'
  if (pattern === 'D2D') return 'd2d'
  return 'mixed'
}
