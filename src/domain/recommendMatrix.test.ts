import { describe, expect, it } from 'vitest'
import {
  BUILTIN_RECOMMEND_MATRIX,
  matrixCompositeRank,
  matrixTargetMargin,
  normalizeMatrixWeights,
  sanitizeRecommendMatrix,
} from './recommendMatrix'

describe('recommendMatrix', () => {
  it('normalizes weights to sum ~1', () => {
    const w = normalizeMatrixWeights({
      ...BUILTIN_RECOMMEND_MATRIX,
      weight_price: 2,
      weight_time: 2,
      weight_radar: 1,
    })
    expect(w.weight_price + w.weight_time + w.weight_radar).toBeCloseTo(1, 6)
    expect(w.weight_price).toBeCloseTo(0.4, 6)
  })

  it('sanitizes recommend_limit and margin', () => {
    const m = sanitizeRecommendMatrix({
      recommend_limit: 99,
      target_margin_pct: -5,
    })
    expect(m.recommend_limit).toBe(12)
    expect(m.target_margin_pct).toBe(0)
    expect(matrixTargetMargin(m)).toBe(0)
  })

  it('composite prefers lower ranks with default weights', () => {
    const m = BUILTIN_RECOMMEND_MATRIX
    const better = matrixCompositeRank(m, 0, 0, 0)
    const worse = matrixCompositeRank(m, 10, 10, 2)
    expect(better).toBeLessThan(worse)
  })
})
