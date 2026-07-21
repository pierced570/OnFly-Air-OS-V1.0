import { describe, expect, it, beforeEach } from 'vitest'
import { createMapsAdapter } from '@/adapters/maps'
import { AIRPORTS } from '@/domain/airports'
import { generateCandidates } from '@/domain/routing'
import { rateFromAircraft, loadFleetForRouting } from '@/lib/fleetRouting'
import { __resetNetworkCacheForTests } from '@/lib/networkData'

describe('fleetRouting rates', () => {
  beforeEach(() => {
    __resetNetworkCacheForTests()
  })

  it('prefers history avg $/NM over assumed median', () => {
    expect(
      rateFromAircraft({
        avg_op_per_nm_circuit: 7.2,
        med_assumed_op_per_nm: 10,
        rate_source: 'history',
      }),
    ).toEqual({ rate_per_nm: 7.2, rate_source: 'history' })

    expect(
      rateFromAircraft({
        avg_op_per_nm_circuit: null,
        med_assumed_op_per_nm: 8.05,
        rate_source: 'assumption',
      }),
    ).toEqual({ rate_per_nm: 8.05, rate_source: 'assumption' })
  })

  it('prefers rates_block $/NM over history/assumed', () => {
    expect(
      rateFromAircraft({
        rate_per_nm: 11.5,
        rate_source: 'block_rate',
        avg_op_per_nm_circuit: 7.2,
        med_assumed_op_per_nm: 10,
      }),
    ).toEqual({ rate_per_nm: 11.5, rate_source: 'block_rate' })
  })

  it('loads fixture fleet with file rates and door dims', async () => {
    const fleet = await loadFleetForRouting()
    const withRate = fleet.filter((a) => a.rate_per_nm != null)
    expect(withRate.length).toBeGreaterThan(100)
    const n15 = fleet.find((a) => a.tail === 'N15TV')
    expect(n15).toMatchObject({
      type_name: 'Cessna 310',
      rate_per_nm: 9.06,
      rate_source: 'history',
      door_w_in: 26,
      door_h_in: 36,
      range_nm: 900,
    })
  })

  it('hard-fails a 48³ cube on C310 door / short range for KABE→KADS', async () => {
    const fleet = await loadFleetForRouting()
    const origin = AIRPORTS.KABE!
    const dest = AIRPORTS.KADS!
    const cands = await generateCandidates(
      {
        mode: 'a2a',
        payload_kind: 'cargo',
        pieces: [
          {
            count: 1,
            l_in: 48,
            w_in: 48,
            h_in: 48,
            weight_lbs: 0,
            stackable: false,
          },
        ],
        pax_count: 0,
        hazmat: false,
        ready_at: new Date().toISOString(),
        origin: {
          kind: 'airport',
          icao: origin.icao,
          lat: origin.lat,
          lon: origin.lon,
          tz: origin.tz,
        },
        destination: {
          kind: 'airport',
          icao: dest.icao,
          lat: dest.lat,
          lon: dest.lon,
          tz: dest.tz,
        },
      },
      fleet,
      createMapsAdapter(),
      { pickMode: 'all' },
    )
    expect(cands.some((c) => c.tail === 'N15TV')).toBe(false)
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands.slice(0, 5)) {
      expect(c.rate_per_nm).toBeGreaterThan(0)
      expect(c.circuit_nm).toBeGreaterThan(1000)
      expect(c.reasoning.some((r) => /NM/.test(r))).toBe(true)
    }
  })
})
