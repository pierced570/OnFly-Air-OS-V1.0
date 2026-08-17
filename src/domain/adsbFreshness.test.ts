import { describe, expect, it } from 'vitest'
import {
  adsbFixIsFresh,
  adsbIsLiveLock,
  faFlightLooksAirborne,
  pickFaFlightForTrack,
} from './adsbFreshness'

const now = Date.parse('2026-08-17T13:30:00.000Z')

describe('adsb freshness', () => {
  it('treats a 20-minute-old fix as live and a 5-day-old fix as not', () => {
    expect(adsbIsLiveLock('2026-08-17T13:15:00.000Z', now)).toBe(true)
    expect(adsbFixIsFresh('2026-08-12T10:42:00.000Z', now, 6 * 60)).toBe(false)
    expect(adsbIsLiveLock('2026-08-12T10:42:00.000Z', now)).toBe(false)
  })
})

describe('pickFaFlightForTrack', () => {
  it('prefers an en-route flight over a completed hop listed first', () => {
    const flights = [
      {
        status: 'Arrived',
        actual_off: '2026-08-12T09:00:00.000Z',
        actual_on: '2026-08-12T10:42:00.000Z',
        last_position: { timestamp: '2026-08-12T10:40:00.000Z' },
      },
      {
        status: 'En Route',
        actual_off: '2026-08-17T13:00:00.000Z',
        actual_on: null,
        last_position: { timestamp: '2026-08-17T13:28:00.000Z' },
      },
    ]
    const pick = pickFaFlightForTrack(flights, { seed: false, nowMs: now })
    expect(pick?.status).toBe('En Route')
  })

  it('uses a same-day arrival when nothing is airborne', () => {
    const flights = [
      {
        status: 'Scheduled',
        actual_off: null,
        actual_on: null,
      },
      {
        status: 'Arrived',
        actual_off: '2026-08-17T11:00:00.000Z',
        actual_on: '2026-08-17T12:10:00.000Z',
      },
    ]
    expect(
      pickFaFlightForTrack(flights, { seed: false, nowMs: now })?.actual_on,
    ).toBe('2026-08-17T12:10:00.000Z')
  })

  it('does not treat a taxi-out without on as arrived', () => {
    expect(
      faFlightLooksAirborne({
        status: 'Taxiing',
        actual_off: '2026-08-17T13:20:00.000Z',
        actual_on: null,
      }),
    ).toBe(true)
  })

  it('ignores a days-old completed hop for live track', () => {
    const pick = pickFaFlightForTrack(
      [
        {
          status: 'Arrived',
          actual_off: '2026-08-12T09:00:00.000Z',
          actual_on: '2026-08-12T10:42:00.000Z',
          last_position: { timestamp: '2026-08-12T10:40:00.000Z' },
        },
      ],
      { seed: false, nowMs: now },
    )
    expect(pick).toBeUndefined()
  })
})
