import { describe, expect, it } from 'vitest'
import {
  buildInvoiceCustomerMemo,
  buildQbInvoicePayload,
  charterFlightLineDescription,
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

  it('builds QBO payload with ACH pay link + DocNumber=PO', () => {
    const p = buildQbInvoicePayload({
      customerId: '42',
      customerName: 'Acme',
      poNumber: 'PO #PSA1234',
      txnDate: '2026-07-18',
      payTerms: 'Net 30',
      itemId: '1',
      itemName: 'Brokerage Services - AOG',
      billEmail: 'ap@acme.test',
      lines: [{ description: 'Charter Flight: KCLE→KATL', amount: 12500 }],
      notes: 'Wire only',
    })
    expect(p.EmailStatus).toBe('NotSet')
    expect(p.AllowOnlineACHPayment).toBe(true)
    expect(p.AllowOnlineCreditCardPayment).toBe(false)
    expect(p.BillEmail?.Address).toBe('ap@acme.test')
    expect(p.DocNumber).toBe('PSA1234')
    expect(p.SalesTermRef.value).toBe('3')
    expect(p.DueDate).toBe('2026-08-17')
  })

  it('formats charter line + customer memo like live OFA invoices', () => {
    expect(
      charterFlightLineDescription({
        lane: 'KNQA → KDFW',
        flightDate: '2026-07-28',
        aircraftType: 'MU2',
        tail: 'N175CA',
      }),
    ).toBe('Charter Flight: KNQA → KDFW | 2026-07-28 | MU2 | Tail: N175CA')

    const memo = buildInvoiceCustomerMemo({
      lane: 'KNQA → KDFW',
      flightDate: '2026-07-28',
      aircraftType: 'MU2',
      tail: 'N175CA',
      poNumber: '00346',
      payTerms: 'Net 30',
    })
    expect(memo).toContain('Tail Number: N175CA')
    expect(memo).toContain('Route: KNQA → KDFW')
    expect(memo).toContain('PO #00346')
  })

  it('sequences PO numbers with prefix', () => {
    expect(extractPoNumeric('PSA1234')).toBe(1234)
    expect(nextPoNumber({ lastNumeric: 1234, prefix: 'PSA' })).toBe('PSA1235')
    expect(normalizePoDocNumber('PO #00338', 'X')).toBe('00338')
  })

  it('builds trip lines with charter description + tax', () => {
    const lines = tripInvoiceLines({
      tripRef: 9,
      lane: 'KCAK→KMDW',
      flightDate: '2026-07-18',
      airAmount: 10000,
      aircraftType: 'Caravan',
      tail: 'NTEST',
      taxLines: [{ code: 'FET_CARGO', amount: 625, note: '6.25%' }],
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]!.description).toContain('Charter Flight:')
    expect(lines[0]!.description).toContain('Tail: NTEST')
    expect(lines[1]!.amount).toBe(625)
  })
})
