import { describe, expect, it } from 'vitest'
import {
  buildQbInvoicePayload,
  extractPoNumeric,
  nextPoNumber,
  normalizePoDocNumber,
  salesTermRefForPayTerms,
  tripInvoiceLines,
} from './qbInvoice'

describe('qbInvoice', () => {
  it('maps pay terms to QBO SalesTermRef ids', () => {
    expect(salesTermRefForPayTerms('Due on Receipt')).toBe('1')
    expect(salesTermRefForPayTerms('Net 15')).toBe('2')
    expect(salesTermRefForPayTerms('Net 30')).toBe('3')
    expect(salesTermRefForPayTerms('Net 60')).toBe('4')
  })

  it('builds OFA-safe payload: NotSet, no online pay, DocNumber=PO', () => {
    const p = buildQbInvoicePayload({
      customerId: '42',
      customerName: 'Acme',
      poNumber: 'PO #PSA1234',
      txnDate: '2026-07-18',
      payTerms: 'Net 30',
      itemId: '1',
      itemName: 'Services',
      lines: [{ description: 'T-100 KCLE-KATL', amount: 12500 }],
      notes: 'Wire only',
    })
    expect(p.EmailStatus).toBe('NotSet')
    expect(p.AllowOnlineACHPayment).toBe(false)
    expect(p.AllowOnlineCreditCardPayment).toBe(false)
    // OFA: never set BillEmail — prevents QBO auto-email
    expect(p.DocNumber).toBe('PSA1234')
    expect(p.SalesTermRef.value).toBe('3')
    expect(p.DueDate).toBe('2026-08-17')
    expect((p as { BillEmail?: unknown }).BillEmail).toBeUndefined()
  })

  it('sequences PO numbers with prefix', () => {
    expect(extractPoNumeric('PSA1234')).toBe(1234)
    expect(nextPoNumber({ lastNumeric: 1234, prefix: 'PSA' })).toBe('PSA1235')
    expect(normalizePoDocNumber('PO #00338', 'X')).toBe('00338')
  })

  it('builds trip lines with tax', () => {
    const lines = tripInvoiceLines({
      tripRef: 9,
      lane: 'KCAK→KMDW',
      flightDate: '2026-07-18',
      airAmount: 10000,
      taxLines: [{ code: 'FET_CARGO', amount: 625, note: '6.25%' }],
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]!.description).toContain('T-9')
    expect(lines[1]!.amount).toBe(625)
  })
})
