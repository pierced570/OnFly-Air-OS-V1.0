import { describe, expect, it } from 'vitest'
import { TEST_TAX_RATES_2026 } from '@/domain/tax'
import { buildTripInvoiceLines } from './tripInvoiceBuild'

describe('tripInvoiceBuild', () => {
  it('splits client total into air + FET cargo lines', () => {
    const r = buildTripInvoiceLines({
      tripRef: 42,
      lane: 'KCAK→KMDW',
      flightDate: '2026-07-18',
      clientTotal: 10625,
      aircraftType: 'King Air 200',
      payloadKind: 'cargo',
      mtowLbs: 12500,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.airAmount).toBe(10000)
    expect(r.taxTotal).toBe(625)
    expect(r.fetExempt).toBe(false)
    expect(r.lines[0]!.description).toMatch(/Charter Flight:/)
    expect(r.lines.some((l) => l.description.startsWith('FET_CARGO'))).toBe(
      true,
    )
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
    // taxable portion 5000 → air ~4705.88 + FET
    expect(r.lines.some((l) => /Ground handling/.test(l.description))).toBe(
      true,
    )
    const ground = r.lines.find((l) => /Ground handling/.test(l.description))
    expect(ground?.amount).toBe(300)
  })
})
