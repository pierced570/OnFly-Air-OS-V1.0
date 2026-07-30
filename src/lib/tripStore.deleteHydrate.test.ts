import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '@/domain/routing'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  deleteTrip,
  getTrip,
  removeOfferFromTrip,
  replaceTripsFromDb,
  type TripStoreRow,
} from '@/lib/tripStore'

vi.mock('@/lib/db/persistTrip', () => ({
  deleteTripFromDb: vi.fn(async () => true),
  deleteOfferFromDb: vi.fn(async () => true),
  persistOfferRemovedEvent: vi.fn(async () => {}),
  persistTripSnapshot: vi.fn(async () => {}),
}))

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

function cloneRow(trip: TripStoreRow): TripStoreRow {
  return structuredClone(trip)
}

describe('tripStore delete vs live hydrate', () => {
  beforeEach(() => {
    __resetTripsForTests()
  })

  it('does not resurrect a desk-deleted trip on hydrate', () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N100AA')],
      payload_kind: 'cargo',
    })
    const ghost = cloneRow(trip)
    expect(deleteTrip(trip.id)).toBe(true)
    expect(getTrip(trip.id)).toBeNull()

    replaceTripsFromDb([ghost])
    expect(getTrip(trip.id)).toBeNull()
  })

  it('keeps tombstone through an empty hydrate (no false clear)', () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N200BB')],
      payload_kind: 'cargo',
    })
    const ghost = cloneRow(trip)
    deleteTrip(trip.id)
    replaceTripsFromDb([])
    replaceTripsFromDb([ghost])
    expect(getTrip(trip.id)).toBeNull()
  })

  it('does not resurrect a desk-removed offer on hydrate', () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N300CC'), cand('N400DD')],
      payload_kind: 'cargo',
    })
    const offerId = trip.offers[0]!.id
    const otherId = trip.offers[1]!.id
    const ghost = cloneRow(trip)

    expect(removeOfferFromTrip(trip.id, offerId)).toBe(true)
    expect(getTrip(trip.id)?.offers.map((o) => o.id)).toEqual([otherId])

    replaceTripsFromDb([ghost])
    const after = getTrip(trip.id)
    expect(after?.offers.map((o) => o.id)).toEqual([otherId])
    expect(after?.offers.some((o) => o.id === offerId)).toBe(false)
  })

  it('keeps offer tombstone when hydrate returns empty offers', () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N500EE'), cand('N600FF')],
      payload_kind: 'cargo',
    })
    const offerId = trip.offers[0]!.id
    const otherId = trip.offers[1]!.id
    const ghost = cloneRow(trip)

    expect(removeOfferFromTrip(trip.id, offerId)).toBe(true)

    // Failed/partial offers hydrate looks like [] — must not wipe remaining
    // offers or clear the tombstone (next full hydrate would resurrect).
    const emptyOffers = cloneRow(trip)
    emptyOffers.offers = []
    replaceTripsFromDb([emptyOffers])
    expect(getTrip(trip.id)?.offers.map((o) => o.id)).toEqual([otherId])

    replaceTripsFromDb([ghost])
    expect(getTrip(trip.id)?.offers.map((o) => o.id)).toEqual([otherId])
  })

  it('holds trip tombstone through discard-ok then stale hydrate', async () => {
    const persist = await import('@/lib/db/persistTrip')
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N700GG')],
      payload_kind: 'cargo',
    })
    const ghost = cloneRow(trip)
    // Seed as previously hydrated so prune path is exercised too.
    replaceTripsFromDb([cloneRow(trip)])

    expect(deleteTrip(trip.id)).toBe(true)
    expect(getTrip(trip.id)).toBeNull()

    await vi.waitFor(() => {
      expect(persist.deleteTripFromDb).toHaveBeenCalled()
    })

    // Stale in-flight poll still returns the row — must stay deleted.
    replaceTripsFromDb([ghost])
    expect(getTrip(trip.id)).toBeNull()

    // Confirmed absent from desk hydrate — still gone.
    replaceTripsFromDb([
      {
        ...cloneRow(trip),
        id: crypto.randomUUID(),
        ref: trip.ref + 1,
      },
    ])
    expect(getTrip(trip.id)).toBeNull()
  })

  it('prunes a discarded zombie when hydrate omits it', () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KHPN',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N800HH')],
      payload_kind: 'cargo',
    })
    const other = createTripFromCandidates({
      lane: 'KCLE→KORD',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand('N900II')],
      payload_kind: 'cargo',
    })
    replaceTripsFromDb([cloneRow(trip), cloneRow(other)])
    expect(getTrip(trip.id)).not.toBeNull()

    // Next successful hydrate omits the discarded trip — prune local zombie.
    replaceTripsFromDb([cloneRow(other)])
    expect(getTrip(trip.id)).toBeNull()
    expect(getTrip(other.id)).not.toBeNull()
  })
})
