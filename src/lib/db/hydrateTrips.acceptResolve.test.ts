import { describe, expect, it, vi, beforeEach } from 'vitest'

const safeQuery = vi.fn()
const replaceTripsFromDb = vi.fn()
const getTripByAcceptToken = vi.fn()
const getTripByOfferToken = vi.fn()

vi.mock('@/lib/db/client', () => ({
  canPersist: () => true,
  db: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
  safeQuery: (...args: unknown[]) => safeQuery(...args),
}))

vi.mock('@/lib/tripStore', () => ({
  getTripByAcceptToken: (...args: unknown[]) => getTripByAcceptToken(...args),
  getTripByOfferToken: (...args: unknown[]) => getTripByOfferToken(...args),
  replaceTripsFromDb: (...args: unknown[]) => replaceTripsFromDb(...args),
}))

describe('resolveTripByAcceptToken', () => {
  beforeEach(() => {
    safeQuery.mockReset()
    replaceTripsFromDb.mockReset()
    getTripByAcceptToken.mockReset()
    getTripByOfferToken.mockReset()
  })

  it('loads trip + offers from accept_token when not in session', async () => {
    getTripByAcceptToken
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        id: 'trip-1',
        hard_quote: { accept_token: '943067e552204323bb0d', total: 12663 },
      })

    safeQuery.mockImplementation(async (label: string) => {
      if (label === 'trips.by_accept_token') {
        return [
          {
            id: 'trip-1',
            ref: 20,
            state: 'quoted',
            lane_label: 'KCAK→KSHV',
            payload_summary: '3 pax',
            ready_label: 'ASAP',
            accept_token: '943067e552204323bb0d',
            session_meta: {
              ref: 2001,
              hard_quote: {
                accept_token: '943067e552204323bb0d',
                total: 12663,
                options: [
                  {
                    offer_id: '7619993e-b39a-4270-9726-6d671a68a9ee',
                    label: 'Option A',
                    client_total: 12663,
                  },
                ],
              },
            },
          },
        ]
      }
      if (label === 'offers.for_accept_trip') {
        return [
          {
            id: '7619993e-b39a-4270-9726-6d671a68a9ee',
            trip_id: 'trip-1',
            operator_id: null,
            aircraft_id: null,
            state: 'quoted',
            magic_token: 'tok',
            notes: JSON.stringify({
              operator_name: 'Tester',
              type_name: 'King Air 90',
              tail: 'N643EA',
            }),
          },
        ]
      }
      return []
    })

    const { resolveTripByAcceptToken } = await import('./hydrateTrips')
    const trip = await resolveTripByAcceptToken('943067e552204323bb0d')
    expect(trip?.id).toBe('trip-1')
    expect(replaceTripsFromDb).toHaveBeenCalledOnce()
    const mapped = replaceTripsFromDb.mock.calls[0]![0]![0]
    expect(mapped.hard_quote?.accept_token).toBe('943067e552204323bb0d')
    expect(mapped.offers[0]?.type_name).toBe('King Air 90')
  })
})
