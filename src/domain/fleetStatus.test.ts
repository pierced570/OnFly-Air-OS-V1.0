import { describe, expect, it } from 'vitest'
import {
  deriveFleetStatus,
  deriveRestChip,
  radarRankPenalty,
} from './fleetStatus'

describe('fleetStatus rest chips', () => {
  it('moving aircraft → rest clock running', () => {
    expect(
      deriveRestChip({ gs: 180, lastFlewAt: new Date().toISOString() }),
    ).toBe('rest_clock_running')
  })

  it('grounded 12h since last flew → likely rested', () => {
    const last = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
    expect(deriveRestChip({ gs: 0, lastFlewAt: last })).toBe('likely_rested')
  })

  it('LADD blocked → unknown', () => {
    expect(deriveRestChip({ gs: 0, lastFlewAt: null, laddBlocked: true })).toBe(
      'unknown',
    )
  })

  it('in-position + rested ranks better than airborne', () => {
    const now = new Date()
    const rested = deriveFleetStatus({
      position: {
        tail: 'N1',
        lat: 41.08,
        lon: -81.52,
        alt: 0,
        gs: 0,
        seenAt: now.toISOString(),
        lastFlewAt: new Date(now.getTime() - 12 * 3600 * 1000).toISOString(),
      },
      base: { lat: 41.08, lon: -81.52, icao: 'KCAK' },
      now,
    })
    const airborne = deriveFleetStatus({
      position: {
        tail: 'N2',
        lat: 41.5,
        lon: -82,
        alt: 9000,
        gs: 200,
        seenAt: now.toISOString(),
        lastFlewAt: now.toISOString(),
      },
      base: { lat: 41.08, lon: -81.52, icao: 'KCAK' },
      now,
    })
    expect(rested.inPositionOfBase).toBe(true)
    expect(rested.rest).toBe('likely_rested')
    expect(radarRankPenalty(rested)).toBeLessThan(radarRankPenalty(airborne))
  })
})
