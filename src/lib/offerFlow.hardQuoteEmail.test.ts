import { beforeEach, describe, expect, it } from 'vitest'
import type { Candidate } from '@/domain/routing'
import { getMockSentEmails } from '@/adapters/email'
import { selectOffersAndHardQuote } from '@/lib/offerFlow'
import {
  __resetTripsForTests,
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

describe('selectOffersAndHardQuote email recipients', () => {
  beforeEach(() => {
    __resetTripsForTests()
  })

  it('keeps multiple To addresses in To — does not spill extras into CC', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N12345')],
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

    const before = getMockSentEmails().length
    const offerId = getTripOfferId(trip.id)
    await selectOffersAndHardQuote(
      trip.id,
      [offerId],
      { [offerId]: 12000 },
      ['to-a@client.com', 'to-b@client.com'],
      {
        ccEmails: ['cc@client.com'],
        bccEmails: ['bcc@client.com'],
      },
    )

    expect(getMockSentEmails().length).toBe(before + 1)
    const last = getMockSentEmails().at(-1)!
    expect(last.to).toEqual(['to-a@client.com', 'to-b@client.com'])
    expect(last.cc).toEqual(['cc@client.com'])
    expect(last.bcc).toEqual(
      expect.arrayContaining(['bcc@client.com', 'info@onflyair.com']),
    )
    expect(last.bcc).toHaveLength(2)
    expect(last.cc).not.toContain('to-a@client.com')
    expect(last.cc).not.toContain('to-b@client.com')
  })

  it('always BCCs info@onflyair.com even when desk leaves BCC empty', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N55555')],
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

    const before = getMockSentEmails().length
    const offerId = getTripOfferId(trip.id)
    await selectOffersAndHardQuote(
      trip.id,
      [offerId],
      { [offerId]: 12000 },
      ['ops@client.com'],
      { bccEmails: [] },
    )

    expect(getMockSentEmails().length).toBe(before + 1)
    const last = getMockSentEmails().at(-1)!
    expect(last.to).toBe('ops@client.com')
    expect(last.bcc).toEqual(['info@onflyair.com'])
  })

  it('drops CC/BCC entries that duplicate a To address', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N99999')],
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

    const before = getMockSentEmails().length
    const offerId = getTripOfferId(trip.id)
    await selectOffersAndHardQuote(
      trip.id,
      [offerId],
      { [offerId]: 12000 },
      ['same@client.com'],
      {
        ccEmails: ['same@client.com', 'other-cc@client.com'],
        bccEmails: ['same@client.com'],
      },
    )

    expect(getMockSentEmails().length).toBe(before + 1)
    const last = getMockSentEmails().at(-1)!
    expect(last.to).toBe('same@client.com')
    expect(last.cc).toEqual(['other-cc@client.com'])
    expect(last.bcc).toEqual(['info@onflyair.com'])
  })
})

function getTripOfferId(tripId: string): string {
  return getTrip(tripId)!.offers[0]!.id
}
