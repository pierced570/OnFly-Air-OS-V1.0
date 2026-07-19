import { describe, expect, it } from 'vitest'
import type { ChainLeg } from '@/domain/etaChain'
import {
  buildPortalEstimates,
  formatApproxHours,
  verticalToPortalBand,
} from '@/domain/portalEstimate'
import type { Candidate } from '@/domain/routing'
import { TEST_TAX_RATES_2026 } from '@/domain/tax'

function leg(
  type: ChainLeg['type'],
  duration_min: number,
  seq: number,
): ChainLeg {
  const t0 = '2026-07-19T12:00:00.000Z'
  return {
    seq,
    type,
    branch: type.startsWith('truck') ? 'truck' : 'air',
    label: type,
    event: type,
    from: { lat: 0, lon: 0, tz: 'UTC' },
    to: { lat: 1, lon: 1, tz: 'UTC' },
    est_start: t0,
    est_end: t0,
    duration_min,
    source: 'assumed',
    duration_source: 'test',
  }
}

function cand(
  partial: Partial<Candidate> & { aircraft_id: string; price: number },
): Candidate {
  const { aircraft_id, price, ...rest } = partial
  return {
    operator_id: 'op',
    operator_name: 'SECRET OP',
    aircraft_id,
    tail: 'N000XX',
    type_name: 'Test',
    cost: price * 0.85,
    price,
    chain: [
      leg('position', 60, 1),
      leg('air_leg', 120, 2),
    ],
    confidence: 0.8,
    needsInfo: [],
    bookingGated: false,
    reasoning: ['secret cost math'],
    eta_end: '2026-07-19T16:00:00.000Z',
    circuit_nm: 400,
    ...rest,
  }
}

describe('portalEstimate', () => {
  it('maps verticals to client bands', () => {
    expect(verticalToPortalBand('sep')).toBe('piston')
    expect(verticalToPortalBand('metp')).toBe('turboprop')
    expect(verticalToPortalBand('vlj_light')).toBe('light_jet')
    expect(verticalToPortalBand('mid_heavy')).toBe('larger')
    expect(verticalToPortalBand('other')).toBeNull()
  })

  it('formats approx hours like desk guestimate copy', () => {
    expect(formatApproxHours(120)).toBe('2 hrs')
    expect(formatApproxHours(60)).toBe('1 hr')
    expect(formatApproxHours(30)).toBe('30 min')
  })

  it('builds class options without operator/cost fields', () => {
    const bundle = buildPortalEstimates(
      [
        cand({
          aircraft_id: 'p1',
          price: 8000,
          chain: [leg('position', 45, 1), leg('air_leg', 90, 2)],
        }),
        cand({
          aircraft_id: 'j1',
          price: 30000,
          chain: [
            leg('truck_pickup', 120, 1),
            leg('position', 60, 2),
            leg('air_leg', 120, 3),
          ],
        }),
        cand({
          aircraft_id: 't1',
          price: 14000,
          chain: [leg('position', 90, 1), leg('air_leg', 100, 2)],
        }),
      ],
      [
        {
          aircraft_id: 'p1',
          category: 'piston',
          engines: 'multi piston',
          type_name: '310',
          mtow_lbs: 5500,
        },
        {
          aircraft_id: 'j1',
          category: 'light jet',
          engines: 'turbine',
          type_name: 'Citation',
          mtow_lbs: 16000,
        },
        {
          aircraft_id: 't1',
          category: 'turboprop',
          engines: 'multi turboprop',
          type_name: 'King Air',
          mtow_lbs: 12500,
        },
      ],
      {
        payloadKind: 'cargo',
        paxCount: 0,
        rates: TEST_TAX_RATES_2026,
      },
    )

    expect(bundle.options.length).toBe(3)
    expect(bundle.closest_blurb.toLowerCase()).toMatch(/piston/)
    const jet = bundle.options.find((o) => o.band === 'light_jet')!
    expect(jet.assumption_blurb).toMatch(/2 hrs to airport/)
    expect(jet.assumption_blurb).toMatch(/1 hr to reposition/)
    expect(jet.assumption_blurb).toMatch(/2 hrs live leg/)
    expect(jet.price_lines.some((l) => l.code === 'AIR')).toBe(true)
    expect(jet.price_lines.some((l) => l.code === 'TOTAL')).toBe(true)
    const json = JSON.stringify(bundle)
    expect(json).not.toMatch(/SECRET OP/)
    expect(json).not.toMatch(/N000XX/)
    expect(json).not.toMatch(/"cost"/)
  })
})
