import { describe, expect, it } from 'vitest'
import {
  buildDispatchDrawers,
  drawerForTripState,
  exclusiveDrawerForTrip,
} from './dispatchCenter'

describe('dispatchCenter', () => {
  it('maps exclusive drawers (one stage per trip)', () => {
    expect(drawerForTripState('quoted_hard')).toBe('quotes')
    expect(drawerForTripState('booked')).toBe('approved')
    expect(drawerForTripState('in_progress')).toBe('tracking')
    expect(
      exclusiveDrawerForTrip({ state: 'offers_out', offers: [] }),
    ).toBe('offers')
    expect(
      exclusiveDrawerForTrip({
        state: 'offers_out',
        offers: [{ state: 'quoted' }],
      }),
    ).toBe('submitted_quotes')
    expect(
      exclusiveDrawerForTrip({
        state: 'offers_out',
        offers: [{ state: 'pinged' }],
      }),
    ).toBe('offers')
    expect(exclusiveDrawerForTrip({ state: 'quoted_hard' })).toBe('quotes')
    expect(exclusiveDrawerForTrip({ state: 'booked' })).toBe('approved')
  })

  it('never places the same trip in two drawers', () => {
    const buckets = buildDispatchDrawers({
      requests: [],
      trips: [
        {
          id: 't-quoted',
          ref: 1,
          code: 'QQ001',
          lane: 'KCAK→KHPN',
          state: 'offers_out',
          client_name: 'Acme',
          legs: [],
          offers: [
            {
              id: 'o1',
              operator_name: 'Alpha',
              state: 'pinged',
              magic_token: 'a',
            },
            {
              id: 'o2',
              operator_name: 'Charlie Jets',
              state: 'quoted',
              price_net: 5000,
              type_name: 'Citation CJ3',
              tail: 'N9ZZ',
              magic_token: 'c',
            },
          ],
        },
        {
          id: 't-hard',
          ref: 2,
          lane: 'KCLE→KORD',
          state: 'quoted_hard',
          legs: [],
          offers: [
            {
              id: 'oh',
              operator_name: 'Beta',
              state: 'quoted',
              price_net: 4000,
              magic_token: 'h',
            },
          ],
        },
      ],
    })

    // Quoted offers_out lives ONLY in submitted_quotes
    expect(buckets.offers.find((c) => c.trip_id === 't-quoted' || c.id === 't-quoted')).toBeUndefined()
    expect(buckets.submitted_quotes).toHaveLength(1)
    expect(buckets.submitted_quotes[0]?.id).toBe('t-quoted')
    expect(buckets.submitted_quotes[0]?.recipients).toHaveLength(1)
    expect(buckets.submitted_quotes[0]?.recipients?.[0]?.name).toBe(
      'Charlie Jets',
    )
    expect(buckets.submitted_quotes[0]?.recipients?.[0]?.quote_facts?.tail).toBe(
      'N9ZZ',
    )

    // Hard quote lives ONLY in quotes — not also submitted_quotes
    expect(buckets.quotes).toHaveLength(1)
    expect(buckets.quotes[0]?.id).toBe('t-hard')
    expect(
      buckets.submitted_quotes.find((c) => c.trip_id === 't-hard' || c.id === 't-hard'),
    ).toBeUndefined()

    const allTripIds = [
      ...buckets.offers,
      ...buckets.submitted_quotes,
      ...buckets.quotes,
      ...buckets.approved,
      ...buckets.tracking,
    ].map((c) => c.trip_id ?? c.id)
    expect(new Set(allTripIds).size).toBe(allTripIds.length)
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
    expect(buckets.approved[0]?.deletable).toBe(false)
    expect(buckets.approved[0]?.code).toBe('AB123')
    expect(buckets.approved[0]?.meta).toContain('Pilatus PC-12')
    expect(buckets.approved[0]?.booking).toMatchObject({
      operator_name: 'Charlie Jets',
      type_name: 'Pilatus PC-12',
      tail: 'N450CJ',
      client_total: 6000,
      po: 'PO-9001',
    })
    expect(buckets.quotes).toHaveLength(1)
    expect(buckets.quotes[0]?.approvable).toBe(true)
    expect(buckets.quotes[0]?.approve_offer_id).toBe('o-q')
    expect(buckets.tracking).toHaveLength(1)
    expect(buckets.tracking[0]?.deletable).toBe(false)
    expect(buckets.tracking[0]?.code).toBe('T-5')
    expect(buckets.tracking[0]?.meta).toBe('Live')
  })

  it('hides a request once a trip claims it (exclusive handoff)', () => {
    const buckets = buildDispatchDrawers({
      requests: [
        {
          id: 'r-claimed',
          ref: 42,
          lane: 'KCAK→KHPN',
          summary: '1 skid',
          source: 'portal',
          status: 'in_review',
          client_name: 'Acme',
        },
        {
          id: 'r-open',
          ref: 43,
          lane: 'KCLE→KORD',
          summary: '2 pax',
          source: 'scratchpad',
          status: 'submitted',
        },
      ],
      trips: [
        {
          id: 't-from-r',
          ref: 10,
          lane: 'KCAK→KHPN',
          state: 'offers_out',
          request_id: 'r-claimed',
          client_name: 'Acme',
          legs: [],
          offers: [],
        },
      ],
    })
    expect(buckets.requests.map((c) => c.id)).toEqual(['r-open'])
    expect(buckets.offers).toHaveLength(1)
    expect(buckets.offers[0]?.id).toBe('t-from-r')
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

  it('buckets offers without quotes; waiting replies only', () => {
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
    expect(buckets.offers).toHaveLength(1)
    expect(buckets.offers[0]?.approvable).toBe(false)
    expect(buckets.offers[0]?.title).toBe('PSA Airlines · KCAK→KMDW')
    expect(buckets.offers[0]?.recipients).toHaveLength(2)
    expect(buckets.submitted_quotes).toHaveLength(0)
    expect(buckets.quotes[0]?.state).toBe('quoted_hard')
    expect(buckets.approved).toHaveLength(1)
    expect(buckets.tracking[0]?.href).toContain('drawer=tracking')
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
    expect(buckets.offers[0]?.code).toBe('ZZ007')
    expect(buckets.offers[0]?.meta).toBeNull()
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
