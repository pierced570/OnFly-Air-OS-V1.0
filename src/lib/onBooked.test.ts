import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  getTrip,
  mutateTrip,
  safeTransitionTrip,
} from '@/lib/tripStore'
import type { Candidate } from '@/domain/routing'

vi.mock('@/lib/etaSheetSender', () => ({
  sendBookedEtaSheetToTrackers: vi.fn(async () => ({
    sentTo: ['tracker@example.com'],
  })),
  portalTrackingUrlForTrip: () => '/portal/track/x',
}))

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

describe('runOnBookedAutomations', () => {
  beforeEach(() => {
    __resetTripsForTests()
    vi.clearAllMocks()
  })

  it('does not send ETA sheet unless sendEtaEmail is true', async () => {
    const { sendBookedEtaSheetToTrackers } = await import(
      '@/lib/etaSheetSender'
    )
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N44444')],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    safeTransitionTrip(trip.id, 'quoted_hard', 'dispatcher', {})
    safeTransitionTrip(trip.id, 'booked', 'dispatcher', {})
    mutateTrip(trip.id, (t) => {
      t.client_id = 'c1'
      t.quick = {
        client_id: 'c1',
        client_name: 'Test',
        po: 'PO1',
        timing: 'asap',
        roundtrip: false,
        cargo_only: true,
        vendor_cost: 4000,
        client_price: 5000,
        pay_terms: '',
        invoice_email: 'ap@example.com',
        cc_emails: [],
        send_invoice: true,
        referred_by: '',
        referral_id: null,
        referral_share_amount: null,
        notes: '',
        legs: [],
        eta_emails: ['tracker@example.com'],
        operator_name: 'Op',
        aircraft_type: 'Cessna 310',
        tail: 'N44444',
      }
    })

    const { runOnBookedAutomations } = await import('@/lib/onBooked')
    const r = await runOnBookedAutomations(trip.id)
    expect(r.etaSentTo).toEqual([])
    expect(sendBookedEtaSheetToTrackers).not.toHaveBeenCalled()
    const booked = getTrip(trip.id)!
    expect(
      booked.events.some((e) => e.kind === 'eta_sheet_awaiting_desk'),
    ).toBe(true)

    const sent = await runOnBookedAutomations(trip.id, { sendEtaEmail: true })
    expect(sent.etaSentTo).toEqual(['tracker@example.com'])
    expect(sendBookedEtaSheetToTrackers).toHaveBeenCalledOnce()
  })
})
