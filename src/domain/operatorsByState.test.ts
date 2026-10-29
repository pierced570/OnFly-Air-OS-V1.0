import { describe, expect, it } from 'vitest'
import {
  buildOperatorsByStateView,
  groupOperatorsByState,
  stateForOperatorBase,
} from './operatorsByState'

describe('operatorsByState', () => {
  it('resolves state from base ICAO', () => {
    const hit = stateForOperatorBase('KCAK')
    expect(hit?.state).toBe('OH')
    expect(hit?.icao).toBe('KCAK')
  })

  it('groups operators and lists nearby states', () => {
    const ops = [
      { id: '1', name: 'Akron Air', base_icao: 'KCAK', aircraft_count: 2 },
      { id: '2', name: 'Cleveland Charter', base_icao: 'KCLE', aircraft_count: 1 },
      { id: '3', name: 'Indy Ops', base_icao: 'KIND', aircraft_count: 3 },
      { id: '4', name: 'No Base', base_icao: null, aircraft_count: 0 },
    ]
    const { byState, unknown } = groupOperatorsByState(ops)
    expect(byState.get('OH')?.map((o) => o.name)).toEqual([
      'Akron Air',
      'Cleveland Charter',
    ])
    expect(byState.get('IN')?.map((o) => o.name)).toEqual(['Indy Ops'])
    expect(unknown).toHaveLength(1)

    const view = buildOperatorsByStateView(ops, 'OH')
    expect(view.selected?.operators).toHaveLength(2)
    expect(view.states_with_operators[0]?.state).toBe('OH')
    expect(view.nearby.some((n) => n.state === 'IN' && n.has_operators)).toBe(
      true,
    )
    expect(view.nearby.some((n) => n.state === 'PA')).toBe(true)
    expect(view.unknown_count).toBe(1)
  })

  it('handles empty selection', () => {
    const view = buildOperatorsByStateView(
      [{ id: '1', name: 'Akron Air', base_icao: 'KCAK' }],
      null,
    )
    expect(view.selected).toBeNull()
    expect(view.nearby).toEqual([])
  })
})
