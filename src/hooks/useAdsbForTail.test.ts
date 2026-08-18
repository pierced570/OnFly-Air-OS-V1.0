import { describe, expect, it } from 'vitest'
import type { AdsbPosition } from '@/adapters/adsb'
import {
  adsbPollEnabledForState,
  mergeAdsbPreferRicher,
} from './useAdsbForTail'

const NOW = Date.parse('2026-07-15T16:05:00.000Z')

function pos(over: Partial<AdsbPosition>): AdsbPosition {
  return {
    tail: 'N123AB',
    lat: 0,
    lon: 0,
    alt: 0,
    gs: 0,
    seenAt: '2026-07-15T16:00:00.000Z',
    laddBlocked: false,
    phase: 'no_data',
    ...over,
  }
}

describe('adsbPollEnabledForState', () => {
  it('only enables AeroAPI spend for in_progress (dispatched) trips', () => {
    expect(adsbPollEnabledForState('in_progress')).toBe(true)
    expect(adsbPollEnabledForState('booked')).toBe(false)
    expect(adsbPollEnabledForState('quoted_hard')).toBe(false)
    expect(adsbPollEnabledForState('delivered')).toBe(false)
    expect(adsbPollEnabledForState(null)).toBe(false)
  })
})

describe('mergeAdsbPreferRicher', () => {
  it('keeps prior fix when next poll is empty', () => {
    const prev = pos({
      lat: 41.2,
      lon: -84,
      alt: 10000,
      gs: 200,
      phase: 'airborne',
      lastTakeoffAt: '2026-07-15T15:50:00.000Z',
      takeoffIsActual: true,
    })
    const next = pos({ phase: 'no_data', seenAt: '2026-07-15T16:01:00.000Z' })
    const m = mergeAdsbPreferRicher(prev, next, NOW)
    expect(m.lat).toBe(41.2)
    expect(m.phase).toBe('airborne')
    expect(m.takeoffIsActual).toBe(true)
    expect(m.lastTakeoffAt).toBe('2026-07-15T15:50:00.000Z')
  })

  it('prefers live fix over prior', () => {
    const prev = pos({ lat: 40, lon: -80, phase: 'on_ground' })
    const next = pos({
      lat: 41,
      lon: -85,
      alt: 8000,
      gs: 180,
      phase: 'airborne',
      seenAt: '2026-07-15T16:10:00.000Z',
    })
    expect(mergeAdsbPreferRicher(prev, next, NOW).lat).toBe(41)
  })

  it('drops a days-old last-flight seed so the map is not pinned in the wrong state', () => {
    const stale = pos({
      lat: 40.8,
      lon: -85.5,
      phase: 'on_ground',
      seenAt: '2026-08-12T10:42:00.000Z',
    })
    const m = mergeAdsbPreferRicher(
      null,
      stale,
      Date.parse('2026-08-17T13:30:00.000Z'),
    )
    expect(m.phase).toBe('no_data')
    expect(m.lat).toBe(0)
  })
})
