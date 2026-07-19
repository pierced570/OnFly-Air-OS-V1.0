import { describe, expect, it } from 'vitest'
import type { ChainLeg } from '@/domain/etaChain'
import {
  applyParsedActualToLegs,
  cascadeRecomputeFromActual,
  materializeChainToLegs,
} from '@/domain/tripLegs'

const sampleChain = (): ChainLeg[] => [
  {
    seq: 1,
    type: 'position',
    branch: 'air',
    label: 'Position to KTEB',
    event: 'In Position',
    from: { lat: 40, lon: -74, icao: 'KCDW' },
    to: { lat: 40.8, lon: -74.1, icao: 'KTEB' },
    est_start: '2026-07-19T14:00:00.000Z',
    est_end: '2026-07-19T14:40:00.000Z',
    duration_min: 40,
    duration_key: 'acft_ttp',
    source: 'assumed',
    duration_source: 'assumed',
  },
  {
    seq: 2,
    type: 'air_leg',
    branch: 'air',
    label: 'Air KTEB→KORD',
    event: 'Wheels Up → Wheels Down',
    from: { lat: 40.8, lon: -74.1, icao: 'KTEB' },
    to: { lat: 41.9, lon: -87.9, icao: 'KORD' },
    est_start: '2026-07-19T15:00:00.000Z',
    est_end: '2026-07-19T17:30:00.000Z',
    duration_min: 150,
    duration_key: 'air_time',
    source: 'assumed',
    duration_source: 'assumed',
  },
  {
    seq: 3,
    type: 'offload',
    branch: 'merged',
    label: 'Offload',
    event: 'Delivered',
    from: { lat: 41.9, lon: -87.9, icao: 'KORD' },
    to: { lat: 41.9, lon: -87.9, icao: 'KORD' },
    est_start: '2026-07-19T17:30:00.000Z',
    est_end: '2026-07-19T18:00:00.000Z',
    duration_min: 30,
    duration_key: 'fbo_transfer',
    source: 'assumed',
    duration_source: 'assumed',
  },
]

describe('tripLegs', () => {
  it('materializes chain into app legs with one-tap tokens', () => {
    const legs = materializeChainToLegs(sampleChain())
    expect(legs).toHaveLength(3)
    expect(legs[0]!.status).toBe('active')
    expect(legs[1]!.type).toBe('air_leg')
    expect(legs[2]!.one_tap_token).toMatch(/^leg-|^del-|^trk-|^air-/)
  })

  it('applies wheels_up to air leg and cascades slip', () => {
    const legs = materializeChainToLegs(sampleChain())
    const late = '2026-07-19T15:25:00.000Z'
    const result = applyParsedActualToLegs(
      legs,
      { kind: 'wheels_up', confidence: 0.95 },
      late,
    )
    expect(result.autoApplied).toBe(true)
    expect(result.appliedSeq).toBe(2)
    const air = result.legs.find((l) => l.seq === 2)!
    expect(air.actual_start).toBe(late)
    const off = result.legs.find((l) => l.seq === 3)!
    // Subsequent est times shift with slip from air leg
    expect(Date.parse(off.est_start!)).toBeGreaterThanOrEqual(
      Date.parse(legs.find((l) => l.seq === 3)!.est_start!),
    )
  })

  it('cascades recompute from one-tap actual_end', () => {
    const legs = materializeChainToLegs(sampleChain())
    const { legs: next, slippedMinutes } = cascadeRecomputeFromActual(legs, 1, {
      actual_end: '2026-07-19T15:00:00.000Z',
    })
    expect(slippedMinutes).toBeGreaterThan(0)
    expect(next[1]!.est_start).not.toBe(legs[1]!.est_start)
  })
})
