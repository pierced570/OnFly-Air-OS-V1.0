import { beforeEach, describe, expect, it } from 'vitest'
import type { Candidate } from '@/domain/routing'
import {
  respondOfferAvailability,
  submitDeskManualQuote,
  submitOperatorQuote,
} from '@/lib/offerFlow'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  getTrip,
  mutateTrip,
  safeTransitionTrip,
} from '@/lib/tripStore'

function cand(): Candidate {
  return {
    aircraft_id: crypto.randomUUID(),
    operator_id: crypto.randomUUID(),
    operator_name: 'Lock Jets',
    tail: 'N1LK',
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

const quoteInput = {
  type_name: 'King Air 200',
  tail: 'N1LK',
  time_to_position_min: 90,
  quick_turn_min: 40,
  live_leg_min: 75,
  price_net: 5000,
  wait_ok: true,
  max_wait_hrs: 2,
  fee_scope: 'aircraft_and_fees' as const,
}

describe('operator magic link locks after quote', () => {
  beforeEach(() => {
    __resetTripsForTests()
  })

  it('rejects a second operator quote via the same email/SMS token', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KSHV',
      payload_summary: '3 pax',
      ready_label: 'ASAP',
      candidates: [cand()],
      payload_kind: 'pax',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      const o = t.offers[0]!
      o.magic_token = 'tok-lock-once'
      o.state = 'available'
    })

    await submitOperatorQuote('tok-lock-once', quoteInput)
    expect(getTrip(trip.id)!.offers[0]!.price_net).toBe(5000)

    await expect(
      submitOperatorQuote('tok-lock-once', {
        ...quoteInput,
        price_net: 9999,
        tail: 'N2LK',
      }),
    ).rejects.toThrow(/already submitted/i)

    expect(getTrip(trip.id)!.offers[0]!.price_net).toBe(5000)
    expect(getTrip(trip.id)!.offers[0]!.tail).toBe('N1LK')
  })

  it('rejects Yes/No on the link after a quote is in', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KSHV',
      payload_summary: '3 pax',
      ready_label: 'ASAP',
      candidates: [cand()],
      payload_kind: 'pax',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      const o = t.offers[0]!
      o.magic_token = 'tok-lock-avail'
      o.state = 'quoted'
      o.price_net = 5000
    })

    const r = await respondOfferAvailability('tok-lock-avail', true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/already submitted/i)
  })

  it('still allows desk to correct a phone quote after operator submit', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KSHV',
      payload_summary: '3 pax',
      ready_label: 'ASAP',
      candidates: [cand()],
      payload_kind: 'pax',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      const o = t.offers[0]!
      o.magic_token = 'tok-desk-edit'
      o.state = 'available'
    })
    const offerId = trip.offers[0]!.id

    await submitOperatorQuote('tok-desk-edit', quoteInput)
    await submitDeskManualQuote(trip.id, offerId, {
      ...quoteInput,
      price_net: 5500,
      tail: 'N1LK',
    })

    expect(getTrip(trip.id)!.offers[0]!.price_net).toBe(5500)
  })
})
