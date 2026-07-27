import { describe, expect, it } from 'vitest'
import { normalizeD085Rows } from './d085Parse'
import {
  countD085MatchKinds,
  matchD085RowsToNetwork,
} from './d085Match'

describe('d085Match', () => {
  const fleet = [
    {
      id: 'a1',
      tail: 'N52MG',
      operator_id: 'castle',
      operator_name: 'Castle Aviation',
      type_name: 'Aerostar',
    },
    {
      id: 'a2',
      tail: 'N-388BB',
      operator_id: 'apex',
      operator_name: 'Apex Jet',
      type_name: 'Falcon 50',
    },
  ]

  it('links existing tails and prefers network type when Unknown', () => {
    const parsed = normalizeD085Rows(
      [
        { tail: 'N52MG', type_name: 'Unknown' },
        { tail: 'N999ZZ', type_name: 'King Air 200' },
      ],
      new Set(['King Air 200']),
    )
    const rows = matchD085RowsToNetwork(parsed, fleet, {
      operatorId: 'castle',
    })
    expect(rows[0]?.match_kind).toBe('linked')
    expect(rows[0]?.default_accept).toBe(true)
    expect(rows[0]?.type_name).toBe('Aerostar')
    expect(rows[1]?.match_kind).toBe('new')
    expect(rows[1]?.default_accept).toBe(false)
  })

  it('flags cross-operator conflicts', () => {
    const parsed = normalizeD085Rows(
      [{ tail: 'N388BB', type_name: 'Falcon 50' }],
      new Set(['Falcon 50']),
    )
    const rows = matchD085RowsToNetwork(parsed, fleet, {
      operatorId: 'castle',
    })
    expect(rows[0]?.match_kind).toBe('conflict')
    expect(rows[0]?.default_accept).toBe(false)
    expect(rows[0]?.conflict).toMatch(/Apex Jet/)
  })

  it('counts kinds', () => {
    const parsed = normalizeD085Rows(
      [
        { tail: 'N52MG', type_name: 'Aerostar' },
        { tail: 'N388BB', type_name: 'Falcon 50' },
        { tail: 'N111AA', type_name: 'Unknown' },
      ],
      new Set(['Aerostar', 'Falcon 50']),
    )
    const rows = matchD085RowsToNetwork(parsed, fleet, {
      operatorId: 'castle',
    })
    expect(countD085MatchKinds(rows)).toEqual({
      linked: 1,
      conflict: 1,
      new: 1,
    })
  })
})
