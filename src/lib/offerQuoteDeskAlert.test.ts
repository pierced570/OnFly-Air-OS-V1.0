import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearMockCommsLog,
  getMockCommsLog,
} from '@/adapters/comms'
import { BRAND_PHONE_E164 } from '@/domain/brand'
import type { Candidate } from '@/domain/routing'
import {
  submitDeskManualQuote,
  submitOperatorQuote,
} from '@/lib/offerFlow'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  mutateTrip,
  safeTransitionTrip,
} from '@/lib/tripStore'

function cand(): Candidate {
  return {
    aircraft_id: crypto.randomUUID(),
    operator_id: crypto.randomUUID(),
    operator_name: 'Charlie Jets',
    tail: 'N9ZZ',
    type_name: 'Citation CJ3',
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
  type_name: 'Citation CJ3',
  tail: 'N9ZZ',
  time_to_position_min: 90,
  quick_turn_min: 40,
  live_leg_min: 75,
  price_net: 5000,
  wait_ok: true,
  max_wait_hrs: 2,
  fee_scope: 'aircraft_and_fees' as const,
}

describe('operator quote → desk SMS alert', () => {
  beforeEach(() => {
    __resetTripsForTests()
    clearMockCommsLog()
  })

  it('texts dispatch RC when operator submits via magic link', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand()],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    const offer = trip.offers[0]!
    mutateTrip(trip.id, (t) => {
      const o = t.offers[0]!
      o.magic_token = 'tok-quote-alert'
      o.state = 'available'
    })

    await submitOperatorQuote('tok-quote-alert', quoteInput)

    const sms = getMockCommsLog().filter((m) => m.channel === 'sms')
    expect(sms.some((m) => m.to === BRAND_PHONE_E164)).toBe(true)
    const alert = sms.find((m) => m.to === BRAND_PHONE_E164)
    expect(alert?.body).toContain('quote submitted by Charlie Jets')
    expect(alert?.body).toContain('KCAK→KHPN')
  })

  it('does not alert desk when dispatcher enters the quote manually', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand()],
      payload_kind: 'cargo',
    })
    safeTransitionTrip(trip.id, 'offers_out', 'dispatcher', {})
    const offerId = trip.offers[0]!.id

    await submitDeskManualQuote(trip.id, offerId, quoteInput)

    const deskAlerts = getMockCommsLog().filter(
      (m) => m.channel === 'sms' && m.to === BRAND_PHONE_E164,
    )
    expect(deskAlerts).toHaveLength(0)
  })
})
