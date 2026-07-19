/**
 * FAA flight categories — colors for METAR/TAF chips.
 * VFR green · MVFR blue · IFR red · LIFR purple
 */

export const FLIGHT_CATEGORIES = ['VFR', 'MVFR', 'IFR', 'LIFR'] as const
export type FlightCategory = (typeof FLIGHT_CATEGORIES)[number]

export const FLIGHT_CATEGORY_LABELS: Record<FlightCategory, string> = {
  VFR: 'VFR',
  MVFR: 'Marginal VFR',
  IFR: 'IFR',
  LIFR: 'Low IFR',
}

/** Tailwind-friendly token names (see index.css). */
export const FLIGHT_CATEGORY_TOKEN: Record<FlightCategory, string> = {
  VFR: 'vfr',
  MVFR: 'mvfr',
  IFR: 'ifr',
  LIFR: 'lifr',
}

export type CloudLayer = {
  cover: string
  base: number | null
}

/**
 * Ceiling = lowest BKN / OVC / VV base (ft AGL). null = unlimited / unknown.
 */
export function ceilingFt(clouds: CloudLayer[], vertVisFt?: number | null): number | null {
  if (vertVisFt != null && vertVisFt >= 0) return vertVisFt
  let lowest: number | null = null
  for (const c of clouds) {
    const cover = c.cover.toUpperCase()
    if (cover !== 'BKN' && cover !== 'OVC' && cover !== 'VV') continue
    if (c.base == null || Number.isNaN(c.base)) continue
    if (lowest == null || c.base < lowest) lowest = c.base
  }
  return lowest
}

/**
 * FAA flight category from visibility (SM) + ceiling (ft).
 * Missing vis or ceiling → treat that dimension as VFR-clear when deriving.
 */
export function flightCategoryFromValues(
  visSm: number | null,
  ceiling: number | null,
): FlightCategory {
  const vis = visSm
  const cig = ceiling

  const lifr =
    (vis != null && vis < 1) || (cig != null && cig < 500)
  if (lifr) return 'LIFR'

  const ifr =
    (vis != null && vis < 3) || (cig != null && cig < 1000)
  if (ifr) return 'IFR'

  const mvfr =
    (vis != null && vis <= 5) || (cig != null && cig <= 3000)
  if (mvfr) return 'MVFR'

  return 'VFR'
}

export function parseFlightCategory(raw: string | null | undefined): FlightCategory | null {
  if (!raw) return null
  const u = raw.trim().toUpperCase()
  if (u === 'VFR' || u === 'MVFR' || u === 'IFR' || u === 'LIFR') return u
  return null
}

/** aviationweather.gov visib can be number or "P6" / "6+". */
export function parseVisSm(visib: string | number | null | undefined): number | null {
  if (visib == null) return null
  if (typeof visib === 'number') {
    return Number.isFinite(visib) ? visib : null
  }
  const s = visib.trim().toUpperCase()
  if (!s) return null
  if (s.startsWith('P') || s.endsWith('+')) {
    const n = Number.parseFloat(s.replace(/[P+]/g, ''))
    return Number.isFinite(n) ? n : 6
  }
  // fractions like "1/2" or "2 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  }
  const frac = s.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export type TafPeriodCat = {
  label: string
  timeFrom: string
  timeTo: string
  flightCat: FlightCategory
  visSm: number | null
  ceilingFt: number | null
  wxString: string | null
}

export function categorizeTafPeriod(input: {
  timeFromSec: number
  timeToSec: number
  fcstChange?: string | null
  visib?: string | number | null
  vertVis?: number | null
  clouds?: Array<{ cover?: string; base?: number | null }>
  wxString?: string | null
}): TafPeriodCat {
  const clouds: CloudLayer[] = (input.clouds ?? []).map((c) => ({
    cover: String(c.cover ?? ''),
    base: c.base == null ? null : Number(c.base),
  }))
  const visSm = parseVisSm(input.visib ?? null)
  const cig = ceilingFt(clouds, input.vertVis ?? null)
  const change = (input.fcstChange ?? '').toUpperCase() || 'BASE'
  return {
    label: change,
    timeFrom: new Date(input.timeFromSec * 1000).toISOString(),
    timeTo: new Date(input.timeToSec * 1000).toISOString(),
    flightCat: flightCategoryFromValues(visSm, cig),
    visSm,
    ceilingFt: cig,
    wxString: input.wxString ?? null,
  }
}

/** Worst (most restrictive) category among a list — for TAF summary chip. */
export function worstFlightCategory(
  cats: Array<FlightCategory | null | undefined>,
): FlightCategory | null {
  const rank: Record<FlightCategory, number> = {
    VFR: 0,
    MVFR: 1,
    IFR: 2,
    LIFR: 3,
  }
  let best: FlightCategory | null = null
  for (const c of cats) {
    if (!c) continue
    if (best == null || rank[c] > rank[best]) best = c
  }
  return best
}
