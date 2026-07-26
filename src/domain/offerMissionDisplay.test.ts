import { describe, expect, it } from 'vitest'
import {
  buildOfferMissionDisplay,
  isRoundTripLane,
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
      parsePayloadSummary('2 pax + standard tooling (12×12×12 @ 50 lb)'),
    ).toEqual({
      passengers: '2 passengers',
      cargo: 'standard tooling (12×12×12 @ 50 lb)',
    })
    expect(parsePayloadSummary('cargo only · 3 boxes')).toMatchObject({
      passengers: 'None (cargo only)',
    })
  })

  it('builds labeled mission display', () => {
    const d = buildOfferMissionDisplay({
      lane: 'KCAK→KHPN',
      payload_summary: '2 pax + standard tooling (12x12x12 @ 50 lb)',
      ready_label: 'ASAP',
    })
    expect(d.departure?.icao).toBe('KCAK')
    expect(d.arrival?.icao).toBe('KHPN')
    expect(d.passengers).toBe('2 passengers')
    expect(d.cargo).toMatch(/standard tooling/i)
    expect(d.ready).toBe('ASAP')
  })
})
