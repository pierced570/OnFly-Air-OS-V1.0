import { describe, expect, it } from 'vitest'
import {
  formatNumericDisplay,
  isDecimalDraft,
  parseDecimalDraft,
  sanitizeDecimalDraft,
} from './numericDraft'

describe('numericDraft', () => {
  it('allows clearing to empty (no invented 0)', () => {
    expect(parseDecimalDraft('')).toBeNull()
    expect(parseDecimalDraft('   ')).toBeNull()
    expect(formatNumericDisplay(null)).toBe('')
    expect(formatNumericDisplay(undefined)).toBe('')
    expect(formatNumericDisplay(0, { blankZero: true })).toBe('')
    expect(formatNumericDisplay(0)).toBe('0')
  })

  it('accepts intermediate decimal drafts without committing', () => {
    expect(isDecimalDraft('')).toBe(true)
    expect(isDecimalDraft('12.')).toBe(true)
    expect(isDecimalDraft('.')).toBe(true)
    expect(parseDecimalDraft('12.')).toBeNull()
    expect(parseDecimalDraft('.')).toBeNull()
    expect(parseDecimalDraft('12.5')).toBe(12.5)
  })

  it('strips commas and rejects junk', () => {
    expect(sanitizeDecimalDraft('1,250')).toBe('1250')
    expect(parseDecimalDraft('1,250')).toBe(1250)
    expect(isDecimalDraft('12a')).toBe(false)
  })

  it('integer mode rejects decimals', () => {
    expect(isDecimalDraft('3.5', true)).toBe(false)
    expect(parseDecimalDraft('3', { integer: true })).toBe(3)
    expect(parseDecimalDraft('', { integer: true })).toBeNull()
  })
})
