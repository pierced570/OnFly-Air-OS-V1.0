import { describe, expect, it } from 'vitest'
import {
  deriveFleetStatus,
  deriveFlightPhase,
  radarRankPenalty,
} from './fleetStatus'

describe('fleetStatus flight phase', () => {
  it('high groundspeed → airborne', () => {
    expect(
      deriveFlightPhase({
        tail: 'N1',
        lat: 41,
        lon: -81,
        alt: 8000,
        gs: 180,
        seenAt: new Date().toISOString(),
      }),
    ).toBe('airborne')
  })

  it('parked → on_ground', () => {
    expect(
      deriveFlightPhase({
        tail: 'N1',
        lat: 41,
        lon: -81,
        alt: 0,
        gs: 0,
        seenAt: new Date().toISOString(),
      }),
    ).toBe('on_ground')
  })

  it('LADD blocked → no_data', () => {
    expect(
      deriveFlightPhase({
        tail: 'N1',
        lat: 41,
        lon: -81,
        alt: 0,
        gs: 0,
        seenAt: new Date().toISOString(),
        laddBlocked: true,
      }),
    ).toBe('no_data')
  })

  it('on-ground near base ranks better than airborne', () => {
    const now = new Date()
    const grounded = deriveFleetStatus({
      position: {
        tail: 'N1',
        lat: 41.08,
        lon: -81.52,
        alt: 0,
        gs: 0,
        seenAt: now.toISOString(),
        lastTakeoffAt: new Date(now.getTime() - 12 * 3600 * 1000).toISOString(),
        lastLandingAt: new Date(now.getTime() - 10 * 3600 * 1000).toISOString(),
        phase: 'on_ground',
      },
      base: { lat: 41.08, lon: -81.52, icao: 'KCAK' },
    })
    const airborne = deriveFleetStatus({
      position: {
        tail: 'N2',
        lat: 41.5,
        lon: -82,
        alt: 9000,
        gs: 200,
        seenAt: now.toISOString(),
        lastTakeoffAt: now.toISOString(),
        lastLandingAt: new Date(now.getTime() - 8 * 3600 * 1000).toISOString(),
        phase: 'airborne',
      },
      base: { lat: 41.08, lon: -81.52, icao: 'KCAK' },
    })
    expect(grounded.inPositionOfBase).toBe(true)
    expect(grounded.phase).toBe('on_ground')
    expect(grounded.lastLandingAt).toBeTruthy()
    expect(radarRankPenalty(grounded)).toBeLessThan(radarRankPenalty(airborne))
  })
})
