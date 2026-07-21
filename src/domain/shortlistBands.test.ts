import { describe, expect, it } from 'vitest'
import type { Candidate } from '@/domain/routing'
import {
  pickClosestByBand,
  shortlistAircraftIds,
  toBandShortlist,
} from '@/domain/shortlistBands'

function cand(
  partial: Partial<Candidate> & Pick<Candidate, 'aircraft_id' | 'tail'>,
): Candidate {
  return {
    operator_id: 'op1',
    operator_name: 'Op',
    type_name: 'C208',
    mtow_lbs: 8000,
    cost: 1000,
    price: 1200,
    chain: [
      {
        type: 'position',
        duration_min: partial.circuit_nm ?? 60,
        est_start: '2026-01-01T00:00:00Z',
        est_end: '2026-01-01T01:00:00Z',
        from: { icao: 'KAAA', lat: 0, lon: 0, tz: 'UTC' },
        to: { icao: 'KBBB', lat: 1, lon: 1, tz: 'UTC' },
      } as Candidate['chain'][number],
    ],
    confidence: 1,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: '2026-01-01T03:00:00Z',
    circuit_nm: 100,
    rate_per_nm: 10,
    rate_source: 'assumption',
    ...partial,
  }
}

describe('shortlistBands', () => {
  it('picks closest per portal band and collapses jet', () => {
    const pistonNear = cand({
      aircraft_id: 'a1',
      tail: 'N1',
      type_name: 'C208',
      circuit_nm: 40,
    })
    const pistonFar = cand({
      aircraft_id: 'a2',
      tail: 'N2',
      type_name: 'C208',
      circuit_nm: 200,
    })
    const tp = cand({
      aircraft_id: 'a3',
      tail: 'N3',
      type_name: 'King Air 350',
      circuit_nm: 80,
    })
    const light = cand({
      aircraft_id: 'a4',
      tail: 'N4',
      type_name: 'Citation CJ3',
      circuit_nm: 90,
    })
    const heavy = cand({
      aircraft_id: 'a5',
      tail: 'N5',
      type_name: 'Challenger 350',
      circuit_nm: 50,
    })

    const meta = new Map([
      ['a1', { aircraft_id: 'a1', category: 'piston', engines: 'single', type_name: 'C208' }],
      ['a2', { aircraft_id: 'a2', category: 'piston', engines: 'single', type_name: 'C208' }],
      [
        'a3',
        {
          aircraft_id: 'a3',
          category: 'turboprop',
          engines: 'multi',
          type_name: 'King Air 350',
        },
      ],
      [
        'a4',
        {
          aircraft_id: 'a4',
          category: 'light jet',
          engines: 'multi',
          type_name: 'Citation CJ3',
        },
      ],
      [
        'a5',
        {
          aircraft_id: 'a5',
          category: 'midsize',
          engines: 'multi',
          type_name: 'Challenger 350',
        },
      ],
    ])

    const picks = pickClosestByBand(
      [pistonNear, pistonFar, tp, light, heavy],
      meta,
    )
    const shortlist = toBandShortlist(picks)
    expect(shortlist.piston?.aircraft_id).toBe('a1')
    expect(shortlist.turboprop?.aircraft_id).toBe('a3')
    // closest jet among light + larger
    expect(shortlist.jet?.aircraft_id).toBe('a5')
    expect(shortlistAircraftIds(shortlist)).toEqual(['a1', 'a3', 'a5'])
  })
})
