import { describe, expect, it } from 'vitest'
import {
  generateTripCode,
  isValidTripCode,
  normalizeTripCode,
} from './tripCode'

describe('tripCode', () => {
  it('validates 2 letters + 3 digits', () => {
    expect(isValidTripCode('AB123')).toBe(true)
    expect(isValidTripCode('ab123')).toBe(true)
    expect(isValidTripCode('T-26')).toBe(false)
    expect(isValidTripCode('ABC12')).toBe(false)
    expect(isValidTripCode('A1234')).toBe(false)
  })

  it('normalizes case', () => {
    expect(normalizeTripCode(' ab123 ')).toBe('AB123')
  })

  it('generates unique codes', () => {
    const used = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const code = generateTripCode(used)
      expect(isValidTripCode(code)).toBe(true)
      expect(used.has(code)).toBe(false)
      used.add(code)
    }
  })

  it('avoids codes already in the set', () => {
    const used = new Set(['AA000', 'AA001'])
    const code = generateTripCode(used)
    expect(used.has(code)).toBe(false)
  })
})
