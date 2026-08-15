import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  DEFAULT_DEST_HANDOFF_MIN,
  DEFAULT_QUICK_TURN_MIN,
  buildDeskOfferQuoteTimeline,
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

  it('exposes operator reference placeholders', async () => {
    const {
      REFERENCE_TTP_MIN,
      REFERENCE_LIVE_LEG_MIN,
      DEFAULT_QUICK_TURN_MIN: turn,
    } = await import('./offerQuoteTiming')
    expect(REFERENCE_TTP_MIN).toBe(90)
    expect(turn).toBe(40)
    expect(REFERENCE_LIVE_LEG_MIN).toBe(75)
    expect(hrsMinsFromTotal(REFERENCE_TTP_MIN)).toEqual({
      hours: 1,
      minutes: 30,
    })
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

  it('builds desk AT PICKUP → DELIVERED timeline with handoff', () => {
    const now = DateTime.utc(2026, 7, 26, 13, 0, 0) // 09:00 EDT
    const tl = buildDeskOfferQuoteTimeline({
      lane: 'KCAK→KHPN',
      nowUtc: now,
      timeToPositionMin: 90,
      quickTurnMin: 40,
      liveLegMin: 75,
      destHandoffMin: DEFAULT_DEST_HANDOFF_MIN,
    })
    expect(tl.milestones.map((m) => m.key)).toEqual([
      'at_pickup',
      'wheels_up',
      'landing',
      'delivered',
    ])
    expect(tl.milestones[0]!.clock).toBe('10:30 AM')
    expect(tl.milestones[1]!.clock).toBe('11:10 AM')
    expect(tl.milestones[2]!.clock).toBe('12:25 PM')
    expect(tl.milestones[3]!.clock).toBe('12:40 PM')
    expect(tl.deliversBadge).toBe('Delivers ~12:40 PM')
    expect(tl.chainHint).toMatch(/TTP 1h 30m/)
    expect(tl.chainHint).toMatch(/handoff 0h 15m/)
  })
})
