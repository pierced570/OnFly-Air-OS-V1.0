import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetLocationRecommendForTests,
  addLocationRecommendOperator,
  getLocationRecommend,
  listLocationRecommends,
  moveLocationRecommendOperator,
  removeLocationRecommend,
  removeLocationRecommendOperator,
  upsertLocationRecommend,
} from './locationRecommendStore'

describe('locationRecommendStore', () => {
  beforeEach(() => {
    __resetLocationRecommendForTests()
  })

  it('adds ICAO lists and looks up K-prefix', () => {
    upsertLocationRecommend('cak')
    expect(listLocationRecommends()).toHaveLength(1)
    expect(getLocationRecommend('KCAK')?.icao).toBe('CAK')
  })

  it('keeps ordered operators and reorders', () => {
    upsertLocationRecommend('KCLE')
    addLocationRecommendOperator('KCLE', {
      operator_id: 'op-a',
      name: 'Alpha Air',
    })
    addLocationRecommendOperator('KCLE', {
      operator_id: 'op-b',
      name: 'Bravo Jets',
    })
    // duplicate ignored
    addLocationRecommendOperator('KCLE', {
      operator_id: 'op-a',
      name: 'Alpha Air',
    })
    expect(getLocationRecommend('KCLE')?.operators.map((o) => o.name)).toEqual([
      'Alpha Air',
      'Bravo Jets',
    ])
    moveLocationRecommendOperator('KCLE', 1, -1)
    expect(getLocationRecommend('KCLE')?.operators.map((o) => o.name)).toEqual([
      'Bravo Jets',
      'Alpha Air',
    ])
    removeLocationRecommendOperator('KCLE', 'op-b')
    expect(getLocationRecommend('KCLE')?.operators).toHaveLength(1)
  })

  it('removes a location', () => {
    upsertLocationRecommend('KDET')
    removeLocationRecommend('DET')
    expect(listLocationRecommends()).toHaveLength(0)
  })
})
