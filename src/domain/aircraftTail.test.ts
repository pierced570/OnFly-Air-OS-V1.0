import { describe, expect, it } from 'vitest'
import {
  isAssignableAircraftTail,
  normalizeAircraftTail,
} from './aircraftTail'

describe('aircraftTail', () => {
  it('rejects placeholders', () => {
    expect(isAssignableAircraftTail('')).toBe(false)
    expect(isAssignableAircraftTail('TBD')).toBe(false)
    expect(isAssignableAircraftTail('tba')).toBe(false)
    expect(isAssignableAircraftTail('N/A')).toBe(false)
    expect(isAssignableAircraftTail('pending')).toBe(false)
  })

  it('accepts registry marks', () => {
    expect(isAssignableAircraftTail('N12345')).toBe(true)
    expect(isAssignableAircraftTail('n6209x')).toBe(true)
    expect(isAssignableAircraftTail('C-GABC')).toBe(true)
  })

  it('normalizes', () => {
    expect(normalizeAircraftTail(' n123 ab ')).toBe('N123AB')
  })
})
