import { beforeEach, describe, expect, it } from 'vitest'
import type { Candidate } from '@/domain/routing'
import {
  acceptHardQuoteOption,
  selectOffersAndHardQuote,
} from '@/lib/offerFlow'
import {
  __resetTripsForTests,
  createInvoiceForTrip,
  createTripFromCandidates,
  getTrip,
  mutateTrip,
  safeTransitionTrip,
} from '@/lib/tripStore'

function cand(tail: string): Candidate {
  return {
    aircraft_id: crypto.randomUUID(),
    operator_id: crypto.randomUUID(),
    operator_name: `Op ${tail}`,
    tail,
    type_name: 'Cessna 310',
    mtow_lbs: 5500,
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

describe('booking PO number', () => {
  beforeEach(() => {
    __resetTripsForTests()
  })

  it('does not invent CLI0001 when creating an invoice without a PO', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N1')],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      const o = t.offers[0]!
      o.state = 'quoted'
      o.price_net = 4500
      o.type_name = 'Cessna 310'
      o.time_to_position_min = 90
      o.live_leg_min = 75
      o.fee_scope = 'aircraft_and_fees'
    })
    const offerId = getTrip(trip.id)!.offers[0]!.id
    await selectOffersAndHardQuote(
      trip.id,
      [offerId],
      { [offerId]: 12000 },
      ['ops@client.com'],
      { notifyClient: false },
    )
    mutateTrip(trip.id, (t) => {
      t.po_number = null
      if (t.quick) t.quick.po = ''
    })

    const inv = await createInvoiceForTrip(trip.id, { skipEmail: true })
    expect(inv).toBeNull()
    const after = getTrip(trip.id)!
    expect(after.po_number).toBeFalsy()
    expect(after.quick?.po).toBeFalsy()
    expect(after.invoice).toBeFalsy()
  })

  it('keeps desk PO through accept and never invents a sequential PO', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N2')],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      const o = t.offers[0]!
      o.state = 'quoted'
      o.price_net = 4500
      o.type_name = 'Cessna 310'
      o.time_to_position_min = 90
      o.live_leg_min = 75
      o.fee_scope = 'aircraft_and_fees'
      t.po_number = 'PSA9911'
    })
    const offerId = getTrip(trip.id)!.offers[0]!.id
    await selectOffersAndHardQuote(
      trip.id,
      [offerId],
      { [offerId]: 12000 },
      ['ops@client.com'],
      { notifyClient: false },
    )
    const token = getTrip(trip.id)!.hard_quote!.accept_token
    await acceptHardQuoteOption(token, offerId)
    const booked = getTrip(trip.id)!
    expect(booked.state).toBe('booked')
    expect(booked.po_number).toBe('PSA9911')
    expect(booked.po_number).not.toMatch(/^CLI/i)
  })
})
