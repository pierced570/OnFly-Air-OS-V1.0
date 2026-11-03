import { describe, expect, it } from 'vitest'
import { buildPortalTripQuoteBundle } from './portalTripQuotes'

describe('buildPortalTripQuoteBundle', () => {
  it('returns null without a hard quote', () => {
    expect(
      buildPortalTripQuoteBundle({
        lane: 'KSAN→KLGA',
        hard_quote: null,
      }),
    ).toBeNull()
  })

  it('builds multi-option cards + accept href for pending quotes', () => {
    const bundle = buildPortalTripQuoteBundle({
      lane: 'KSAN→KLGA',
      code: 'T-2402',
      ref: 2402,
      offers: [
        {
          id: 'off-a',
          state: 'quoted',
          type_name: 'Citation CJ3',
          time_to_position_min: 90,
          quick_turn_min: 45,
          live_leg_min: 280,
          replied_at: '2026-11-03T18:00:00.000Z',
        },
        {
          id: 'off-b',
          state: 'quoted',
          type_name: 'Hawker 800XP',
          time_to_position_min: 120,
          quick_turn_min: 45,
          live_leg_min: 260,
          replied_at: '2026-11-03T18:00:00.000Z',
        },
      ],
      hard_quote: {
        total: 42000,
        accept_token: 'tok-abc',
        sent_at: '2026-11-03T18:05:00.000Z',
        payload_kind: 'cargo',
        options: [
          {
            offer_id: 'off-a',
            label: 'Option A',
            client_total: 38000,
            type_name: 'Citation CJ3',
            time_to_position_min: 90,
            quick_turn_min: 45,
            live_leg_min: 280,
          },
          {
            offer_id: 'off-b',
            label: 'Option B',
            client_total: 42000,
            type_name: 'Hawker 800XP',
            time_to_position_min: 120,
            quick_turn_min: 45,
            live_leg_min: 260,
          },
        ],
      },
    })
    expect(bundle?.hasOptions).toBe(true)
    expect(bundle?.options).toHaveLength(2)
    expect(bundle?.acceptHref).toBe('/accept/tok-abc')
    expect(bundle?.title.length).toBeGreaterThan(3)
    expect(bundle?.options[0]?.price).toBe(38000)
    expect(bundle?.options[1]?.aircraft_type).toMatch(/Hawker/)
  })
})
