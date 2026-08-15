/**
 * When to flag a trip for House Air Waybill (HAWB / AWB) creation.
 * Pure TS — no React / Supabase.
 *
 * Rule (ops-simple until airport.country lands):
 * - Cargo or cargo+pax trip
 * - Lane is international = not both ends US-territory ICAOs
 */

export type AwbPayloadKind = 'cargo' | 'pax' | 'both'

/** US / US-territory ICAO prefixes used for domestic charter ops. */
export function isUsTerritoryIcao(icao: string): boolean {
  const c = icao.trim().toUpperCase()
  if (c.length < 3) return false
  // Continental US
  if (c.startsWith('K') && c.length === 4) return true
  // Alaska / Hawaii
  if (c.startsWith('PA') || c.startsWith('PH')) return true
  // Puerto Rico / US Virgin Islands
  if (c.startsWith('TJ') || c.startsWith('TI')) return true
  return false
}

/** True when origin and dest are both known and not both US-territory. */
export function laneIsInternational(
  originIcao: string | null | undefined,
  destIcao: string | null | undefined,
): boolean {
  const o = (originIcao ?? '').trim().toUpperCase()
  const d = (destIcao ?? '').trim().toUpperCase()
  if (o.length < 3 || d.length < 3) return false
  if (o === d) return false
  return !(isUsTerritoryIcao(o) && isUsTerritoryIcao(d))
}

/**
 * Parse first origin→dest pair from a lane label
 * (`KGSP→CYYZ`, `KCAK -> KBGR`, `KGSP / CYYZ`).
 */
export function icaosFromLaneLabel(lane: string): {
  origin: string | null
  dest: string | null
} {
  const m = lane
    .trim()
    .toUpperCase()
    .match(/\b([A-Z]{3,4})\b\s*(?:→|->|\/|—|–)\s*\b([A-Z]{3,4})\b/)
  if (!m) return { origin: null, dest: null }
  return { origin: m[1]!, dest: m[2]! }
}

export function awbCreationNeeded(input: {
  payload_kind: AwbPayloadKind
  origin_icao?: string | null
  dest_icao?: string | null
  lane?: string | null
}): boolean {
  if (input.payload_kind === 'pax') return false
  let origin = input.origin_icao?.trim() || null
  let dest = input.dest_icao?.trim() || null
  if ((!origin || !dest) && input.lane) {
    const parsed = icaosFromLaneLabel(input.lane)
    origin = origin || parsed.origin
    dest = dest || parsed.dest
  }
  return laneIsInternational(origin, dest)
}
