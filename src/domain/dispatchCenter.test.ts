import { describe, expect, it } from 'vitest'
import { buildDispatchDrawers, drawerForTripState } from './dispatchCenter'

describe('dispatchCenter', () => {
  it('maps trip states to drawers (offers ≠ client quotes)', () => {
    expect(drawerForTripState('offers_out')).toBe('offers')
    expect(drawerForTripState('quoted_hard')).toBe('quotes')
    expect(drawerForTripState('quoted_estimated')).toBe('quotes')
    expect(drawerForTripState('booked')).toBe('approved')
    expect(drawerForTripState('in_progress')).toBe('tracking')
    expect(drawerForTripState('closed')).toBeNull()
  })

  it('buckets inbound and trip cards', () => {
    const buckets = buildDispatchDrawers({
      intake: [
        {
          id: 'i1',
          channel: 'email',
          from: 'ops@x.com',
          subject: 'Need lift',
          extracted: { origin_text: 'KCAK', destination_text: 'KMDW' },
        },
      ],
      requests: [
        {
          id: 'r1',
          ref: 12,
          lane: 'KCVG→KHPN',
          summary: '2 pax',
          source: 'portal',
          status: 'submitted',
        },
      ],
      trips: [
        {
          id: 't1',
          ref: 1,
          lane: 'KCAK→KMDW',
          state: 'offers_out',
          legs: [],
          offers: [{ state: 'pinged' }, { state: 'quoted' }],
        },
        {
          id: 't2',
          ref: 2,
          lane: 'KCLE→KORD',
          state: 'quoted_hard',
          legs: [],
        },
        {
          id: 't3',
          ref: 3,
          lane: 'KDFW→KICT',
          state: 'booked',
          legs: [{ status: 'pending' }],
        },
        {
          id: 't4',
          ref: 4,
          lane: 'KATL→KMIA',
          state: 'in_progress',
          legs: [{ status: 'done' }, { status: 'active' }],
        },
      ],
    })
    expect(buckets.requests).toHaveLength(2)
    expect(buckets.offers[0]?.href).toContain('/offers')
    expect(buckets.quotes[0]?.state).toBe('quoted_hard')
    expect(buckets.approved).toHaveLength(1)
    expect(buckets.tracking[0]?.href).toContain('/chat/')
  })
})
