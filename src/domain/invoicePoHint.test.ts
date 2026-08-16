import { describe, expect, it } from 'vitest'
import { formatInvoicePoHint, tripRefLabel } from './invoicePoHint'

describe('invoicePoHint', () => {
  it('formats last used PO with trip ref and +1 suggestion', () => {
    expect(
      formatInvoicePoHint({
        lastPo: 'EDW0042',
        lastPoTripRef: 'T-118',
        suggestedPo: 'EDW0043',
      }),
    ).toBe('Last used EDW0042 on T-118 · suggesting EDW0043')
  })

  it('omits trip when unknown', () => {
    expect(
      formatInvoicePoHint({
        lastPo: '00007',
        suggestedPo: '00008',
      }),
    ).toBe('Last used 00007 · suggesting 00008')
  })

  it('handles first PO', () => {
    expect(
      formatInvoicePoHint({
        lastPo: null,
        suggestedPo: '00001',
      }),
    ).toBe('No prior PO — suggesting 00001')
  })

  it('tripRefLabel prefers code over numeric ref', () => {
    expect(tripRefLabel({ code: 'AB123', ref: 9 })).toBe('AB123')
    expect(tripRefLabel({ code: '', ref: 9 })).toBe('T-9')
  })
})
