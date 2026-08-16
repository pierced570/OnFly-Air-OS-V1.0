import { describe, expect, it } from 'vitest'
import { resolveTripPoNumber, tripHasPoNumber } from './tripPo'

describe('tripPo', () => {
  it('prefers po_number over quick.po', () => {
    expect(
      resolveTripPoNumber({ po_number: 'PSA0042', quick: { po: 'OLD' } }),
    ).toBe('PSA0042')
  })

  it('falls back to quick.po', () => {
    expect(resolveTripPoNumber({ po_number: null, quick: { po: 'QD9' } })).toBe(
      'QD9',
    )
  })

  it('returns null when empty — do not invent CLI0001', () => {
    expect(resolveTripPoNumber({ po_number: '  ', quick: { po: '' } })).toBe(
      null,
    )
    expect(tripHasPoNumber({})).toBe(false)
  })
})
