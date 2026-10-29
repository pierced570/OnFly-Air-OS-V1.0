import { describe, expect, it } from 'vitest'
import {
  buildOperatorsByBaseView,
  groupOperatorsByBase,
} from './operatorsByBase'

describe('operatorsByBase', () => {
  it('groups operators by base ICAO', () => {
    const ops = [
      { id: '1', name: 'Akron Air', base_icao: 'KCAK', aircraft_count: 2 },
      { id: '2', name: 'Akron Two', base_icao: 'cak', aircraft_count: 1 },
      { id: '3', name: 'Cleve Op', base_icao: 'KCLE', aircraft_count: 3 },
      { id: '4', name: 'No Base', base_icao: null, aircraft_count: 0 },
    ]
    const { byBase, unknown } = groupOperatorsByBase(ops)
    expect(byBase.get('KCAK')?.map((o) => o.name)).toEqual([
      'Akron Air',
      'Akron Two',
    ])
    expect(byBase.get('KCLE')?.map((o) => o.name)).toEqual(['Cleve Op'])
    expect(unknown).toHaveLength(1)

    const view = buildOperatorsByBaseView(ops, 'KCAK')
    expect(view.selected?.operators).toHaveLength(2)
    expect(view.bases[0]?.icao).toBe('KCAK')
    expect(view.unknown_count).toBe(1)
  })
})
