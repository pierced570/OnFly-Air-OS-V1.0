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

/** Service-pattern / desk ops chips — not cargo for the air operator. */
const OPS_NOISE_RE =
  /\b(?:A2A|D2D|A2D|D2A|ground\s+courier|forklift\s+(?:required|recommended))\b/gi

/** Strip A2A/D2D/etc and forklift/courier chips from a mission fragment. */
export function scrubOpsNoiseFromCargo(text: string): string {
  return text
    .replace(OPS_NOISE_RE, '')
    .replace(/^[·+\s|,./-]+|[·+\s|,./-]+$/g, '')
    .replace(/\s*[·+]\s*/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function isEmptyCargo(cargo: string): boolean {
  if (!cargo) return true
  if (/^pax$/i.test(cargo)) return true
  // Placeholder from operatorMissionSummary when pieces were blank.
  if (/^cargo(?:\s+only)?$/i.test(cargo)) return true
  return false
}

/**
 * Pull pax count and cargo description from operator mission summaries
 * like "2 pax + standard tooling (12×12×12 @ 75 lb)".
 * Service pattern (A2A) and ground/forklift chips are not cargo.
 */
export function parsePayloadSummary(summary: string): {
  passengers: string
  cargo: string
} {
  const raw = summary.trim()
  if (!raw) {
    return { passengers: 'None listed', cargo: 'No cargo submitted' }
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
  cargo = scrubOpsNoiseFromCargo(cargo)
  // Drop leading "cargo only" / lone "cargo" placeholder when real dims follow.
  cargo = cargo
    .replace(/^cargo(?:\s+only)?\s*[·+\-–,]*\s*/i, '')
    .trim()
  if (isEmptyCargo(cargo)) {
    cargo = 'No cargo submitted'
  }

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

/** Badge chips for the cream operator quote header. */
export type OfferMissionBadge = {
  label: string
  emphasis?: 'gold' | 'default'
}

export function buildOfferMissionBadges(opts: {
  lane: string
  payload_summary: string
  ready_label: string
  nm?: number | null
}): OfferMissionBadge[] {
  const badges: OfferMissionBadge[] = []
  if (opts.nm != null && opts.nm > 0) {
    badges.push({ label: `${Math.round(opts.nm)} NM` })
  }
  const cargo = scrubOpsNoiseFromCargo(opts.payload_summary)
  const pc = cargo.match(/(\d+)\s*(?:pc|pcs|piece|pieces|skid|skids|pallet|pallets)\b/i)
  if (pc) {
    badges.push({
      label: `${pc[1]} PC`,
    })
  } else if (/cargo\s*only/i.test(opts.payload_summary) || cargo) {
    const qty = cargo.match(/^(\d+)\s*x\b/i)
    if (qty) badges.push({ label: `${qty[1]} PC` })
    else if (cargo && !isEmptyCargo(cargo)) badges.push({ label: '1 PC' })
  }
  const dims = cargo.match(
    /(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\s*(?:in|")?/i,
  )
  if (dims) {
    badges.push({
      label: `${dims[1]}x${dims[2]}x${dims[3]} IN`,
    })
  }
  const lb = cargo.match(/(\d[\d,]*)\s*(?:lb|lbs)\b/i)
  if (lb) {
    badges.push({ label: `${lb[1].replace(/,/g, '')} LB` })
  }
  const ready = (opts.ready_label || '').trim()
  if (/asap/i.test(ready)) {
    badges.push({ label: 'READY ASAP' })
  } else if (ready && !/^scheduled$/i.test(ready)) {
    badges.push({ label: ready.toUpperCase() })
  }
  if (isRoundTripLane(opts.lane)) {
    badges.push({ label: 'ROUNDTRIP', emphasis: 'gold' })
  }
  return badges
}

export function offerLaneTitle(opts: {
  lane: string
  payload_summary: string
}): string {
  const parsed = parseLaneAirports(opts.lane)
  const laneBit = parsed
    ? `${parsed.origin} → ${parsed.dest}`
    : opts.lane.trim() || 'Trip'
  const cargoOnly = /cargo\s*only/i.test(opts.payload_summary)
  const pax = parsePayloadSummary(opts.payload_summary).passengers
  const kind = cargoOnly
    ? 'cargo only'
    : pax.startsWith('None')
      ? 'cargo'
      : pax
  return `${laneBit} · ${kind}`
}
