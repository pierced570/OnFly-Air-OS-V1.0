import { beforeEach, describe, expect, it } from 'vitest'
import { getMockCommsLog } from '@/adapters/comms'
import { getMockSentEmails } from '@/adapters/email'
import type { Candidate } from '@/domain/routing'
import {
  appendOfferToTrip,
  buildOffersFromCandidates,
  openTripOffers,
  sendAvailabilityPings,
  updateTripOfferRequest,
} from '@/lib/offerFlow'
import { sendDeskTripOffers, type DeskDraft } from '@/lib/scratchDeskFlow'
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

function stubDeskDraft(): DeskDraft {
  return {
    client_name: 'Test Client',
    client_id: null,
    po: '',
    timing: 'asap',
    roundtrip: false,
    cargo_only: true,
    legs: [
      {
        id: 'leg1',
        origin_icao: 'KCAK',
        dest_icao: 'KMDW',
        date: '2026-07-26',
        pax: 0,
      },
    ],
    pieces_text: '2 skids',
    hazmat: false,
    notes: '',
    raw_notes: '2 skids KCAK to KMDW ASAP',
    payload_kind: 'cargo',
    pax_count: 0,
    origin_text: 'KCAK',
    destination_text: 'KMDW',
    asap: true,
    ready_label: 'ASAP',
  }
}

describe('offerFlow — open vs notify', () => {
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
    expect(opened.offers[0]?.notified_at).toBeNull()
    expect(getMockCommsLog().length).toBe(smsBefore)
    expect(getMockSentEmails().length).toBe(emailBefore)
    expect(
      opened.events.some((e) => e.kind === 'offer_request'),
    ).toBe(true)
    expect(opened.events.some((e) => e.kind === 'offer_ping')).toBe(false)
  })

  it('sendAvailabilityPings emails the quote-request link', async () => {
    const c = stubCandidate('Alpha Air', 'op-notify')
    const trip = createTripFromCandidates({
      lane: 'KCAK→KMDW',
      payload_summary: '2 skids',
      ready_label: 'ASAP',
      candidates: [c],
      payload_kind: 'cargo',
    })
    mutateTrip(trip.id, (t) => {
      t.offers = buildOffersFromCandidates(trip.id, [c], {
        [c.operator_id]: {
          contact_email: 'ops@alpha.example',
          contact_cell: '+15551212',
          quote_link_channel: 'email',
        },
      })
    })
    await openTripOffers(trip.id)
    const emailBefore = getMockSentEmails().length
    const pinged = await sendAvailabilityPings(trip.id)
    expect(pinged.offers[0]?.notified_at).toBeTruthy()
    expect(getMockSentEmails().length).toBeGreaterThan(emailBefore)
    const last = getMockSentEmails().at(-1)!
    expect(last.to).toBe('ops@alpha.example')
    expect(last.text).toMatch(/\/offer\//)
    expect(pinged.events.some((e) => e.kind === 'offer_ping')).toBe(true)
  })

  it('sendDeskTripOffers emails offer links (not link-only)', async () => {
    const c = stubCandidate('Alpha Air', 'op-desk')
    const emailBefore = getMockSentEmails().length
    const trip = await sendDeskTripOffers({
      draft: stubDeskDraft(),
      candidates: [c],
      contactOverrides: {
        [c.operator_id]: {
          contact_email: 'desk@alpha.example',
          contact_cell: '',
          quote_link_channel: 'email',
        },
      },
    })
    expect(trip.state).toBe('offers_out')
    expect(trip.offers[0]?.notified_at).toBeTruthy()
    expect(getMockSentEmails().length).toBeGreaterThan(emailBefore)
    expect(getMockSentEmails().at(-1)?.to).toBe('desk@alpha.example')
    expect(getMockSentEmails().at(-1)?.text).toMatch(/Yes or No/)
    expect(getMockSentEmails().at(-1)?.text).toMatch(/\/offer\//)
    expect(getMockSentEmails().at(-1)?.html).toMatch(/Open request/)
    expect(getMockSentEmails().at(-1)?.subject).toBe(
      'Charter flight quote request',
    )
  })

  it('appendOfferToTrip emails the new recipient', async () => {
    const a = stubCandidate('Alpha Air', 'op-a')
    const trip = createTripFromCandidates({
      lane: 'KCAK→KMDW',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [a],
      payload_kind: 'cargo',
    })
    mutateTrip(trip.id, (t) => {
      t.offers = buildOffersFromCandidates(trip.id, [a], {
        [a.operator_id]: {
          contact_email: 'a@alpha.example',
          quote_link_channel: 'email',
        },
      })
    })
    await openTripOffers(trip.id)
    const emailBefore = getMockSentEmails().length
    await appendOfferToTrip(trip.id, stubCandidate('Bravo', 'op-b'), {
      contact_email: 'bravo@ops.example',
      quote_link_channel: 'email',
    })
    const fresh = getTrip(trip.id)!
    expect(fresh.offers).toHaveLength(2)
    const bravo = fresh.offers.find((o) => o.operator_name === 'Bravo')
    expect(bravo?.notified_at).toBeTruthy()
    expect(getMockSentEmails().length).toBeGreaterThan(emailBefore)
    expect(getMockSentEmails().at(-1)?.to).toBe('bravo@ops.example')
  })

  it('sendAvailabilityPings fails when no email on file', async () => {
    const c = stubCandidate('Alpha Air', 'op-none')
    const trip = createTripFromCandidates({
      lane: 'KCAK→KMDW',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [c],
      payload_kind: 'cargo',
    })
    mutateTrip(trip.id, (t) => {
      t.offers = buildOffersFromCandidates(trip.id, [c], {
        [c.operator_id]: {
          contact_email: '',
          contact_cell: '+15551212',
          quote_link_channel: 'sms',
        },
      })
    })
    await openTripOffers(trip.id)
    await expect(sendAvailabilityPings(trip.id)).rejects.toThrow(/Could not deliver/)
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
