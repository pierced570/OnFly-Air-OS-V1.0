import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  DEFAULT_QUICK_TURN_MIN,
  computeOfferQuoteTiming,
  hrsMinsFromTotal,
  parseLaneAirports,
  totalMinutesFromHrsMins,
} from './offerQuoteTiming'

describe('offerQuoteTiming', () => {
  it('parses first lane pair', () => {
    expect(parseLaneAirports('KCAK→KMDW')).toEqual({
      originIcao: 'KCAK',
      destIcao: 'KMDW',
    })
    expect(parseLaneAirports('KCVG→KHPN · KHPN→KCVG').originIcao).toBe('KCVG')
  })

  it('round-trips hrs/mins', () => {
    expect(totalMinutesFromHrsMins({ hours: 1, minutes: 30 })).toBe(90)
    expect(hrsMinsFromTotal(75)).toEqual({ hours: 1, minutes: 15 })
  })

  it('chains TTP → quick turn → live with Zulu + local', () => {
    const now = DateTime.utc(2026, 7, 26, 18, 0, 0)
    const t = computeOfferQuoteTiming({
      lane: 'KCAK→KMDW',
      nowUtc: now,
      timeToPositionMin: 90,
      quickTurnMin: DEFAULT_QUICK_TURN_MIN,
      liveLegMin: 75,
    })
    // 18:00Z + 90 = 19:30Z at origin
    expect(t.positionAtOrigin.zulu).toBe('19:30 Z')
    // +40 = 20:10Z ETD
    expect(t.etd.zulu).toBe('20:10 Z')
    // +75 = 21:25Z dest
    expect(t.destEta.zulu).toBe('21:25 Z')
    expect(t.originIcao).toBe('KCAK')
    expect(t.destIcao).toBe('KMDW')
    expect(t.positionAtOrigin.local).toBeTruthy()
    expect(t.destEta.local).toBeTruthy()
  })
})
