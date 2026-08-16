import { describe, expect, it } from 'vitest'
import {
  CLIENT_QUOTE_TAXES_NOTE,
  buildChangeRequestMailto,
  buildCharterMissionChips,
  buildLogisticsQuoteOption,
  deskRankLabels,
  finalizeLogisticsQuoteOptions,
  formatLiveLeg,
  formatTtpFromGo,
  formatTurnLoad,
  logisticsQuoteTitle,
} from './clientLogisticsQuote'

describe('clientLogisticsQuote', () => {
  it('builds titled logistics request and option lines', () => {
    const title = logisticsQuoteTitle('KCAK → KHPN')
    expect(title).toContain('→')
    expect(title).toMatch(/CAK/)
    expect(title).toMatch(/HPN/)

    const opt = buildLogisticsQuoteOption({
      offer_id: 'o1',
      label: 'Option A',
      option_index: 0,
      type_name: 'Citation CJ3',
      time_to_position_min: 90,
      quick_turn_min: 40,
      live_leg_min: 75,
      client_total: 5625,
      lane: 'KCAK → KHPN',
    })
    expect(opt.aircraft_type).toBe('Citation CJ3')
    expect(opt.option_number_label).toBe('Option 1')
    expect(opt.price).toBe(5625)
    expect(opt.taxes_fees_note).toBe(CLIENT_QUOTE_TAXES_NOTE)
    expect(opt).not.toHaveProperty('tail')
    expect(opt.position_eta.duration).toBe('1h 30m')
    expect(opt.etd.duration).toBe('0h 40m')
    expect(opt.arrival_eta.duration).toBe('1h 15m')
    expect(opt.milestones).toHaveLength(4)
    expect(opt.milestones.map((m) => m.key)).toEqual([
      'at_pickup',
      'wheels_up',
      'landing',
      'delivered',
    ])
    expect(opt.delivered_summary).toMatch(/Delivered to your team/)
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

  it('flags fastest and cheapest for desk — no Recommended badge', () => {
    const a = buildLogisticsQuoteOption({
      offer_id: 'fast',
      label: 'A',
      option_index: 0,
      type_name: 'Cessna 310',
      time_to_position_min: 90,
      quick_turn_min: 40,
      live_leg_min: 75,
      client_total: 12658,
      lane: 'KCAK → KHPN',
      goAtIso: '2026-07-26T13:00:00.000Z',
    })
    const b = buildLogisticsQuoteOption({
      offer_id: 'cheap',
      label: 'B',
      option_index: 1,
      type_name: 'Aerostar 600',
      time_to_position_min: 130,
      quick_turn_min: 30,
      live_leg_min: 80,
      client_total: 10634,
      lane: 'KCAK → KHPN',
      goAtIso: '2026-07-26T13:00:00.000Z',
    })
    const ranked = finalizeLogisticsQuoteOptions([a, b])
    expect(ranked[0]!.fastest).toBe(true)
    expect(ranked[0]!.cheapest).toBe(false)
    expect(ranked[1]!.fastest).toBe(false)
    expect(ranked[1]!.cheapest).toBe(true)
    expect(deskRankLabels(ranked[0]!)).toEqual(['Fastest'])
    expect(deskRankLabels(ranked[1]!)).toEqual(['Cheapest'])
    expect(ranked[0]!.aircraft_blurb).toBe('Aircraft option')
    expect(ranked[1]!.aircraft_blurb).toBe('Aircraft option')
  })

  it('leaves desk rank flags off for a single option', () => {
    const only = buildLogisticsQuoteOption({
      offer_id: 'solo',
      label: 'A',
      type_name: 'Cessna 310',
      time_to_position_min: 90,
      quick_turn_min: 40,
      live_leg_min: 75,
      client_total: 10000,
      lane: 'KCAK → KHPN',
      goAtIso: '2026-07-26T13:00:00.000Z',
    })
    const ranked = finalizeLogisticsQuoteOptions([only])
    expect(ranked[0]!.fastest).toBe(false)
    expect(ranked[0]!.cheapest).toBe(false)
    expect(deskRankLabels(ranked[0]!)).toEqual([])
  })

  it('builds mission chips from payload summary', () => {
    const chips = buildCharterMissionChips({
      payload_kind: 'cargo',
      payload_summary: '1 pc 48x40x60 in 800 lb',
      ready_label: 'ASAP',
    })
    expect(chips.map((c) => c.label)).toEqual(
      expect.arrayContaining([
        'Cargo only',
        '1 pc',
        '48x40x60 in',
        '800 lb',
        'Ready ASAP',
      ]),
    )
  })

  it('hard quote shows Standard tools without dims for standard tooling', () => {
    const chips = buildCharterMissionChips({
      payload_kind: 'cargo',
      payload_summary: 'standard tooling (12×12×12 @ 75 lb)',
      ready_label: 'ASAP',
    })
    const labels = chips.map((c) => c.label)
    expect(labels).toContain('Standard tools')
    expect(labels).toContain('Cargo only')
    expect(labels).toContain('Ready ASAP')
    expect(labels.some((l) => /12/.test(l))).toBe(false)
    expect(labels.some((l) => /75/.test(l))).toBe(false)
    expect(labels.some((l) => /pc/i.test(l))).toBe(false)
  })

  it('hard quote Standard tools chip for pax + assumed operator tooling line', () => {
    const chips = buildCharterMissionChips({
      payload_kind: 'both',
      payload_summary: '2 pax + standard small cargo/tools (12×12×12 @ 75 lb)',
    })
    const labels = chips.map((c) => c.label)
    expect(labels).toContain('Standard tools')
    expect(labels).toContain('Cargo + passenger')
    expect(labels.join(' ')).not.toMatch(/12\s*[x×]/i)
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
