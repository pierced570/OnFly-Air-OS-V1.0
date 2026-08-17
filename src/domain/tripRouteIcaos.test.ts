import { describe, expect, it } from 'vitest'
import { tripRouteIcaos } from '@/domain/tripRouteIcaos'

describe('tripRouteIcaos', () => {
  it('collects unique origin/dest ICAOs from legs', () => {
    expect(
      tripRouteIcaos({
        legs: [
          { origin_icao: 'KCAK', dest_icao: 'KCLT' },
          { origin_icao: 'kclt', dest_icao: 'KCAK' },
        ],
      }),
    ).toEqual(['KCAK', 'KCLT'])
  })

  it('falls back to quick.legs when trip.legs empty', () => {
    expect(
      tripRouteIcaos({
        legs: [],
        quick: { legs: [{ origin_icao: 'CAK', dest_icao: 'MDW' }] },
      }),
    ).toEqual(['CAK', 'MDW'])
  })
})
