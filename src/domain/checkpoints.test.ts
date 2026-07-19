import { describe, expect, it } from 'vitest'
import {
  dueCheckpoints,
  planCheckpoints,
  type LegForCheckpoint,
} from './checkpoints'

describe('planCheckpoints', () => {
  it('schedules air T-60/T-30/arrival and overdue for air legs', () => {
    const legs: LegForCheckpoint[] = [
      {
        id: 'leg-air',
        seq: 1,
        type: 'air_leg',
        label: 'Air KCAK→KMDW',
        status: 'pending',
        party: 'pilot',
        est_start: '2026-07-18T16:00:00.000Z',
        est_end: '2026-07-18T17:30:00.000Z',
        actual_start: null,
        actual_end: null,
        one_tap_token: 'air-token',
      },
    ]
    const plan = planCheckpoints(legs)
    const kinds = plan.map((p) => p.kind)
    expect(kinds).toEqual(
      expect.arrayContaining(['air_t60', 'air_t30', 'air_arrival', 'overdue']),
    )
    const t60 = plan.find((p) => p.kind === 'air_t60')!
    expect(t60.fire_at).toBe('2026-07-18T15:00:00.000Z')
    expect(t60.one_tap_token).toBe('air-token')
  })

  it('schedules truck T-30/T-5 for offload/driver legs', () => {
    const legs: LegForCheckpoint[] = [
      {
        id: 'leg-off',
        seq: 2,
        type: 'offload',
        label: 'Delivered / POD',
        status: 'pending',
        party: 'driver',
        est_start: '2026-07-18T18:00:00.000Z',
        est_end: '2026-07-18T18:30:00.000Z',
        actual_start: null,
        actual_end: null,
      },
    ]
    const plan = planCheckpoints(legs)
    expect(plan.some((p) => p.kind === 'truck_t30')).toBe(true)
    expect(plan.some((p) => p.kind === 'truck_t5')).toBe(true)
  })

  it('dueCheckpoints returns only unfired past fire_at', () => {
    const plan = planCheckpoints([
      {
        id: 'a',
        seq: 1,
        type: 'air_leg',
        label: 'Air',
        status: 'active',
        party: 'pilot',
        est_start: '2026-07-18T16:00:00.000Z',
        est_end: '2026-07-18T17:00:00.000Z',
        actual_start: null,
        actual_end: null,
      },
    ])
    const due = dueCheckpoints(
      plan,
      '2026-07-18T15:30:00.000Z',
      new Set(),
    )
    expect(due.some((d) => d.kind === 'air_t60')).toBe(true)
    expect(due.some((d) => d.kind === 'air_t30')).toBe(true)
    expect(due.some((d) => d.kind === 'air_arrival')).toBe(false)
  })
})
