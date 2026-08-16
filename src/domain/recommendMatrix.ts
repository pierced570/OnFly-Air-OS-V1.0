/**
 * Recommendation matrix — scoring knobs for **new-request** operator search.
 * Pure TS. Stored / builtin knobs feed New trip / new-request shortlists only.
 * Parse & shortlist and mid-trip “add operator” use builtins.
 */

export type RecommendMatrixConfig = {
  /** Share of "best" composite from price rank (0–1 before normalize). */
  weight_price: number
  /** Share of "best" composite from time/ETA rank. */
  weight_time: number
  /** Share of "best" composite from radar penalty. */
  weight_radar: number
  /** Desk target margin as percent (15 = 15%). */
  target_margin_pct: number
  /** Max unique operators in labeled shortlist (cheapest/fastest/best fill). */
  recommend_limit: number
  truck_per_mile: number
  truck_min: number
  /** Available payload = max_payload × this. */
  payload_factor: number
  /** Extra NM treated as fuel reserve on range check. */
  reserve_nm: number
  /** Door face fit diagonal fudge (1.05 = 5%). */
  door_diagonal_factor: number
  /** Reposition NM assumed when base ICAO can't be geocoded. */
  unresolved_base_nm: number
}

export const BUILTIN_RECOMMEND_MATRIX: RecommendMatrixConfig = {
  weight_price: 0.45,
  weight_time: 0.3,
  weight_radar: 0.25,
  target_margin_pct: 15,
  recommend_limit: 3,
  truck_per_mile: 3.5,
  truck_min: 150,
  payload_factor: 0.85,
  reserve_nm: 45,
  door_diagonal_factor: 1.05,
  unresolved_base_nm: 2500,
}

export const RECOMMEND_MATRIX_LABELS: Record<
  keyof RecommendMatrixConfig,
  string
> = {
  weight_price: 'Best score — price weight',
  weight_time: 'Best score — time weight',
  weight_radar: 'Best score — radar weight',
  target_margin_pct: 'Target margin %',
  recommend_limit: 'Recommend shortlist size',
  truck_per_mile: 'Truck $/mile',
  truck_min: 'Truck minimum $',
  payload_factor: 'Payload factor',
  reserve_nm: 'Range reserve (NM)',
  door_diagonal_factor: 'Door diagonal factor',
  unresolved_base_nm: 'Unknown-base reposition (NM)',
}

/** Coerce + clamp a partial patch onto builtins. */
export function sanitizeRecommendMatrix(
  partial?: Partial<RecommendMatrixConfig> | null,
): RecommendMatrixConfig {
  const base = { ...BUILTIN_RECOMMEND_MATRIX, ...(partial ?? {}) }
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const clamped: RecommendMatrixConfig = {
    weight_price: Math.max(0, num(base.weight_price, 0.45)),
    weight_time: Math.max(0, num(base.weight_time, 0.3)),
    weight_radar: Math.max(0, num(base.weight_radar, 0.25)),
    target_margin_pct: Math.max(0, Math.min(80, num(base.target_margin_pct, 15))),
    recommend_limit: Math.max(
      1,
      Math.min(12, Math.round(num(base.recommend_limit, 3))),
    ),
    truck_per_mile: Math.max(0, num(base.truck_per_mile, 3.5)),
    truck_min: Math.max(0, num(base.truck_min, 150)),
    payload_factor: Math.max(
      0.1,
      Math.min(1, num(base.payload_factor, 0.85)),
    ),
    reserve_nm: Math.max(0, num(base.reserve_nm, 45)),
    door_diagonal_factor: Math.max(
      1,
      Math.min(1.25, num(base.door_diagonal_factor, 1.05)),
    ),
    unresolved_base_nm: Math.max(0, num(base.unresolved_base_nm, 2500)),
  }
  return normalizeMatrixWeights(clamped)
}

/** Renormalize price/time/radar weights to sum to 1 (or equal thirds if all 0). */
export function normalizeMatrixWeights(
  m: RecommendMatrixConfig,
): RecommendMatrixConfig {
  const sum = m.weight_price + m.weight_time + m.weight_radar
  if (sum <= 0) {
    return {
      ...m,
      weight_price: 1 / 3,
      weight_time: 1 / 3,
      weight_radar: 1 / 3,
    }
  }
  return {
    ...m,
    weight_price: m.weight_price / sum,
    weight_time: m.weight_time / sum,
    weight_radar: m.weight_radar / sum,
  }
}

export function matrixTargetMargin(m: RecommendMatrixConfig): number {
  return m.target_margin_pct / 100
}

/** Lower is better — same shape as generateCandidates compositeRank. */
export function matrixCompositeRank(
  m: RecommendMatrixConfig,
  priceRank: number,
  timeRank: number,
  radarPenalty: number,
): number {
  const w = normalizeMatrixWeights(m)
  return (
    w.weight_price * priceRank +
    w.weight_time * timeRank +
    w.weight_radar * radarPenalty
  )
}
