import { beforeEach, describe, expect, it } from 'vitest'
import { getMockCommsLog } from '@/adapters/comms'
import { getMockSentEmails } from '@/adapters/email'
import {
  buildOffersFromCandidates,
  respondOfferAvailability,
  sendAvailabilityPings,
  submitOperatorQuote,
} from '@/lib/offerFlow'
import { createTripFromCandidates, getTrip, mutateTrip } from '@/lib/tripStore'
import type { Candidate } from '@/domain/routing'

function fakeCandidate(partial: Partial<Candidate> & { operator_id: string }): Candidate {
  return {
    aircraft_id: partial.aircraft_id ?? 'ac1',
    operator_id: partial.operator_id,
    operator_name: partial.operator_name ?? 'Test Air',
    tail: partial.tail ?? 'N100AA',
    type_name: partial.type_name ?? 'King Air',
    score: 1,
    bookingGated: false,
    needsInfo: [],
    phase: 'available',
    inPosition: false,
    laddBlocked: false,
    ...partial,
  } as Candidate
}

describe('offer link SMS + email + Yes/No quote', () => {
  beforeEach(() => {
    // Fresh trip each test via create
  })

  it('sends SMS link and email when contact_email set', async () => {
    const c = fakeCandidate({ operator_id: 'op-test-1', operator_name: 'Link Air' })
    const trip = createTripFromCandidates({
      lane: 'KCVG→KHPN',
      payload_summary: '2 techs + parts',
      ready_label: 'ASAP',
      candidates: [c],
      payload_kind: 'both',
    })
    mutateTrip(trip.id, (t) => {
      t.offers = buildOffersFromCandidates(t.id, [c])
      t.offers[0]!.contact_email = 'ops@linkair.test'
      t.offers[0]!.contact_cell = '+14155550100'
    })

    const beforeSms = getMockCommsLog().length
    const beforeMail = getMockSentEmails().length
    await sendAvailabilityPings(trip.id)
    const sms = getMockCommsLog().slice(beforeSms)
    const mail = getMockSentEmails().slice(beforeMail)
    expect(sms.some((m) => m.body.includes('/offer/'))).toBe(true)
    expect(mail.some((m) => m.to === 'ops@linkair.test')).toBe(true)
    expect(getTrip(trip.id)?.offers[0]?.state).toBe('pinged')
  })

  it('No marks unavailable; Yes then quote with tail + tax/fees', async () => {
    const c = fakeCandidate({ operator_id: 'op-test-2', operator_name: 'Quote Air' })
    const trip = createTripFromCandidates({
      lane: 'KCAK→KMDW',
      payload_summary: '1 skid',
      ready_label: 'ASAP',
      candidates: [c],
      payload_kind: 'cargo',
    })
    mutateTrip(trip.id, (t) => {
      t.offers = buildOffersFromCandidates(t.id, [c])
    })
    const token = getTrip(trip.id)!.offers[0]!.magic_token

    const no = await respondOfferAvailability(token, false)
    expect(no.ok).toBe(true)
    expect(getTrip(trip.id)?.offers[0]?.state).toBe('unavailable')

    // Reset to available path on a fresh offer
    mutateTrip(trip.id, (t) => {
      t.offers[0]!.state = 'pinged'
      t.offers[0]!.replied_at = null
    })
    const yes = await respondOfferAvailability(token, true)
    expect(yes.ok && yes.available).toBe(true)
    expect(getTrip(trip.id)?.offers[0]?.state).toBe('available')

    await submitOperatorQuote(token, {
      tail: 'n55zz',
      time_to_position_min: 60,
      live_leg_min: 90,
      price_net: 5200,
      wait_ok: true,
      max_wait_hrs: 2,
      includes_aircraft_tax: true,
      includes_fees: false,
    })
    const o = getTrip(trip.id)!.offers[0]!
    expect(o.state).toBe('quoted')
    expect(o.tail).toBe('N55ZZ')
    expect(o.includes_aircraft_tax).toBe(true)
    expect(o.fee_scope).toBe('aircraft_and_fees')
  })
})
