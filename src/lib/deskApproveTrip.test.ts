import { beforeEach, describe, expect, it } from 'vitest'
import type { Candidate } from '@/domain/routing'
import { deskApproveTrip } from '@/lib/offerFlow'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  mutateTrip,
  safeTransitionTrip,
} from '@/lib/tripStore'

function cand(tail: string): Candidate {
  return {
    aircraft_id: crypto.randomUUID(),
    operator_id: crypto.randomUUID(),
    operator_name: `Op ${tail}`,
    tail,
    type_name: 'King Air 200',
    mtow_lbs: 12500,
    cost: 4000,
    price: 4600,
    chain: [],
    confidence: 0.8,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: new Date().toISOString(),
    circuit_nm: 300,
    rate_per_nm: 8,
    rate_source: 'assumption',
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

    // Second approve is a no-op — already booked, no double waterfall advance.
    const again = await deskApproveTrip(trip.id)
    expect(again.state).toBe('booked')
    expect(again.id).toBe(booked.id)
  })

  it('approves a specific option and stands other quoted operators down', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N100AA'), cand('N200BB')],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      for (const o of t.offers) {
        o.state = 'quoted'
        o.price_net = o.tail === 'N100AA' ? 4500 : 4800
        o.time_to_position_min = 90
        o.live_leg_min = 75
        o.fee_scope = 'aircraft_and_fees'
        o.quote_link_channel = 'email'
        o.contact_email = `${o.tail.toLowerCase()}@op.example`
      }
    })
    const winner = trip.offers.find((o) => o.tail === 'N200BB')!
    const booked = await deskApproveTrip(trip.id, winner.id)
    expect(booked.state).toBe('booked')
    const selected = booked.offers.find((o) => o.state === 'selected')
    expect(selected?.tail).toBe('N200BB')
    expect(booked.offers.filter((o) => o.state === 'stood_down')).toHaveLength(1)
  })
})
