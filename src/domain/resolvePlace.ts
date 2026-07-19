/**
 * Turn free-text origin/dest (city, ICAO, IATA) into a catalog airport.
 */

import {
  lookupAirport,
  searchAirports,
  type AirportInfo,
} from '@/domain/airports'

function pickBest(hits: AirportInfo[], cityHint: string): AirportInfo | null {
  if (!hits.length) return null
  const city = cityHint.split(',')[0]?.trim().toLowerCase() ?? ''
  const cityHits = city
    ? hits.filter((h) => h.city.toLowerCase() === city)
    : []
  const pool = cityHits.length ? cityHits : hits
  const intl = pool.find((h) => /intl|international/i.test(h.name))
  return intl ?? pool[0] ?? null
}

/** Resolve "Akron, OH", "KHPN", "HPN", or "White Plains" → catalog row. */
export function resolvePlaceToAirport(text: string): AirportInfo | null {
  const raw = text.trim()
  if (!raw) return null

  const direct = lookupAirport(raw)
  if (direct) return direct

  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.length >= 3 && compact.length <= 4) {
    const byCode = lookupAirport(compact)
    if (byCode) return byCode
  }

  const tokens = raw.toUpperCase().match(/\b[A-Z]{3,4}\b/g) ?? []
  for (const t of tokens) {
    const hit = lookupAirport(t)
    if (hit) return hit
  }

  const hits = searchAirports(raw, 10)
  const best = pickBest(hits, raw)
  if (best) return best

  const cityOnly = raw.split(',')[0]?.trim()
  if (cityOnly && cityOnly.toLowerCase() !== raw.toLowerCase()) {
    return pickBest(searchAirports(cityOnly, 10), cityOnly)
  }
  return null
}
