/**
 * Bundled ICAO catalog with city/state for picker UX + geo/tz lookups.
 * Generated from OurAirports via `npm run generate:airports`.
 */

import catalog from '../data/airports_catalog.json'

export type AirportInfo = {
  icao: string
  name: string
  city: string
  state: string
  /** 3-letter IATA when known (e.g. HPN for KHPN). */
  iata: string
  lat: number
  lon: number
  tz: string
}

/** Compact generated row. */
type CatalogRow = [
  icao: string,
  name: string,
  city: string,
  state: string,
  iata: string,
  lat: number,
  lon: number,
  tz: string,
]

/** Label for dropdowns: "KHPN (HPN) — White Plains, NY · Westchester County Airport" */
export function formatAirportLabel(a: AirportInfo): string {
  const place = a.state ? `${a.city}, ${a.state}` : a.city || a.name
  const code = a.iata ? `${a.icao} (${a.iata})` : a.icao
  return `${code} — ${place} · ${a.name}`
}

export function formatAirportShort(a: AirportInfo): string {
  const place = a.state ? `${a.city}, ${a.state}` : a.city || a.name
  const code = a.iata ? `${a.icao} (${a.iata})` : a.icao
  return `${code} — ${place}`
}

function toInfo(r: CatalogRow): AirportInfo {
  return {
    icao: r[0],
    name: r[1],
    city: r[2],
    state: r[3],
    iata: r[4] || '',
    lat: r[5],
    lon: r[6],
    tz: r[7],
  }
}

const ROWS = catalog as CatalogRow[]

export const AIRPORTS: Record<string, AirportInfo> = Object.fromEntries(
  ROWS.map((r) => [r[0], toInfo(r)]),
)

/** IATA → ICAO (HPN → KHPN). */
const IATA_INDEX: Record<string, string> = {}
for (const r of ROWS) {
  if (r[4]) IATA_INDEX[r[4]] = r[0]
}

const SORTED: AirportInfo[] = ROWS.map(toInfo).sort((a, b) =>
  a.icao.localeCompare(b.icao),
)

export function listAirports(): AirportInfo[] {
  return SORTED
}

/**
 * Resolve ICAO, IATA, or bare US 3-letter (HPN → KHPN).
 */
export function lookupAirport(code: string): AirportInfo | null {
  const key = code.trim().toUpperCase()
  if (!key) return null
  if (AIRPORTS[key]) return AIRPORTS[key]
  const viaIata = IATA_INDEX[key]
  if (viaIata && AIRPORTS[viaIata]) return AIRPORTS[viaIata]
  if (key.length === 3 && AIRPORTS[`K${key}`]) return AIRPORTS[`K${key}`]
  if (key.length === 3 && AIRPORTS[`C${key}`]) return AIRPORTS[`C${key}`]
  return null
}

export function lookupTz(icao: string): string | null {
  return lookupAirport(icao)?.tz ?? null
}

/** Search ICAO, IATA, city, state, or airport name. */
export function searchAirports(query: string, limit = 12): AirportInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return SORTED.slice(0, limit)
  const scored: Array<{ a: AirportInfo; score: number }> = []
  for (const a of SORTED) {
    const icao = a.icao.toLowerCase()
    const iata = a.iata.toLowerCase()
    const city = a.city.toLowerCase()
    const state = a.state.toLowerCase()
    const name = a.name.toLowerCase()
    let score = -1
    if (icao === q || iata === q) score = 100
    else if (icao.startsWith(q) || (iata && iata.startsWith(q))) score = 90
    else if (city === q || `${city}, ${state}` === q) score = 80
    else if (city.startsWith(q)) score = 70
    else if (state === q) score = 50
    else if (name.includes(q)) score = 40
    else if (city.includes(q) || `${city} ${state}`.includes(q)) score = 30
    else if (icao.includes(q) || (iata && iata.includes(q))) score = 20
    if (score >= 0) scored.push({ a, score })
  }
  return scored
    .sort(
      (x, y) =>
        y.score - x.score ||
        // Prefer airline/regional fields when scores tie (Akron → CAK not AKR).
        (y.a.iata ? 1 : 0) - (x.a.iata ? 1 : 0) ||
        (/regional/i.test(y.a.name) ? 1 : 0) - (/regional/i.test(x.a.name) ? 1 : 0) ||
        x.a.icao.localeCompare(y.a.icao),
    )
    .slice(0, limit)
    .map((x) => x.a)
}
