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
      operator_id: 'op-piston-near',
      aircraft_id: 'a1',
      tail: 'N1',
      type_name: 'C208',
      circuit_nm: 40,
    })
    const pistonFar = cand({
      operator_id: 'op-piston-far',
      aircraft_id: 'a2',
      tail: 'N2',
      type_name: 'C208',
      circuit_nm: 200,
    })
    const tp = cand({
      operator_id: 'op-tp',
      aircraft_id: 'a3',
      tail: 'N3',
      type_name: 'King Air 350',
      circuit_nm: 80,
    })
    const light = cand({
      operator_id: 'op-light',
      aircraft_id: 'a4',
      tail: 'N4',
      type_name: 'Citation CJ3',
      circuit_nm: 90,
    })
    const heavy = cand({
      operator_id: 'op-heavy',
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

  it('never assigns the same operator to two bands', () => {
    const apexTp = cand({
      operator_id: 'apex',
      operator_name: 'Apex Jet',
      aircraft_id: 'apex-ka',
      tail: 'N716AP',
      type_name: 'King Air 200',
      circuit_nm: 30,
    })
    const apexJet = cand({
      operator_id: 'apex',
      operator_name: 'Apex Jet',
      aircraft_id: 'apex-fal',
      tail: 'N388BB',
      type_name: 'Falcon 50',
      circuit_nm: 40,
    })
    const otherJet = cand({
      operator_id: 'other',
      operator_name: 'Other Jets',
      aircraft_id: 'other-1',
      tail: 'N9ZZ',
      type_name: 'Citation CJ3',
      circuit_nm: 90,
    })
    const meta = new Map([
      [
        'apex-ka',
        {
          aircraft_id: 'apex-ka',
          category: 'turboprop',
          engines: 'multi',
          type_name: 'King Air 200',
        },
      ],
      [
        'apex-fal',
        {
          aircraft_id: 'apex-fal',
          category: 'midsize',
          engines: 'multi',
          type_name: 'Falcon 50',
        },
      ],
      [
        'other-1',
        {
          aircraft_id: 'other-1',
          category: 'light jet',
          engines: 'multi',
          type_name: 'Citation CJ3',
        },
      ],
    ])
    const picks = pickClosestByBand([apexTp, apexJet, otherJet], meta)
    const ops = picks.map((p) => p.candidate.operator_id)
    expect(new Set(ops).size).toBe(ops.length)
    expect(ops).toContain('apex')
    expect(ops).toContain('other')
  })
})
