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

  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(120)).toBe('2h 0m')
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(75)).toBe('1h 15m')
    expect(formatMinutes(45)).toBe('0h 45m')
    expect(formatMinutes(40)).toBe('0h 40m')
    expect(formatMinutes(0)).toBe('0h 0m')
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

  it('works backwards from client total (taxes + effective margin)', () => {
    const p = buildOfferQuotePreview(
      {
        offer_id: 'o1',
        operator_name: 'Tester',
        tail: 'N12345',
        price_net: 5000,
        time_to_position_min: 120,
        quick_turn_min: 45,
        live_leg_min: 75,
        fee_scope: 'aircraft_and_fees',
        mtow_lbs: 12500,
        payload_kind: 'cargo',
        margin_pct: 15,
        client_total_override: 6250,
      },
      TEST_TAX_RATES_2026,
      0,
    )
    expect(p.client_total).toBe(6250)
    expect(p.client_air + Math.round(p.tax_total)).toBe(6250)
    expect(p.margin_pct).toBeGreaterThan(0)
    expect(p.fet_exempt).toBe(false)
  })

  it('notes FET exempt when MTOW ≤ 6000 on reverse total', () => {
    const p = buildOfferQuotePreview(
      {
        offer_id: 'o1',
        operator_name: 'Light',
        tail: 'N310XX',
        price_net: 4000,
        time_to_position_min: 60,
        quick_turn_min: 40,
        live_leg_min: 70,
        fee_scope: 'aircraft_and_fees',
        mtow_lbs: 5500,
        payload_kind: 'cargo',
        client_total_override: 5000,
      },
      TEST_TAX_RATES_2026,
      0,
    )
    expect(p.fet_exempt).toBe(true)
    expect(p.client_total).toBe(5000)
    expect(p.tax_total).toBe(0)
    expect(p.client_air).toBe(5000)
  })

  it('unknown MTOW does not invent FET on forward pricing', () => {
    const p = buildOfferQuotePreview(
      {
        offer_id: 'o1',
        operator_name: 'Unknown',
        tail: 'N???',
        price_net: 4000,
        time_to_position_min: 60,
        quick_turn_min: 40,
        live_leg_min: 70,
        fee_scope: 'aircraft_and_fees',
        mtow_lbs: null,
        payload_kind: 'pax',
      },
      TEST_TAX_RATES_2026,
      0,
    )
    expect(p.fet_mtow_unknown).toBe(true)
    expect(p.fet_exempt).toBe(false)
    expect(p.fet_total).toBe(0)
    expect(p.tax_total).toBe(0)
    expect(p.client_total).toBe(p.client_air)
    expect(p.fet_on).toBe(false)
    expect(p.fet_override).toBe('auto')
  })

  it('fet_override off drops FET from client total', () => {
    const base = buildOfferQuotePreview(
      {
        offer_id: 'o1',
        operator_name: 'Pax Co',
        tail: 'N6209X',
        price_net: 7000,
        time_to_position_min: 150,
        quick_turn_min: 40,
        live_leg_min: 90,
        fee_scope: 'aircraft_and_fees',
        mtow_lbs: 10495,
        payload_kind: 'pax',
        margin_pct: 15,
        segment_count: 2,
        pax_count: 1,
      },
      TEST_TAX_RATES_2026,
      0,
    )
    expect(base.fet_total).toBeGreaterThan(0)
    expect(base.fet_on).toBe(true)

    const waived = buildOfferQuotePreview(
      {
        offer_id: 'o1',
        operator_name: 'Pax Co',
        tail: 'N6209X',
        price_net: 7000,
        time_to_position_min: 150,
        quick_turn_min: 40,
        live_leg_min: 90,
        fee_scope: 'aircraft_and_fees',
        mtow_lbs: 10495,
        payload_kind: 'pax',
        margin_pct: 15,
        segment_count: 2,
        pax_count: 1,
        fet_override: 'off',
      },
      TEST_TAX_RATES_2026,
      0,
    )
    expect(waived.fet_override).toBe('off')
    expect(waived.fet_on).toBe(false)
    expect(waived.fet_total).toBe(0)
    expect(waived.client_total).toBe(waived.client_air)
    expect(waived.client_total).toBeLessThan(base.client_total)
  })
})
