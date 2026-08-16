import { describe, expect, it } from 'vitest'
import type { AdsbPosition } from '@/adapters/adsb'
import { mergeAdsbPreferRicher } from './useAdsbForTail'

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
    const m = mergeAdsbPreferRicher(prev, next)
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
    expect(mergeAdsbPreferRicher(prev, next).lat).toBe(41)
  })
})
