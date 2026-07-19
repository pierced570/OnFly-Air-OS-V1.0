import { describe, expect, it } from 'vitest'
import {
  countCompletedTripsForOperator,
  isNamedInsurerEligible,
  namedInsurerTripThreshold,
} from '@/lib/operatorTrips'
import { createTripFromCandidates, mutateTrip } from '@/lib/tripStore'
import type { Candidate } from '@/domain/routing'

function stubCandidate(opId: string, name: string): Candidate {
  return {
    operator_id: opId,
    operator_name: name,
    aircraft_id: 'ac-1',
    tail: 'NTEST1',
    type_name: 'King Air',
    mtow_lbs: 12500,
    cost: 1000,
    price: 1200,
    chain: [],
    confidence: 0.9,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: new Date().toISOString(),
    circuit_nm: 100,
  }
}

describe('named insurer trip threshold', () => {
  it('counts delivered/invoiced/closed trips for selected operator', () => {
    const opId = crypto.randomUUID()
    const name = `NamedOp ${opId.slice(0, 6)}`
    expect(namedInsurerTripThreshold()).toBe(3)

    for (let i = 0; i < 3; i++) {
      const trip = createTripFromCandidates({
        lane: `KCAK-KCLE-${i}`,
        payload_summary: 'test',
        ready_label: 'ASAP',
        candidates: [stubCandidate(opId, name)],
        payload_kind: 'cargo',
      })
      mutateTrip(trip.id, (t) => {
        t.offers[0]!.state = 'selected'
        t.state = 'delivered'
      })
    }

    expect(countCompletedTripsForOperator(opId, name)).toBe(3)
    expect(isNamedInsurerEligible(opId, name)).toBe(true)
  })
})
