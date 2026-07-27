import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/adapters/adsb', () => ({
  isRealAdsbEnabled: () => false,
  createAdsbAdapter: () => ({
    positions: async (tails: string[]) =>
      tails.map((tail) => ({
        tail,
        lat: 0,
        lon: 0,
        alt: 0,
        gs: 0,
        seenAt: new Date(0).toISOString(),
        laddBlocked: true,
        phase: 'no_data' as const,
      })),
    seedLastKnown: async (tails: string[]) =>
      tails.map((tail) => ({
        tail,
        lat: 0,
        lon: 0,
        alt: 0,
        gs: 0,
        seenAt: new Date(0).toISOString(),
        laddBlocked: true,
        phase: 'no_data' as const,
      })),
    setMovementAlert: async (tail: string, enabled: boolean) => ({
      ok: true,
      tail,
      enabled,
      alertId: enabled ? `mock-${tail}` : null,
    }),
  }),
}))

vi.mock('@/domain/airports', () => ({
  lookupAirport: (icao: string) =>
    icao === 'KCAK'
      ? { icao: 'KCAK', lat: 40.91, lon: -81.44, name: 'Akron', city: 'Akron', state: 'OH', tz: 'America/New_York' }
      : null,
}))

import { seedRadarLastKnown, setRadarMovementAlert } from './radarSeedFlow'
import {
  _resetRadarTracksForTests,
  getRadarTrack,
  listRadarTracks,
} from './radarTrackingStore'
import { syncWatchedFromFleet, listWatchedTails } from './watchedTailsStore'

describe('radarSeedFlow', () => {
  beforeEach(() => {
    _resetRadarTracksForTests()
    // wipe watched by re-syncing empty then adding
    syncWatchedFromFleet([])
    syncWatchedFromFleet([
      {
        tail: 'N123AB',
        type_name: 'BE58',
        operator_name: 'Test Op',
        operator_id: 'op1',
        base_icao: 'KCAK',
      },
    ])
    expect(listWatchedTails().length).toBeGreaterThan(0)
  })

  it('seeds last-known from base in mock mode', async () => {
    const result = await seedRadarLastKnown(['N123AB'])
    expect(result.requested).toBe(1)
    expect(result.seeded).toBe(1)
    const row = getRadarTrack('N123AB')
    expect(row?.lastKnown?.lat).toBeCloseTo(40.91, 1)
    expect(row?.lastKnown?.phase).toBe('on_ground')
  })

  it('toggles alert tracking on and off', async () => {
    await seedRadarLastKnown(['N123AB'])
    const on = await setRadarMovementAlert('N123AB', true)
    expect(on.ok).toBe(true)
    expect(getRadarTrack('N123AB')?.alertEnabled).toBe(true)
    expect(listRadarTracks().filter((t) => t.alertEnabled)).toHaveLength(1)
    const off = await setRadarMovementAlert('N123AB', false)
    expect(off.ok).toBe(true)
    expect(getRadarTrack('N123AB')?.alertEnabled).toBe(false)
  })
})
