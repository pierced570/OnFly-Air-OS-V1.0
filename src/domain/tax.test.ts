import { describe, expect, it } from 'vitest'
import { TEST_TAX_RATES_2026, computeTax } from './tax'

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
    expect(r.lines.find((l) => l.code === 'FET_CARGO')).toBeUndefined()
    const note = r.lines.find((l) => l.code === 'FET_EXEMPT_MTOW')
    expect(note?.note).toMatch(/§4281/)
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
