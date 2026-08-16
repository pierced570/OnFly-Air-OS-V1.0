import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '@/domain/routing'
import { clearMockCommsLog } from '@/adapters/comms'
import { getMockSentEmails } from '@/adapters/email'
import { acceptHardQuoteOption, selectOffersAndHardQuote } from '@/lib/offerFlow'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  getTrip,
  mutateTrip,
  safeTransitionTrip,
} from '@/lib/tripStore'

vi.mock('@/adapters/comms', async () => {
  const actual = await vi.importActual<typeof import('@/adapters/comms')>(
    '@/adapters/comms',
  )
  return {
    ...actual,
    createCommsAdapter: () => ({
      async send() {
        throw new Error(
          'RingCentral SMS failed: Parameter [from] value [+15557100002] is invalid',
        )
      },
    }),
    isSmsDeliveryEnabled: () => true,
  }
})

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

describe('acceptHardQuoteOption notifications', () => {
  beforeEach(() => {
    __resetTripsForTests()
    clearMockCommsLog()
  })

  it('books successfully when SMS fails and still emails win + stand-down', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N11111'), cand('N22222')],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      t.offers.forEach((o, i) => {
        o.state = 'quoted'
        o.price_net = 4500
        o.type_name = 'Cessna 310'
        o.time_to_position_min = 90
        o.live_leg_min = 75
        o.fee_scope = 'aircraft_and_fees'
        o.quote_link_channel = 'sms'
        o.contact_cell = '+15555550100'
        o.contact_cell_is_mock = false
        o.contact_email = i === 0 ? 'win@op.com' : 'down@op.com'
      })
    })
    const ids = getTrip(trip.id)!.offers.map((o) => o.id)
    await selectOffersAndHardQuote(
      trip.id,
      ids,
      Object.fromEntries(ids.map((id) => [id, 12000])),
      ['client@example.com'],
      { notifyClient: false },
    )
    const token = getTrip(trip.id)!.hard_quote!.accept_token
    const winId = ids[0]!

    const before = getMockSentEmails().length
    await expect(acceptHardQuoteOption(token, winId)).resolves.toBeTruthy()

    const booked = getTrip(trip.id)!
    expect(booked.state).toBe('booked')
    expect(booked.hard_quote?.client_decision).toBe('accepted')

    const sent = getMockSentEmails().slice(before)
    expect(sent.some((m) => String(m.to).includes('win@op.com'))).toBe(true)
    expect(sent.some((m) => String(m.to).includes('down@op.com'))).toBe(true)
    expect(
      sent.some((m) => /you.?re on|OnFly update/i.test(m.subject ?? '')),
    ).toBe(true)
    // Never notify the client on accept — invoice / tracking are desk actions.
    expect(sent.some((m) => String(m.to).includes('client@'))).toBe(false)
    expect(
      sent.some((m) => /invoice|payment request/i.test(m.subject ?? '')),
    ).toBe(false)
  })

  it('does not create a sent invoice when hard quote is accepted', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N33333')],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      t.po_number = 'PSA0042'
      t.offers.forEach((o) => {
        o.state = 'quoted'
        o.price_net = 4500
        o.type_name = 'Cessna 310'
        o.time_to_position_min = 90
        o.live_leg_min = 75
        o.fee_scope = 'aircraft_and_fees'
        o.contact_email = 'fly@op.com'
        o.contact_cell = '+15555550111'
        o.contact_cell_is_mock = false
      })
    })
    const offerId = getTrip(trip.id)!.offers[0]!.id
    await selectOffersAndHardQuote(
      trip.id,
      [offerId],
      { [offerId]: 12000 },
      ['client@example.com'],
      { notifyClient: false },
    )
    const token = getTrip(trip.id)!.hard_quote!.accept_token
    await acceptHardQuoteOption(token, offerId)
    const booked = getTrip(trip.id)!
    expect(booked.state).toBe('booked')
    // Draft invoice may exist when PO is set — must never be marked sent.
    if (booked.invoice) {
      expect(booked.invoice.status).not.toBe('sent')
    }
  })
})
