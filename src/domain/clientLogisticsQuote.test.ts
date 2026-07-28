import { describe, expect, it } from 'vitest'
import {
  CLIENT_QUOTE_TAXES_NOTE,
  buildChangeRequestMailto,
  buildLogisticsQuoteOption,
  formatLiveLeg,
  formatTtpFromGo,
  formatTurnLoad,
  logisticsQuoteTitle,
} from './clientLogisticsQuote'

describe('clientLogisticsQuote', () => {
  it('builds titled logistics request and option lines', () => {
    const title = logisticsQuoteTitle('KCAK → KHPN')
    expect(title.startsWith('Logistics Quote Request (')).toBe(true)
    expect(title).toContain('→')

    const opt = buildLogisticsQuoteOption({
      offer_id: 'o1',
      label: 'Option A',
      type_name: 'Citation CJ3',
      time_to_position_min: 90,
      quick_turn_min: 40,
      live_leg_min: 75,
      client_total: 5625,
      lane: 'KCAK → KHPN',
    })
    expect(opt.aircraft_type).toBe('Citation CJ3')
    expect(opt.price).toBe(5625)
    expect(opt.taxes_fees_note).toBe(CLIENT_QUOTE_TAXES_NOTE)
    expect(opt).not.toHaveProperty('tail')
    expect(opt.position_eta.duration).toBe('1h 30m')
    expect(opt.etd.duration).toBe('0h 40m')
    expect(opt.arrival_eta.duration).toBe('1h 15m')
    expect(opt.position_eta.clock).toMatch(/Z/)
    expect(opt.etd.clock).toMatch(/Z/)
    expect(opt.arrival_eta.clock).toMatch(/Z/)
    expect(formatTtpFromGo(opt.ttp_min, opt.departure_label)).toContain(
      'from Go',
    )
    expect(formatTurnLoad(opt.turn_load_min)).toContain('loading and turn')
    expect(
      formatLiveLeg(
        opt.live_leg_min,
        opt.departure_label,
        opt.destination_label,
      ),
    ).toContain('Live leg time')
  })

  it('builds change-request mailto', () => {
    const href = buildChangeRequestMailto({
      lane: 'KCAK → KHPN',
      optionLabel: 'Option A',
      acceptToken: 'abc123',
    })
    expect(href.startsWith('mailto:')).toBe(true)
    expect(href).toContain('Change%20request')
    expect(href).toContain('KCAK')
  })
})
