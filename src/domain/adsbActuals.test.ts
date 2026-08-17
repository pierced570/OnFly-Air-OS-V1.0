import { describe, expect, it } from 'vitest'
import type { AdsbPosition } from '@/adapters/adsb'
import type { ChainLeg } from '@/domain/etaChain'
import {
  adsbUpdatesForChain,
  destDwellComplete,
  icaoMatch,
  proposeAdsbActuals,
} from './adsbActuals'

function adsb(over: Partial<AdsbPosition>): AdsbPosition {
  return {
    tail: 'N175CA',
    lat: 41,
    lon: -81,
    alt: 0,
    gs: 0,
    seenAt: '2026-07-28T18:00:00.000Z',
    laddBlocked: false,
    phase: 'on_ground',
    takeoffIsActual: false,
    landingIsActual: false,
    originIcao: 'KCAK',
    destinationIcao: 'KMDW',
    lastTakeoffAt: null,
    lastLandingAt: null,
    ...over,
  }
}

const chain: ChainLeg[] = [
  {
    seq: 1,
    type: 'position',
    branch: 'air',
    label: 'Position',
    event: 'Position',
    from: { lat: 0, lon: 0, icao: 'KBKL' },
    to: { lat: 0, lon: 0, icao: 'KCAK' },
    est_start: '2026-07-28T15:00:00.000Z',
    est_end: '2026-07-28T16:30:00.000Z',
    duration_min: 90,
    duration_key: 'acft_ttp',
    source: 'quoted',
    duration_source: 'quoted',
  },
  {
    seq: 2,
    type: 'air_leg',
    branch: 'air',
    label: 'Live',
    event: 'Wheels Up',
    from: { lat: 0, lon: 0, icao: 'KCAK' },
    to: { lat: 0, lon: 0, icao: 'KMDW' },
    est_start: '2026-07-28T17:00:00.000Z',
    est_end: '2026-07-28T18:15:00.000Z',
    duration_min: 75,
    source: 'quoted',
    duration_source: 'quoted',
  },
]

describe('adsbActuals', () => {
  it('matches ICAO with or without K prefix', () => {
    expect(icaoMatch('KCAK', 'CAK')).toBe(true)
    expect(icaoMatch('KCAK', 'KMDW')).toBe(false)
  })

  it('ignores estimates without actual flags', () => {
    const p = proposeAdsbActuals({
      adsb: adsb({
        lastTakeoffAt: '2026-07-28T17:05:00.000Z',
        takeoffIsActual: false,
      }),
      airFromIcao: 'KCAK',
      airToIcao: 'KMDW',
    })
    expect(p.fromActuals).toBe(false)
    expect(p.takeoffAt).toBeNull()
  })

  it('maps actual off/on to takeoff, air time, and dest landing', () => {
    const p = proposeAdsbActuals({
      adsb: adsb({
        phase: 'on_ground',
        lastTakeoffAt: '2026-07-28T17:05:00.000Z',
        lastLandingAt: '2026-07-28T18:20:00.000Z',
        takeoffIsActual: true,
        landingIsActual: true,
      }),
      airFromIcao: 'KCAK',
      airToIcao: 'KMDW',
      nowIso: '2026-07-28T18:40:00.000Z',
    })
    expect(p.takeoffAt).toBe('2026-07-28T17:05:00.000Z')
    expect(p.destLandingAt).toBe('2026-07-28T18:20:00.000Z')
    expect(p.airTimeMin).toBe(75)
    expect(p.groundTimeDestMin).toBe(20)
    const updates = adsbUpdatesForChain(chain, p)
    expect(updates).toEqual([
      {
        seq: 2,
        actual_start: '2026-07-28T17:05:00.000Z',
        actual_end: '2026-07-28T18:20:00.000Z',
      },
    ])
  })

  it('dest dwell is complete at 10 minutes on ground', () => {
    expect(
      destDwellComplete('2026-07-28T18:20:00.000Z', '2026-07-28T18:29:00.000Z'),
    ).toBe(false)
    expect(
      destDwellComplete('2026-07-28T18:20:00.000Z', '2026-07-28T18:30:00.000Z'),
    ).toBe(true)
    expect(destDwellComplete(null, '2026-07-28T18:40:00.000Z')).toBe(false)
  })

  it('does not treat an unrelated on-ground airport as origin or dest', () => {
    const p = proposeAdsbActuals({
      adsb: adsb({
        phase: 'on_ground',
        originIcao: 'KMSN',
        destinationIcao: 'KHHG',
        lastLandingAt: '2026-08-12T10:42:00.000Z',
        landingIsActual: true,
        lastTakeoffAt: '2026-08-12T10:00:00.000Z',
        takeoffIsActual: true,
      }),
      airFromIcao: 'KCLT',
      airToIcao: 'KICT',
    })
    expect(p.fromActuals).toBe(false)
    expect(p.originArrivalAt).toBeNull()
    expect(p.destLandingAt).toBeNull()
    expect(p.takeoffAt).toBeNull()
  })

  it('treats positioning takeoff+landing into origin as origin arrival, not dest', () => {
    const p = proposeAdsbActuals({
      adsb: adsb({
        phase: 'on_ground',
        originIcao: 'KMSN',
        destinationIcao: 'KCLT',
        lastTakeoffAt: '2026-08-17T12:00:00.000Z',
        lastLandingAt: '2026-08-17T14:50:00.000Z',
        takeoffIsActual: true,
        landingIsActual: true,
      }),
      airFromIcao: 'KCLT',
      airToIcao: 'KICT',
    })
    expect(p.originArrivalAt).toBe('2026-08-17T14:50:00.000Z')
    expect(p.destLandingAt).toBeNull()
    expect(p.takeoffAt).toBeNull()
  })

  it('treats pre-takeoff landing at origin as arrived origin', () => {
    const p = proposeAdsbActuals({
      adsb: adsb({
        phase: 'on_ground',
        originIcao: 'KBKL',
        destinationIcao: 'KCAK',
        lastLandingAt: '2026-07-28T16:25:00.000Z',
        landingIsActual: true,
        lastTakeoffAt: null,
        takeoffIsActual: false,
      }),
      airFromIcao: 'KCAK',
      airToIcao: 'KMDW',
    })
    expect(p.originArrivalAt).toBe('2026-07-28T16:25:00.000Z')
    expect(p.destLandingAt).toBeNull()
    const updates = adsbUpdatesForChain(chain, p)
    expect(updates).toContainEqual({
      seq: 1,
      actual_end: '2026-07-28T16:25:00.000Z',
    })
  })

  it('still maps actuals when phase is no_data (LADD / blocked track)', () => {
    const p = proposeAdsbActuals({
      adsb: adsb({
        phase: 'no_data',
        laddBlocked: true,
        lat: 0,
        lon: 0,
        lastTakeoffAt: '2026-07-28T17:05:00.000Z',
        lastLandingAt: '2026-07-28T18:20:00.000Z',
        takeoffIsActual: true,
        landingIsActual: true,
      }),
      airFromIcao: 'KCAK',
      airToIcao: 'KMDW',
      nowIso: '2026-07-28T18:40:00.000Z',
    })
    expect(p.fromActuals).toBe(true)
    expect(p.takeoffAt).toBe('2026-07-28T17:05:00.000Z')
    expect(p.destLandingAt).toBe('2026-07-28T18:20:00.000Z')
  })
})
