import { describe, expect, it } from 'vitest'
import {
  buildOfferMissionBadges,
  buildOfferMissionDisplay,
  isRoundTripLane,
  offerLaneTitle,
  parseLaneAirports,
  parsePayloadSummary,
} from './offerMissionDisplay'

describe('offerMissionDisplay', () => {
  it('parses departure and arrival ICAOs from lane', () => {
    expect(parseLaneAirports('KCAK→KHPN')).toEqual({
      origin: 'KCAK',
      dest: 'KHPN',
      rest: null,
    })
    expect(parseLaneAirports('KCAK->KHPN · KHPN→KCAK')?.rest).toBe(
      'KHPN→KCAK',
    )
  })

  it('detects round-trip lanes for wait-time UI', () => {
    expect(isRoundTripLane('KCAK→KHPN')).toBe(false)
    expect(isRoundTripLane('KCAK→KHPN · KHPN→KCAK')).toBe(true)
  })

  it('splits pax and cargo from mission summary', () => {
    expect(
      parsePayloadSummary('2 pax + standard tooling (12×12×12 @ 75 lb)'),
    ).toEqual({
      passengers: '2 passengers',
      cargo: 'standard tooling (12×12×12 @ 75 lb)',
    })
    expect(parsePayloadSummary('cargo only · 3 boxes')).toMatchObject({
      passengers: 'None (cargo only)',
      cargo: '3 boxes',
    })
  })

  it('shows No cargo submitted when cargo empty; strips A2A ops noise', () => {
    expect(parsePayloadSummary('2 pax · A2A')).toEqual({
      passengers: '2 passengers',
      cargo: 'No cargo submitted',
    })
    expect(parsePayloadSummary('2 passengers · A2A')).toEqual({
      passengers: '2 passengers',
      cargo: 'No cargo submitted',
    })
    expect(parsePayloadSummary('A2A')).toEqual({
      passengers: 'None listed',
      cargo: 'No cargo submitted',
    })
    expect(parsePayloadSummary('')).toEqual({
      passengers: 'None listed',
      cargo: 'No cargo submitted',
    })
    expect(parsePayloadSummary('2 pax')).toEqual({
      passengers: '2 passengers',
      cargo: 'No cargo submitted',
    })
    expect(
      parsePayloadSummary('2 pax · A2A · forklift required · ground courier'),
    ).toEqual({
      passengers: '2 passengers',
      cargo: 'No cargo submitted',
    })
  })

  it('builds labeled mission display', () => {
    const d = buildOfferMissionDisplay({
      lane: 'KCAK→KHPN',
      payload_summary: '2 pax + standard tooling (12x12x12 @ 75 lb)',
      ready_label: 'ASAP',
    })
    expect(d.departure?.icao).toBe('KCAK')
    expect(d.arrival?.icao).toBe('KHPN')
    expect(d.passengers).toBe('2 passengers')
    expect(d.cargo).toMatch(/standard tooling/i)
    expect(d.ready).toBe('ASAP')
  })

  it('builds operator quote header badges and title', () => {
    const badges = buildOfferMissionBadges({
      lane: 'KCAK→KHPN · KHPN→KCAK',
      payload_summary: 'cargo only · 1 skid 48x40x60 @ 800 lb',
      ready_label: 'ASAP',
      nm: 360,
    })
    expect(badges.map((b) => b.label)).toEqual(
      expect.arrayContaining([
        '360 NM',
        '1 PC',
        '48x40x60 IN',
        '800 LB',
        'READY ASAP',
        'ROUNDTRIP',
      ]),
    )
    expect(offerLaneTitle({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo only · 1 skid',
    })).toBe('KCAK → KHPN · cargo only')
  })
})
