import { beforeEach, describe, expect, it } from 'vitest'
import { deskApproveTrip } from '@/lib/offerFlow'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  mutateTrip,
  type Candidate,
} from '@/lib/tripStore'
import { safeTransitionTrip } from '@/lib/tripStore'

function cand(tail: string): Candidate {
  return {
    aircraft_id: crypto.randomUUID(),
    operator_id: crypto.randomUUID(),
    operator_name: `Op ${tail}`,
    tail,
    type_name: 'King Air 200',
    mtow_lbs: 12500,
    score: 1,
    eta_end: null,
    chain: [],
    reasoning: [],
    needsInfo: [],
    bookingGated: false,
  }
}

describe('deskApproveTrip', () => {
  beforeEach(() => {
    __resetTripsForTests()
  })

  it('books a trip from offers_out with a quoted operator', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N100AA')],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      const o = t.offers[0]!
      o.state = 'quoted'
      o.price_net = 4500
      o.time_to_position_min = 90
      o.live_leg_min = 75
      o.fee_scope = 'aircraft_and_fees'
    })

    const booked = await deskApproveTrip(trip.id)
    expect(booked.state).toBe('booked')
    expect(booked.hard_quote?.client_decision).toBe('accepted')
    expect(booked.offers.some((o) => o.state === 'selected')).toBe(true)
  })
})
