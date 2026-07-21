/**
 * Cargo piece weight → forklift handling for dispatchers.
 * Per-object (each piece's unit weight), not total shipment weight.
 *   100–200 lb inclusive → forklift recommended
 *   over 200 lb          → forklift required
 */

import type { Piece } from '@/domain/dimsParser'

export const FORKLIFT_RECOMMENDED_MIN_LBS = 100
export const FORKLIFT_REQUIRED_OVER_LBS = 200

export type ForkliftLevel = 'none' | 'recommended' | 'required'

export type ForkliftHandling = {
  level: ForkliftLevel
  heaviest_lbs: number
  /** Dispatcher-facing sentence, or null when none. */
  label: string | null
  /** Compact chip for Board / request summaries. */
  summary_bit: string | null
}

export function forkliftHandlingFromWeights(weightsLbs: number[]): ForkliftHandling {
  const weights = weightsLbs
    .map((w) => Number(w))
    .filter((w) => Number.isFinite(w) && w > 0)
  const heaviest_lbs = weights.length ? Math.max(...weights) : 0

  if (heaviest_lbs > FORKLIFT_REQUIRED_OVER_LBS) {
    return {
      level: 'required',
      heaviest_lbs,
      label: `Forklift required — heaviest piece ${heaviest_lbs} lb (over ${FORKLIFT_REQUIRED_OVER_LBS} lb)`,
      summary_bit: 'forklift required',
    }
  }
  if (heaviest_lbs >= FORKLIFT_RECOMMENDED_MIN_LBS) {
    return {
      level: 'recommended',
      heaviest_lbs,
      label: `Forklift recommended — heaviest piece ${heaviest_lbs} lb (${FORKLIFT_RECOMMENDED_MIN_LBS}–${FORKLIFT_REQUIRED_OVER_LBS} lb)`,
      summary_bit: 'forklift recommended',
    }
  }
  return {
    level: 'none',
    heaviest_lbs,
    label: null,
    summary_bit: null,
  }
}

/** Uses each piece's unit weight (one object), not count × weight. */
export function forkliftHandlingFromPieces(
  pieces: Array<Pick<Piece, 'weight_lbs'>>,
): ForkliftHandling {
  return forkliftHandlingFromWeights(pieces.map((p) => p.weight_lbs))
}
