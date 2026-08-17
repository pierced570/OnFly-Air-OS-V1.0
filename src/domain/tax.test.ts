import { describe, expect, it } from 'vitest'
import {
  TEST_TAX_RATES_2026,
  airSubtotalFromClientTotal,
  computeTax,
} from './tax'

describe('computeTax', () => {
  it('$10,000 cargo on King Air 200 (MTOW > 6000) → $625 FET', () => {
    const r = computeTax({
      payloadKind: 'cargo',
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: 12500,
      airSubtotal: 10000,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.fetExempt).toBe(false)
    expect(r.fetMtowUnknown).toBe(false)
    const fet = r.lines.find((l) => l.code === 'FET_CARGO')
    expect(fet?.amount).toBe(625)
    expect(r.total).toBe(625)
  })

  it('same cargo on C310 (MTOW 5500) → $0 FET with §4281 note', () => {
    const r = computeTax({
      payloadKind: 'cargo',
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: 5500,
      airSubtotal: 10000,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.fetExempt).toBe(true)
    expect(r.fetMtowUnknown).toBe(false)
    expect(r.lines.find((l) => l.code === 'FET_CARGO')).toBeUndefined()
    const note = r.lines.find((l) => l.code === 'FET_EXEMPT_MTOW')
    expect(note?.note).toMatch(/§4281/)
    expect(note?.note).toMatch(/6000/)
    expect(r.total).toBe(0)
  })

  it('pax on Cessna 310 (MTOW ≤ 6000) never collects FET or segment', () => {
    const r = computeTax({
      payloadKind: 'pax',
      legs: [{ international: false, segments: 1, paxCount: 1 }],
      aircraftMtowLbs: 5500,
      airSubtotal: 832.28,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.fetExempt).toBe(true)
    expect(r.lines.find((l) => l.code === 'FET_PAX')).toBeUndefined()
    expect(r.lines.find((l) => l.code === 'SEG_FEE_DOM')).toBeUndefined()
    expect(r.total).toBe(0)
  })

  it('missing MTOW never invents FET — flags NEEDS-INFO instead', () => {
    const r = computeTax({
      payloadKind: 'pax',
      legs: [{ international: false, segments: 1, paxCount: 1 }],
      aircraftMtowLbs: null,
      airSubtotal: 900,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.fetMtowUnknown).toBe(true)
    expect(r.fetExempt).toBe(false)
    expect(r.lines.find((l) => l.code === 'FET_PAX')).toBeUndefined()
    expect(r.lines.find((l) => l.code === 'SEG_FEE_DOM')).toBeUndefined()
    expect(r.lines.find((l) => l.code === 'FET_NEEDS_MTOW')?.note).toMatch(
      /MTOW unknown/i,
    )
    expect(r.total).toBe(0)
  })

  it('MTOW exactly 6000 is exempt (only over 6000 pays FET)', () => {
    const r = computeTax({
      payloadKind: 'cargo',
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: 6000,
      airSubtotal: 10000,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.fetExempt).toBe(true)
    expect(r.total).toBe(0)
  })

  it('pax 2 people 2 segments $240 base → $18 FET + $21.20 segment', () => {
    const r = computeTax({
      payloadKind: 'pax',
      legs: [{ international: false, segments: 2, paxCount: 2 }],
      aircraftMtowLbs: 12500,
      airSubtotal: 240,
      rates: TEST_TAX_RATES_2026,
    })
    const fet = r.lines.find((l) => l.code === 'FET_PAX')
    const seg = r.lines.find((l) => l.code === 'SEG_FEE_DOM')
    expect(fet?.amount).toBe(18)
    expect(fet?.note).toMatch(/7\.5%/)
    expect(seg?.amount).toBe(21.2)
    expect(r.total).toBe(39.2)
  })

  it('cargo FET note includes the rate percent', () => {
    const r = computeTax({
      payloadKind: 'cargo',
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: 12500,
      airSubtotal: 10000,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.lines.find((l) => l.code === 'FET_CARGO')?.note).toMatch(/6\.25%/)
  })

  it('both (pax on board) uses higher pax FET + segment fees, not cargo FET', () => {
    const r = computeTax({
      payloadKind: 'both',
      legs: [{ international: false, segments: 1, paxCount: 2 }],
      aircraftMtowLbs: 12500,
      airSubtotal: 10000,
      rates: TEST_TAX_RATES_2026,
    })
    expect(r.lines.find((l) => l.code === 'FET_CARGO')).toBeUndefined()
    const fet = r.lines.find((l) => l.code === 'FET_PAX')
    expect(fet?.amount).toBe(750)
    expect(fet?.note).toMatch(/7\.5%/)
    expect(r.lines.find((l) => l.code === 'SEG_FEE_DOM')?.amount).toBe(10.6)
  })
})

describe('airSubtotalFromClientTotal', () => {
  it('inverts cargo FET so air + tax = target', () => {
    const input = {
      payloadKind: 'cargo' as const,
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: 12500,
      rates: TEST_TAX_RATES_2026,
    }
    const air = airSubtotalFromClientTotal(6250, input)
    const tax = computeTax({ ...input, airSubtotal: air })
    expect(Math.round(air + tax.total)).toBe(6250)
  })

  it('FET-exempt aircraft: air equals client total', () => {
    const input = {
      payloadKind: 'cargo' as const,
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: 5500,
      rates: TEST_TAX_RATES_2026,
    }
    const air = airSubtotalFromClientTotal(5000, input)
    expect(air).toBe(5000)
  })

  it('unknown MTOW: air equals client total (no invented FET)', () => {
    const input = {
      payloadKind: 'pax' as const,
      legs: [{ international: false, segments: 1, paxCount: 1 }],
      aircraftMtowLbs: null,
      rates: TEST_TAX_RATES_2026,
    }
    const air = airSubtotalFromClientTotal(900, input)
    expect(air).toBe(900)
  })
})

describe('fetOverride', () => {
  it('desk can force FET on when MTOW would exempt (≤6000)', () => {
    const r = computeTax({
      payloadKind: 'cargo',
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: 5500,
      airSubtotal: 10000,
      rates: TEST_TAX_RATES_2026,
      fetOverride: 'charge',
    })
    expect(r.fetExempt).toBe(false)
    expect(r.lines.find((l) => l.code === 'FET_CARGO')?.amount).toBe(625)
    expect(r.lines.find((l) => l.code === 'FET_OVERRIDE_ON')?.note).toMatch(
      /desk override/i,
    )
  })

  it('desk can waive FET when MTOW would charge', () => {
    const r = computeTax({
      payloadKind: 'cargo',
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: 12500,
      airSubtotal: 10000,
      rates: TEST_TAX_RATES_2026,
      fetOverride: 'exempt',
    })
    expect(r.fetExempt).toBe(true)
    expect(r.lines.find((l) => l.code === 'FET_CARGO')).toBeUndefined()
    expect(r.lines.find((l) => l.code === 'FET_EXEMPT_MTOW')?.note).toMatch(
      /desk override/i,
    )
    expect(r.total).toBe(0)
  })

  it('desk can charge FET when MTOW unknown', () => {
    const r = computeTax({
      payloadKind: 'cargo',
      legs: [{ international: false, segments: 1, paxCount: 0 }],
      aircraftMtowLbs: null,
      airSubtotal: 10000,
      rates: TEST_TAX_RATES_2026,
      fetOverride: 'charge',
    })
    expect(r.fetMtowUnknown).toBe(false)
    expect(r.lines.find((l) => l.code === 'FET_CARGO')?.amount).toBe(625)
  })
})
