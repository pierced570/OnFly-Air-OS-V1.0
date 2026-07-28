import { describe, expect, it } from 'vitest'
import { buildDispatchDrawers, drawerForTripState } from './dispatchCenter'

describe('dispatchCenter', () => {
  it('maps trip states to drawers (offers ≠ client quotes)', () => {
    expect(drawerForTripState('offers_out')).toBe('offers')
    expect(drawerForTripState('quoted_hard')).toBe('quotes')
    expect(drawerForTripState('quoted_estimated')).toBe('quotes')
    expect(drawerForTripState('booked')).toBe('approved')
    expect(drawerForTripState('in_progress')).toBe('tracking')
    expect(drawerForTripState('delivered')).toBeNull()
    expect(drawerForTripState('closed')).toBeNull()
  })

  it('approved drawer is booked-only with booking facts for invoice/ETA', () => {
    const buckets = buildDispatchDrawers({
      requests: [],
      trips: [
        {
          id: 't-booked',
          ref: 3,
          code: 'AB123',
          lane: 'KCAK→KHPN',
          state: 'booked',
          client_name: 'Acme Air Cargo',
          po_number: 'PO-9001',
          legs: [{ status: 'pending' }],
          hard_quote: {
            total: 6000,
            options: [
              {
                offer_id: 'o-sel',
                client_total: 6000,
                type_name: 'Pilatus PC-12',
                tail: 'N450CJ',
                operator_name: 'Charlie Jets',
              },
            ],
          },
          offers: [
            {
              id: 'o-sel',
              operator_name: 'Charlie Jets',
              state: 'selected',
              type_name: 'Pilatus PC-12',
              tail: 'N450CJ',
              price_net: 5000,
              magic_token: 'tok',
            },
          ],
        },
        {
          id: 't-hard',
          ref: 4,
          lane: 'KCLE→KORD',
          state: 'quoted_hard',
          legs: [],
          offers: [
            {
              id: 'o-q',
              operator_name: 'Alpha',
              state: 'quoted',
              price_net: 4000,
              magic_token: 'tok2',
            },
          ],
        },
        {
          id: 't-live',
          ref: 5,
          lane: 'KATL→KMIA',
          state: 'in_progress',
          legs: [{ status: 'active' }],
        },
      ],
    })
    expect(buckets.approved).toHaveLength(1)
    expect(buckets.approved[0]?.state).toBe('booked')
    expect(buckets.approved[0]?.approvable).toBe(false)
    expect(buckets.approved[0]?.subtitle).toContain('Approved')
    expect(buckets.approved[0]?.subtitle).toContain('Pilatus PC-12')
    expect(buckets.approved[0]?.subtitle).toContain('N450CJ')
    expect(buckets.approved[0]?.booking).toMatchObject({
      operator_name: 'Charlie Jets',
      type_name: 'Pilatus PC-12',
      tail: 'N450CJ',
      client_total: 6000,
      po: 'PO-9001',
    })
    expect(buckets.approved[0]?.href).toContain('drawer=approved')
    expect(buckets.quotes.some((c) => c.state === 'booked')).toBe(false)
    expect(buckets.quotes).toHaveLength(1)
    expect(buckets.tracking).toHaveLength(1)
    expect(buckets.tracking[0]?.href).toContain('drawer=tracking')
    expect(buckets.tracking[0]?.subtitle).toBe('Live · T-5')
  })

  it('labels Scratchpad requests distinctly and shows client name', () => {
    const buckets = buildDispatchDrawers({
      requests: [
        {
          id: 'r-pad',
          ref: 99,
          lane: 'KCKB→KDFW',
          summary: '2 pax · ASAP',
          source: 'scratchpad',
          status: 'submitted',
          client_name: 'Acme Turbines',
        },
      ],
      trips: [],
    })
    expect(buckets.requests[0]?.title).toBe('R-99 · Acme Turbines · KCKB→KDFW')
    expect(buckets.requests[0]?.subtitle).toMatch(/^Scratchpad ·/)
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
          code: 'PS001',
          lane: 'KCAK→KMDW',
          state: 'offers_out',
          client_name: 'PSA Airlines',
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
    expect(buckets.offers[0]?.href).toContain('/dispatch?drawer=offers&focus=')
    expect(buckets.offers[0]?.title).toBe('PSA Airlines · KCAK→KMDW')
    expect(buckets.offers[0]?.subtitle).toBe('PS001')
    expect(buckets.offers[0]?.subtitle).not.toMatch(/yes|awaiting|quoted/)
    expect(buckets.offers[0]?.recipients).toHaveLength(4)
    expect(buckets.offers[0]?.recipients?.find((r) => r.name === 'Alpha Air'))
      .toMatchObject({
        status: 'awaiting',
        status_label: 'Link ready — not notified',
        href: '/offer/tok1',
        notified: false,
      })
    expect(
      buckets.offers[0]?.recipients?.find((r) => r.name === 'Alpha Air')
        ?.sent_label,
    ).toMatch(/^Link ready @ /)
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
        declined_acked: false,
      })
    expect(buckets.submitted_quotes).toHaveLength(1)
    expect(buckets.submitted_quotes[0]?.title).toContain('Charlie Jets')
    expect(buckets.submitted_quotes[0]?.title).toContain('Quote submitted')
    expect(buckets.quotes[0]?.state).toBe('quoted_hard')
    expect(buckets.approved).toHaveLength(1)
    expect(buckets.approved[0]?.state).toBe('booked')
    expect(buckets.approved[0]?.approvable).toBe(false)
    expect(buckets.approved[0]?.href).toContain('/dispatch?drawer=approved')
    expect(buckets.tracking[0]?.href).toContain('/dispatch?drawer=tracking')
    expect(buckets.tracking[0]?.subtitle).toMatch(/^Live ·/)
    expect(buckets.tracking[0]?.approvable).toBe(false)
  })

  it('shows Client TBD when no client name is known', () => {
    const buckets = buildDispatchDrawers({
      requests: [],
      trips: [
        {
          id: 't-noclient',
          ref: 7,
          code: 'ZZ007',
          lane: 'KCAK→KHPN',
          state: 'offers_out',
          legs: [],
          offers: [],
        },
      ],
    })
    expect(buckets.offers[0]?.title).toBe('Client TBD · KCAK→KHPN')
    expect(buckets.offers[0]?.subtitle).toBe('ZZ007')
  })

  it('collapses acknowledged declines to unavailable', () => {
    const buckets = buildDispatchDrawers({
      requests: [],
      trips: [
        {
          id: 't-ack',
          ref: 9,
          lane: 'KCAK→KHPN',
          state: 'offers_out',
          legs: [],
          offers: [
            {
              id: 'o-no',
              operator_name: 'Tester',
              state: 'unavailable',
              notified_at: '2026-07-26T23:30:00.000Z',
              declined_acked_at: '2026-07-26T23:35:00.000Z',
              magic_token: 'tok-no',
            },
          ],
        },
      ],
    })
    expect(buckets.offers[0]?.recipients?.[0]).toMatchObject({
      name: 'Tester',
      status: 'no',
      status_label: 'unavailable',
      declined_acked: true,
    })
  })
})
