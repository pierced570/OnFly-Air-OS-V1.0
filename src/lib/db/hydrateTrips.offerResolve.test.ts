import { describe, expect, it, vi, beforeEach } from 'vitest'

const safeQuery = vi.fn()
const replaceTripsFromDb = vi.fn()
const getTripByOfferToken = vi.fn()

vi.mock('@/lib/db/client', () => ({
  canPersist: () => true,
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
  safeQuery: (...args: unknown[]) => safeQuery(...args),
}))

vi.mock('@/lib/tripStore', () => ({
  getTripByOfferToken: (...args: unknown[]) => getTripByOfferToken(...args),
  replaceTripsFromDb: (...args: unknown[]) => replaceTripsFromDb(...args),
}))

describe('resolveOfferByToken schema lag', () => {
  beforeEach(() => {
    safeQuery.mockReset()
    replaceTripsFromDb.mockReset()
    getTripByOfferToken.mockReset()
  })

  it('loads offer + trip when extended columns are absent', async () => {
    getTripByOfferToken
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        trip: { id: 'trip-1' },
        offer: { magic_token: '8c3d86e5b129414d' },
      })

    safeQuery.mockImplementation(async (label: string) => {
      if (label === 'offers.by_token') {
        return [
          {
            id: 'offer-1',
            trip_id: 'trip-1',
            operator_id: null,
            aircraft_id: null,
            state: 'pinged',
            magic_token: '8c3d86e5b129414d',
            notes: JSON.stringify({
              operator_name: 'Tester',
              operator_id: '98c86e5b-71ac-45e1-b5ae-ab5ef69dcc9b',
              contact_email: 'pierce@onflyair.com',
            }),
          },
        ]
      }
      if (label === 'trips.by_offer_token') {
        // Prod today: no service_pattern / thread_* columns on the row.
        return [
          {
            id: 'trip-1',
            ref: 20,
            state: 'offers_out',
            lane_label: 'KCAK→KHPN',
            payload_summary: '2 pax',
            ready_label: 'ASAP',
            accept_token: null,
            session_meta: { ref: 2001, candidates: [] },
            po_number: null,
            created_at: '2026-07-26T21:58:00Z',
          },
        ]
      }
      if (label === 'offers.for_trip') {
        return [
          {
            id: 'offer-1',
            trip_id: 'trip-1',
            operator_id: null,
            state: 'pinged',
            magic_token: '8c3d86e5b129414d',
            notes: JSON.stringify({ operator_name: 'Tester' }),
          },
        ]
      }
      return null
    })

    const { resolveOfferByToken } = await import('./hydrateTrips')
    const hit = await resolveOfferByToken('8c3d86e5b129414d')
    expect(hit).not.toBeNull()
    expect(replaceTripsFromDb).toHaveBeenCalledOnce()
    const mapped = replaceTripsFromDb.mock.calls[0]![0]![0]
    expect(mapped.lane).toBe('KCAK→KHPN')
    expect(mapped.offers[0]?.operator_name).toBe('Tester')
    expect(mapped.service_pattern).toBeNull()
    expect(mapped.thread_number).toBeNull()
  })
})
