import { beforeEach, describe, expect, it } from 'vitest'
import { getMockCommsLog } from '@/adapters/comms'
import { getMockSentEmails } from '@/adapters/email'
import type { Candidate } from '@/domain/routing'
import {
  appendOfferToTrip,
  buildOffersFromCandidates,
  openTripOffers,
  updateTripOfferRequest,
} from '@/lib/offerFlow'
import {
  createTripFromCandidates,
  getTrip,
  mutateTrip,
  __resetTripsForTests,
} from '@/lib/tripStore'


function stubCandidate(name: string, id: string): Candidate {
  return {
    operator_id: id,
    operator_name: name,
    aircraft_id: `ac-${id}`,
    tail: 'TBD',
    type_name: null,
    mtow_lbs: null,
    cost: 0,
    price: 0,
    chain: [],
    confidence: 0.5,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: new Date().toISOString(),
    circuit_nm: 0,
    rate_per_nm: 0,
    rate_source: 'assumption',
  }
}

describe('offerFlow — no auto-ping', () => {
  beforeEach(() => {
    __resetTripsForTests()
  })

  it('openTripOffers moves to offers_out without SMS/email', async () => {
    const c = stubCandidate('Alpha Air', 'op-a')
    const trip = createTripFromCandidates({
      lane: 'KCAK→KMDW',
      payload_summary: '2 skids',
      ready_label: 'ASAP',
      candidates: [c],
      payload_kind: 'cargo',
    })
    mutateTrip(trip.id, (t) => {
      t.offers = buildOffersFromCandidates(trip.id, [c])
    })
    const smsBefore = getMockCommsLog().length
    const emailBefore = getMockSentEmails().length
    const opened = await openTripOffers(trip.id)
    expect(opened.state).toBe('offers_out')
    expect(opened.offers[0]?.state).toBe('pinged')
    expect(opened.offers[0]?.ping_sent_at).toBeTruthy()
    expect(getMockCommsLog().length).toBe(smsBefore)
    expect(getMockSentEmails().length).toBe(emailBefore)
    expect(
      opened.events.some((e) => e.kind === 'offer_request'),
    ).toBe(true)
    expect(opened.events.some((e) => e.kind === 'offer_ping')).toBe(false)
  })

  it('appendOfferToTrip adds a recipient without pinging', async () => {
    const a = stubCandidate('Alpha Air', 'op-a')
    const trip = createTripFromCandidates({
      lane: 'KCAK→KMDW',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [a],
      payload_kind: 'cargo',
    })
    mutateTrip(trip.id, (t) => {
      t.offers = buildOffersFromCandidates(trip.id, [a])
    })
    await openTripOffers(trip.id)
    const smsBefore = getMockCommsLog().length
    await appendOfferToTrip(trip.id, stubCandidate('Bravo', 'op-b'))
    const fresh = getTrip(trip.id)!
    expect(fresh.offers).toHaveLength(2)
    expect(fresh.offers.some((o) => o.operator_name === 'Bravo')).toBe(true)
    expect(getMockCommsLog().length).toBe(smsBefore)
  })

  it('updateTripOfferRequest rewrites mission fields', async () => {
    const a = stubCandidate('Alpha Air', 'op-a')
    const trip = createTripFromCandidates({
      lane: 'KCAK→KMDW',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [a],
      payload_kind: 'cargo',
    })
    await openTripOffers(trip.id)
    const updated = await updateTripOfferRequest(trip.id, {
      lane: 'KCLE→KORD',
      payload_summary: '2 techs + tools',
      ready_label: 'tomorrow 0800',
    })
    expect(updated.lane).toBe('KCLE→KORD')
    expect(updated.payload_summary).toBe('2 techs + tools')
    expect(updated.ready_label).toBe('tomorrow 0800')
    expect(
      updated.events.some((e) => e.kind === 'offer_request_updated'),
    ).toBe(true)
  })
})
