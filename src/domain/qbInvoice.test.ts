import { describe, expect, it } from 'vitest'
import {
  buildInvoiceCustomerMemo,
  buildInvoiceItineraryLines,
  buildInvoiceStopNotes,
  buildQbInvoicePayload,
  charterFlightLineDescription,
  extractPoNumeric,
  formatInvoiceDuration,
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
        poNumber: 'PO #PSA1234',
      }),
    ).toBe(
      'Charter Flight: KNQA → KDFW | PO #PSA1234 | 2026-07-28 | MU2 | Tail: N175CA',
    )
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
      pickupAddress: 'Millington Airport Authority in NQA',
      dropoffAddress: 'PSA hanger in DFW',
      itineraryLines: buildInvoiceItineraryLines({
        lane: 'KNQA → KDFW',
        pickupEtaMin: 135,
        liveLegMin: 105,
        originIcao: 'KNQA',
        destIcao: 'KDFW',
      }),
    })
    expect(memo).toContain('Tail Number: N175CA')
    expect(memo).toContain('Route: KNQA → KDFW')
    expect(memo).toContain('PO #00346')
    expect(memo).toContain('Terms: Net 30')
    expect(memo).toContain('Trip Itinerary')
    expect(memo).toContain('Pickup @ NQA ETA 2hr 15 min')
    expect(memo).toContain('NQA - DFW')
    expect(memo).toContain('Live Leg Time 1hr 45 min')
    expect(memo).toContain('Drop Off @ DFW')
    expect(memo).toContain('Pick up the part at Millington Airport Authority in NQA')
    expect(memo).toContain('Drop off part at PSA hanger in DFW')
    expect(formatInvoiceDuration(105)).toBe('1hr 45 min')
    expect(buildInvoiceStopNotes({ pickupAddress: 'A', dropoffAddress: 'B' })).toEqual([
      'Pick up the part at A',
      'Drop off part at B',
    ])
  })

  it('fills FBO + local ETA like the old payment-request template', () => {
    const lines = buildInvoiceItineraryLines({
      lane: 'KCAK → KHPN',
      originIcao: 'KCAK',
      destIcao: 'KHPN',
      pickupFbo: 'Signature CAK',
      dropoffFbo: 'Landmark HPN',
      pickupEtaLocal: '14:30 EDT',
      liveLegMin: 131,
    })
    expect(lines).toEqual([
      'Pickup @ Signature CAK ETA 14:30 EDT',
      'CAK - HPN',
      'Live Leg Time 2hr 11 min',
      'Drop Off @ Landmark HPN',
    ])
  })

  it('includes optional vendor # on customer memo', () => {
    const memo = buildInvoiceCustomerMemo({
      lane: 'KCAK → KMDW',
      poNumber: '00010',
      vendorNumber: 'V-7781',
    })
    expect(memo).toContain('Vendor #V-7781')
  })

  it('sequences PO numbers with prefix', () => {
    expect(extractPoNumeric('PSA1234')).toBe(1234)
    expect(nextPoNumber({ lastNumeric: 1234, prefix: 'PSA' })).toBe('PSA1235')
    expect(normalizePoDocNumber('PO #00338', 'X')).toBe('00338')
  })

  it('builds one client charter line with tax rolled in', () => {
    const lines = tripInvoiceLines({
      tripRef: 9,
      lane: 'KCAK→KMDW',
      flightDate: '2026-07-18',
      airAmount: 10000,
      aircraftType: 'Caravan',
      tail: 'NTEST',
      taxLines: [{ code: 'FET_CARGO', amount: 625, note: '6.25%' }],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.description).toContain('Charter Flight:')
    expect(lines[0]!.description).toContain('Tail: NTEST')
    expect(lines[0]!.amount).toBe(10625)
    expect(lines.some((l) => /FET_/i.test(l.description))).toBe(false)
  })
})
