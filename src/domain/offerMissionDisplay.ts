/**
 * Operator-facing mission breakdown for the public trip-offer page.
 * Even, labeled lines — never "bid".
 */

import { formatAirportShort, lookupAirport } from '@/domain/airports'

export type OfferAirportLine = {
  icao: string
  label: string
}

export type OfferMissionDisplay = {
  departure: OfferAirportLine | null
  arrival: OfferAirportLine | null
  /** Remaining lane bits when multi-leg (e.g. " · Kxxx→Kyyy"). */
  extraLane: string | null
  passengers: string
  cargo: string
  ready: string
}

/** True when lane has a return segment (e.g. "KCAK→KHPN · KHPN→KCAK"). */
export function isRoundTripLane(lane: string): boolean {
  return (
    lane
      .split(/\s*·\s*/)
      .map((p) => p.trim())
      .filter(Boolean).length > 1
  )
}

/** Split first lane segment "KCAK→KHPN" (also accepts "->" / "–"). */
export function parseLaneAirports(lane: string): {
  origin: string
  dest: string
  rest: string | null
} | null {
  const parts = lane
    .split(/\s*·\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  const first = parts[0] ?? ''
  const m = first.match(/^([A-Z0-9]{3,4})\s*(?:→|->|–|-)\s*([A-Z0-9]{3,4})$/i)
  if (!m) return null
  const rest = parts.slice(1).join(' · ')
  return {
    origin: m[1]!.toUpperCase(),
    dest: m[2]!.toUpperCase(),
    rest: rest || null,
  }
}

function airportLine(icao: string): OfferAirportLine {
  const info = lookupAirport(icao)
  return {
    icao,
    label: info ? formatAirportShort(info) : icao,
  }
}

/**
 * Pull pax count and cargo description from operator mission summaries
 * like "2 pax + standard tooling (12×12×12 @ 50 lb)".
 */
export function parsePayloadSummary(summary: string): {
  passengers: string
  cargo: string
} {
  const raw = summary.trim()
  if (!raw) {
    return { passengers: 'None listed', cargo: 'None listed' }
  }

  const paxMatch = raw.match(
    /(\d+)\s*(?:pax|passengers?|techs?|engineers?)\b/i,
  )
  const passengers = paxMatch
    ? `${paxMatch[1]} passenger${paxMatch[1] === '1' ? '' : 's'}`
    : /cargo\s*only/i.test(raw)
      ? 'None (cargo only)'
      : 'None listed'

  let cargo = raw
  if (paxMatch) {
    cargo = raw
      .replace(paxMatch[0], '')
      .replace(/^\s*\+\s*/, '')
      .replace(/\s*\+\s*$/, '')
      .trim()
  }
  if (!cargo || /^pax$/i.test(cargo)) {
    cargo = paxMatch && !/cargo|tool|lb|kg|piece|box|dim/i.test(raw)
      ? 'None listed'
      : cargo || 'None listed'
  }
  if (!cargo) cargo = 'None listed'

  return { passengers, cargo }
}

export function buildOfferMissionDisplay(opts: {
  lane: string
  payload_summary: string
  ready_label: string
}): OfferMissionDisplay {
  const parsed = parseLaneAirports(opts.lane)
  const { passengers, cargo } = parsePayloadSummary(opts.payload_summary)
  const ready = (opts.ready_label || 'scheduled').trim() || 'scheduled'
  if (!parsed) {
    return {
      departure: null,
      arrival: null,
      extraLane: opts.lane.trim() || null,
      passengers,
      cargo,
      ready,
    }
  }
  return {
    departure: airportLine(parsed.origin),
    arrival: airportLine(parsed.dest),
    extraLane: parsed.rest,
    passengers,
    cargo,
    ready,
  }
}
