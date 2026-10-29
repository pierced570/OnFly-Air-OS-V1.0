import { describe, expect, it } from 'vitest'
import {
  neighboringStates,
  normalizeUsStateCode,
  usStateDisplayName,
} from './usStateNeighbors'

describe('usStateNeighbors', () => {
  it('normalizes codes', () => {
    expect(normalizeUsStateCode(' oh ')).toBe('OH')
    expect(normalizeUsStateCode(null)).toBe('')
  })

  it('labels known states', () => {
    expect(usStateDisplayName('OH')).toBe('Ohio')
    expect(usStateDisplayName('DC')).toBe('District of Columbia')
  })

  it('lists contiguous neighbors for Ohio', () => {
    expect(neighboringStates('OH')).toEqual(['IN', 'KY', 'MI', 'PA', 'WV'])
  })

  it('lists no neighbors for Alaska / Hawaii / unknown', () => {
    expect(neighboringStates('AK')).toEqual([])
    expect(neighboringStates('HI')).toEqual([])
    expect(neighboringStates('XX')).toEqual([])
  })

  it('is symmetric for a shared border', () => {
    expect(neighboringStates('CA')).toContain('NV')
    expect(neighboringStates('NV')).toContain('CA')
  })
})
