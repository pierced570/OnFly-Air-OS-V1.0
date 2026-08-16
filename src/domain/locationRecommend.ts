/**
 * Recommended calls by location (ICAO) — ordered operator lists for desk.
 * Pure TypeScript. Persistence lives in locationRecommendStore.
 */

export type LocationRecommendOperator = {
  operator_id: string
  name: string
}

export type LocationRecommendList = {
  /** Canonical ICAO (uppercase). */
  icao: string
  /** Call order — index 0 is first to call. */
  operators: LocationRecommendOperator[]
  updated_at: string
}

/** Strip junk; uppercase ICAO / FAA code. */
export function normalizeRecommendIcao(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** True when two codes refer to the same field (KCAK ↔ CAK). */
export function recommendIcaoMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = normalizeRecommendIcao(a)
  const y = normalizeRecommendIcao(b)
  if (!x || !y) return false
  if (x === y) return true
  const sx = x.length === 4 && x.startsWith('K') ? x.slice(1) : x
  const sy = y.length === 4 && y.startsWith('K') ? y.slice(1) : y
  return sx === sy && sx.length >= 3
}

export function isValidRecommendIcao(raw: string | null | undefined): boolean {
  const n = normalizeRecommendIcao(raw)
  return /^[A-Z0-9]{3,4}$/.test(n)
}

/**
 * Reorder operators in a list. Returns a new array; no-op if index/dir invalid.
 */
export function moveOperatorInOrder(
  operators: readonly LocationRecommendOperator[],
  index: number,
  direction: -1 | 1,
): LocationRecommendOperator[] {
  const next = [...operators]
  const j = index + direction
  if (index < 0 || index >= next.length || j < 0 || j >= next.length) {
    return next
  }
  const tmp = next[index]!
  next[index] = next[j]!
  next[j] = tmp
  return next
}
