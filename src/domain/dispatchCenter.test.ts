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

  it('labels Call pad requests distinctly', () => {
    const buckets = buildDispatchDrawers({
      requests: [
        {
          id: 'r-pad',
          ref: 99,
          lane: 'KCKB→KDFW',
          summary: '2 pax · ASAP',
          source: 'call_pad',
          status: 'submitted',
        },
      ],
      trips: [],
    })
    expect(buckets.requests[0]?.subtitle).toMatch(/^Call pad ·/)
  })

  it('buckets inbound, trip cards, recipients, and submitted quotes', () => {
    const buckets = buildDispatchDrawers({
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
          offers: [
            {
              id: 'o1',
              operator_name: 'Alpha Air',
              state: 'pinged',
              ping_sent_at: '2026-07-26T18:00:00.000Z',
              magic_token: 'tok1',
            },
            {
              id: 'o2',
              operator_name: 'Bravo Charter',
              state: 'available',
              ping_sent_at: '2026-07-26T18:00:00.000Z',
              magic_token: 'tok2',
            },
            {
              id: 'o3',
              operator_name: 'Charlie Jets',
              state: 'quoted',
              ping_sent_at: '2026-07-26T17:00:00.000Z',
              magic_token: 'tok3',
              price_net: 5000,
              time_to_position_min: 60,
              live_leg_min: 90,
              fee_scope: 'aircraft_and_fees',
              tail: 'N9ZZ',
            },
            {
              id: 'o4',
              operator_name: 'Delta Freight',
              state: 'unavailable',
              ping_sent_at: '2026-07-26T18:00:00.000Z',
              magic_token: 'tok4',
            },
          ],
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
    expect(buckets.requests).toHaveLength(1)
    expect(buckets.offers[0]?.href).toContain('/offers')
    expect(buckets.offers[0]?.recipients).toHaveLength(4)
    expect(buckets.offers[0]?.recipients?.find((r) => r.name === 'Alpha Air'))
      .toMatchObject({
        status: 'awaiting',
        status_label: 'Sent — awaiting reply',
        href: '/offer/tok1',
      })
    expect(
      buckets.offers[0]?.recipients?.find((r) => r.name === 'Alpha Air')
        ?.sent_label,
    ).toMatch(/^Sent @ /)
    expect(buckets.offers[0]?.recipients?.find((r) => r.name === 'Charlie Jets'))
      .toMatchObject({
        status: 'quote_submitted',
        status_label: 'Quote submitted',
      })
    expect(buckets.offers[0]?.recipients?.find((r) => r.name === 'Bravo Charter'))
      .toMatchObject({
        status: 'yes',
        status_label: 'Accepted (Yes)',
      })
    expect(buckets.offers[0]?.recipients?.find((r) => r.name === 'Delta Freight'))
      .toMatchObject({
        status: 'no',
        status_label: 'Declined (No)',
      })
    expect(buckets.submitted_quotes).toHaveLength(1)
    expect(buckets.submitted_quotes[0]?.title).toContain('Charlie Jets')
    expect(buckets.submitted_quotes[0]?.title).toContain('Quote submitted')
    expect(buckets.quotes[0]?.state).toBe('quoted_hard')
    expect(buckets.approved).toHaveLength(1)
    expect(buckets.tracking[0]?.href).toContain('/trips/')
  })
})
