import { describe, expect, it } from 'vitest'
import { TEST_TAX_RATES_2026 } from '@/domain/tax'
import { buildTripInvoiceLines } from './tripInvoiceBuild'

describe('tripInvoiceBuild', () => {
  it('puts all-in on one QBO line and keeps FET in taxBreakdown', () => {
    const r = buildTripInvoiceLines({
      tripRef: 42,
      lane: 'KCAK→KMDW',
      flightDate: '2026-07-18',
      clientTotal: 10625,
      aircraftType: 'King Air 200',
      poNumber: 'PSA0042',
      payloadKind: 'cargo',
      mtowLbs: 12500,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.airAmount).toBe(10000)
    expect(r.taxTotal).toBe(625)
    expect(r.fetExempt).toBe(false)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]!.description).toMatch(/Charter Flight:/)
    expect(r.lines[0]!.description).toContain('PO #PSA0042')
    expect(r.lines[0]!.amount).toBe(10625)
    expect(r.lines.some((l) => /FET_/i.test(l.description))).toBe(false)
    expect(r.taxBreakdown.some((l) => l.code === 'FET_CARGO')).toBe(true)
    expect(r.taxBreakdown.find((l) => l.code === 'FET_CARGO')?.amount).toBe(625)
  })

  it('splits pax FET vs segment on ledger, one client line on invoice', () => {
    const r = buildTripInvoiceLines({
      tripRef: 7,
      lane: 'KCAK→KSHV',
      flightDate: '2026-08-16',
      clientTotal: 900,
      aircraftType: 'King Air 200',
      tail: 'N200KA',
      payloadKind: 'pax',
      mtowLbs: 12500,
      paxCount: 1,
      segmentCount: 1,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]!.amount).toBe(900)
    expect(r.lines.some((l) => /FET_|SEG_/i.test(l.description))).toBe(false)
    const codes = r.taxBreakdown.map((l) => l.code)
    expect(codes).toContain('FET_PAX')
    expect(codes).toContain('SEG_FEE_DOM')
    expect(r.taxTotal).toBeGreaterThan(0)
    expect(
      Math.round((r.airAmount + r.taxTotal) * 100) / 100,
    ).toBe(900)
  })

  it('Cessna 310 (MTOW ≤ 6000) never puts FET dollars on the ledger', () => {
    const r = buildTripInvoiceLines({
      tripRef: 8,
      lane: 'KCAK→KSHV',
      flightDate: '2026-08-16',
      clientTotal: 900,
      aircraftType: 'Cessna 310',
      tail: 'N310XX',
      payloadKind: 'pax',
      mtowLbs: 5500,
      paxCount: 1,
      segmentCount: 1,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.fetExempt).toBe(true)
    expect(r.taxTotal).toBe(0)
    expect(r.taxBreakdown.some((l) => l.code === 'FET_PAX')).toBe(false)
    expect(r.taxBreakdown.some((l) => l.code === 'FET_EXEMPT_MTOW')).toBe(true)
    expect(r.airAmount).toBe(900)
    expect(r.lines[0]!.amount).toBe(900)
  })

  it('unknown MTOW never invents FET dollars — flags NEEDS-INFO on ledger', () => {
    const r = buildTripInvoiceLines({
      tripRef: 9,
      lane: 'KCAK→KSHV',
      flightDate: '2026-08-16',
      clientTotal: 900,
      aircraftType: 'Unknown',
      payloadKind: 'cargo',
      mtowLbs: null,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.taxTotal).toBe(0)
    expect(r.taxBreakdown.some((l) => l.code === 'FET_CARGO')).toBe(false)
    expect(r.taxBreakdown.some((l) => l.code === 'FET_NEEDS_MTOW')).toBe(true)
    expect(r.airAmount).toBe(900)
  })

  it('desk FET override charge logs FET even when MTOW ≤ 6000', () => {
    const r = buildTripInvoiceLines({
      tripRef: 10,
      lane: 'KCAK→KSHV',
      flightDate: '2026-08-16',
      clientTotal: 10625,
      aircraftType: 'Cessna 310',
      payloadKind: 'cargo',
      mtowLbs: 5500,
      fetOverride: 'charge',
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.fetExempt).toBe(false)
    expect(r.taxTotal).toBe(625)
    expect(r.taxBreakdown.some((l) => l.code === 'FET_CARGO')).toBe(true)
    expect(r.taxBreakdown.some((l) => l.code === 'FET_OVERRIDE_ON')).toBe(true)
  })

  it('adds ground handling as its own line', () => {
    const r = buildTripInvoiceLines({
      tripRef: 1,
      lane: 'KTEB→KPDK',
      flightDate: null,
      clientTotal: 5300,
      groundHandlingUsd: 300,
      payloadKind: 'cargo',
      mtowLbs: 12500,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.lines.some((l) => /Ground handling/.test(l.description))).toBe(
      true,
    )
    const ground = r.lines.find((l) => /Ground handling/.test(l.description))
    expect(ground?.amount).toBe(300)
    expect(r.lines.filter((l) => /Charter Flight/.test(l.description))).toHaveLength(
      1,
    )
  })
})
