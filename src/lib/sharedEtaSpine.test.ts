import { describe, expect, it } from 'vitest'
import type { Candidate } from '@/domain/routing'
import { DEFAULT_QUICK_TURN_MIN } from '@/domain/offerQuoteTiming'
import { DEFAULT_ACFT_TURN_MIN } from '@/domain/etaChain'
import { buildQuickDispatchChain } from '@/domain/quickDispatchChain'
import {
  __resetTripsForTests,
  applyOfferLiveLegToTrip,
  applyOfferTtpToTrip,
  applyOfferTurnToTrip,
  createTripFromCandidates,
  getTrip,
  mutateTrip,
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
    chain: buildQuickDispatchChain(
      [
        {
          origin_icao: 'KCAK',
          dest_icao: 'KMDW',
          repo_time: '2h',
          live_leg_time: '90m',
        },
      ],
      { now: new Date('2026-07-26T12:00:00.000Z') },
    ),
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

describe('QD + waterfall shared ETA spine', () => {
  it('shares one turn autofill constant', () => {
    expect(DEFAULT_QUICK_TURN_MIN).toBe(DEFAULT_ACFT_TURN_MIN)
    expect(DEFAULT_ACFT_TURN_MIN).toBe(40)
  })

  it('applies quoted TTP + turn + live onto the same chain keys', () => {
    __resetTripsForTests()
    const c = cand('N99AA')
    const trip = createTripFromCandidates({
      lane: 'KCAK → KMDW',
      ready_label: 'ASAP',
      payload_summary: 'cargo',
      candidates: [c],
      payload_kind: 'cargo',
      selectedChain: c.chain,
    })
    mutateTrip(trip.id, (t) => {
      t.offers[0]!.state = 'quoted'
      t.offers[0]!.time_to_position_min = 90
      t.offers[0]!.quick_turn_min = 55
      t.offers[0]!.live_leg_min = 75
    })
    const offerId = getTrip(trip.id)!.offers[0]!.id
    applyOfferTtpToTrip(trip.id, offerId, 90)
    applyOfferTurnToTrip(trip.id, offerId, 55)
    applyOfferLiveLegToTrip(trip.id, offerId, 75)

    const row = getTrip(trip.id)!
    expect(row.eta_chain.find((l) => l.duration_key === 'acft_ttp')!.duration_min).toBe(
      90,
    )
    expect(
      row.eta_chain.find((l) => l.duration_key === 'acft_turn')!.duration_min,
    ).toBe(55)
    expect(row.eta_chain.find((l) => l.duration_key === 'air_time')!.duration_min).toBe(
      75,
    )
    expect(row.eta_chain.find((l) => l.duration_key === 'acft_turn')!.source).toBe(
      'quoted',
    )
  })
})
