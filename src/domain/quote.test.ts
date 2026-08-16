import { describe, expect, it } from 'vitest'
import { priceFromMargin, buildQuoteTotals } from './quote'
import { TEST_TAX_RATES_2026 } from './tax'
import type { Candidate } from './routing'

function stubCand(partial: Partial<Candidate> & { cost: number; price: number }): Candidate {
  return {
    operator_id: 'op',
    operator_name: 'Op',
    aircraft_id: 'ac',
    tail: 'N1',
    type_name: 'King Air 200',
    mtow_lbs: 12500,
    chain: [],
    confidence: 1,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: '',
    circuit_nm: 100,
    rate_per_nm: 10,
    rate_source: 'assumption',
    ...partial,
  }
}

describe('quote math', () => {
  it('priceFromMargin at 15% matches /0.85', () => {
    expect(priceFromMargin(8500, 15)).toBe(10000)
  })

  it('buildQuoteTotals adds cargo FET on MTOW > 6000', () => {
    const cand = stubCand({ cost: 8500, price: 10000, mtow_lbs: 12500 })
    const t = buildQuoteTotals(cand, {
      markupMode: 'dollars',
      markupValue: 1500,
      payloadKind: 'cargo',
      mtowLbs: 12500,
      paxCount: 0,
      segments: 1,
      rates: TEST_TAX_RATES_2026,
    })
    expect(t.airSubtotal).toBe(10000)
    expect(t.tax.lines.find((l) => l.code === 'FET_CARGO')?.amount).toBe(625)
    expect(t.total).toBe(10625)
  })

  it('buildQuoteTotals exempts FET when MTOW ≤ 6000', () => {
    const cand = stubCand({ cost: 8500, price: 10000, mtow_lbs: 5500 })
    const t = buildQuoteTotals(cand, {
      markupMode: 'dollars',
      markupValue: 1500,
      payloadKind: 'cargo',
      mtowLbs: 5500,
      paxCount: 0,
      segments: 1,
      rates: TEST_TAX_RATES_2026,
    })
    expect(t.tax.fetExempt).toBe(true)
    expect(t.total).toBe(10000)
  })

  it('buildQuoteTotals does not invent FET when MTOW is unknown', () => {
    const cand = stubCand({ cost: 8500, price: 10000, mtow_lbs: null })
    const t = buildQuoteTotals(cand, {
      markupMode: 'dollars',
      markupValue: 1500,
      payloadKind: 'cargo',
      mtowLbs: null,
      paxCount: 0,
      segments: 1,
      rates: TEST_TAX_RATES_2026,
    })
    expect(t.tax.fetMtowUnknown).toBe(true)
    expect(t.tax.total).toBe(0)
    expect(t.total).toBe(10000)
  })
})
