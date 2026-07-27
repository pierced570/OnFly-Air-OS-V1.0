import { describe, expect, it, beforeEach } from 'vitest'
import { AIRPORTS } from '@/domain/airports'
import { loadFleetForRouting } from '@/lib/fleetRouting'
import { generateCandidates } from '@/domain/routing'
import { createMapsAdapter } from '@/adapters/maps'
import { __resetNetworkCacheForTests } from '@/lib/networkData'

describe('recommend ranking vs distant bases', () => {
  beforeEach(() => {
    __resetNetworkCacheForTests()
  })

  it('does not label KHUM-based Apex Jet as fastest on a KCAK origin', async () => {
    const o = AIRPORTS.KCAK!
    const d = AIRPORTS.KORD!
    const fleet = await loadFleetForRouting()

    const cands = await generateCandidates(
      {
        mode: 'a2a',
        payload_kind: 'cargo',
        pieces: [
          {
            l_in: 24,
            w_in: 18,
            h_in: 18,
            weight_lbs: 200,
            count: 1,
            stackable: true,
          },
        ],
        pax_count: 0,
        hazmat: false,
        ready_at: new Date().toISOString(),
        origin: {
          kind: 'airport',
          icao: o.icao,
          lat: o.lat,
          lon: o.lon,
          tz: o.tz,
        },
        destination: {
          kind: 'airport',
          icao: d.icao,
          lat: d.lat,
          lon: d.lon,
          tz: d.tz,
        },
      },
      fleet,
      createMapsAdapter(),
    )

    const apex = cands.find((c) => /Apex/i.test(c.operator_name))
    expect(apex?.label).not.toBe('fastest')

    const fastest = cands.find((c) => c.label === 'fastest')
    expect(fastest).toBeTruthy()
    // Fastest should be a regional base — not ~800+ NM reposition.
    expect(fastest!.circuit_nm).toBeLessThan(800)
    expect(fastest!.reasoning.some((r) => /KHUM/.test(r))).toBe(false)
  })

  it('resolves base_icao via catalog when lat/lon missing (no origin fake-out)', async () => {
    const o = AIRPORTS.KCAK!
    const d = AIRPORTS.KORD!
    const cands = await generateCandidates(
      {
        mode: 'a2a',
        payload_kind: 'cargo',
        pieces: [
          {
            l_in: 24,
            w_in: 18,
            h_in: 18,
            weight_lbs: 200,
            count: 1,
            stackable: true,
          },
        ],
        pax_count: 0,
        hazmat: false,
        ready_at: new Date().toISOString(),
        origin: {
          kind: 'airport',
          icao: o.icao,
          lat: o.lat,
          lon: o.lon,
          tz: o.tz,
        },
        destination: {
          kind: 'airport',
          icao: d.icao,
          lat: d.lat,
          lon: d.lon,
          tz: d.tz,
        },
      },
      [
        {
          id: 'apex-1',
          operator_id: 'apex',
          operator_name: 'Apex Jet',
          tail: 'N388BB',
          type_name: 'Falcon 50',
          category: 'Super-Mid Jet',
          engines: 'Turbine',
          cargo_pax: 'both',
          seats: 9,
          base_icao: 'KHUM',
          cruise_kts: 470,
          range_nm: 3000,
          max_payload_lbs: 3500,
          mtow_lbs: 40780,
          door_w_in: 32,
          door_h_in: 62,
          crew: 'dual',
          rate_per_nm: 12,
          rate_source: 'history',
        },
        {
          id: 'local-1',
          operator_id: 'castle',
          operator_name: 'Castle Aviation',
          tail: 'N52MG',
          type_name: 'Aerostar',
          category: 'Piston',
          engines: 'Multi Piston',
          cargo_pax: 'cargo',
          seats: 5,
          base_icao: 'KCAK',
          cruise_kts: 220,
          range_nm: 1000,
          max_payload_lbs: 1500,
          mtow_lbs: 6000,
          door_w_in: 36,
          door_h_in: 36,
          crew: 'single',
          rate_per_nm: 8,
          rate_source: 'history',
        },
      ],
      createMapsAdapter(),
      { pickMode: 'all' },
    )

    const apex = cands.find((c) => c.operator_id === 'apex')
    expect(apex).toBeTruthy()
    expect(apex!.circuit_nm).toBeGreaterThan(1000)
    expect(
      apex!.reasoning.some((r) => /based KHUM 8\d{2} NM from origin/.test(r)),
    ).toBe(true)
    const castle = cands.find((c) => c.operator_id === 'castle')
    expect(castle).toBeTruthy()
    expect(apex!.circuit_nm).toBeGreaterThan(castle!.circuit_nm * 2)
  })
})
