import { describe, expect, it } from 'vitest'
import { TEST_TAX_RATES_2026 } from '@/domain/tax'
import {
  buildOfferQuotePreview,
  formatMinutes,
} from './offerQuotePreview'

describe('offerQuotePreview', () => {
  it('builds client chain + OnFly margin/tax breakdown', () => {
    const p = buildOfferQuotePreview(
      {
        offer_id: 'o1',
        operator_name: 'Pmoney',
        tail: 'N173WT',
        price_net: 4500,
        time_to_position_min: 90,
        quick_turn_min: 40,
        live_leg_min: 75,
        fee_scope: 'aircraft_and_fees',
        mtow_lbs: 12500,
        payload_kind: 'cargo',
      },
      TEST_TAX_RATES_2026,
      0,
    )
    expect(p.label).toBe('Option A')
    expect(p.ttp_min).toBe(90)
    expect(p.turn_load_min).toBe(40)
    expect(p.live_leg_min).toBe(75)
    expect(p.vendor_price).toBe(4500)
    expect(p.margin_pct).toBe(15)
    expect(p.client_air).toBeGreaterThan(p.vendor_price)
    expect(p.client_total).toBeGreaterThan(p.client_air)
    expect(p.fet_total).toBeGreaterThan(0)
    expect(p.operator_name).toBe('Pmoney')
  })

  it('formats minutes for client layout', () => {
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(40)).toBe('40m')
    expect(formatMinutes(null)).toBe('—')
  })

  it('honors desk margin % override', () => {
    const p = buildOfferQuotePreview(
      {
        offer_id: 'o1',
        operator_name: 'Pmoney',
        tail: 'N173WT',
        price_net: 4000,
        time_to_position_min: 90,
        quick_turn_min: 40,
        live_leg_min: 75,
        fee_scope: 'aircraft_and_fees',
        mtow_lbs: 12500,
        payload_kind: 'cargo',
        margin_pct: 25,
      },
      TEST_TAX_RATES_2026,
      0,
    )
    expect(p.margin_pct).toBe(25)
    // Margin-on-sell: 4000 / (1 - 0.25) ≈ 5333
    expect(p.client_air).toBe(5333)
  })
})
