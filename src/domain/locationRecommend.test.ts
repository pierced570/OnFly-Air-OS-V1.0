import { describe, expect, it } from 'vitest'
import {
  isValidRecommendIcao,
  moveOperatorInOrder,
  normalizeRecommendIcao,
  recommendIcaoMatch,
} from './locationRecommend'

describe('locationRecommend', () => {
  it('normalizes ICAO', () => {
    expect(normalizeRecommendIcao(' kcak ')).toBe('KCAK')
    expect(normalizeRecommendIcao('cak!')).toBe('CAK')
  })

  it('matches K-prefix variants', () => {
    expect(recommendIcaoMatch('KCAK', 'CAK')).toBe(true)
    expect(recommendIcaoMatch('KCAK', 'KCLE')).toBe(false)
    expect(isValidRecommendIcao('CAK')).toBe(true)
    expect(isValidRecommendIcao('ab')).toBe(false)
  })

  it('reorders operators', () => {
    const ops = [
      { operator_id: '1', name: 'A' },
      { operator_id: '2', name: 'B' },
      { operator_id: '3', name: 'C' },
    ]
    expect(moveOperatorInOrder(ops, 0, 1).map((o) => o.name)).toEqual([
      'B',
      'A',
      'C',
    ])
    expect(moveOperatorInOrder(ops, 2, -1).map((o) => o.name)).toEqual([
      'A',
      'C',
      'B',
    ])
    expect(moveOperatorInOrder(ops, 0, -1).map((o) => o.name)).toEqual([
      'A',
      'B',
      'C',
    ])
  })
})
