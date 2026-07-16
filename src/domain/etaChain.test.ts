import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { MockMapsAdapter } from '@/adapters/maps'
import { buildChain, recompute } from './etaChain'
import { formatStopLocal, localInputToUtc } from './timeFmt'
import { generateCandidates, type AircraftCandidateSource } from './routing'
import { AIRPORTS } from './airports'

describe('timeFmt', () => {
  it('renders EDT and CDT for same UTC instant', () => {
    const utc = '2026-07-15T13:00:00.000Z' // 09:00 EDT
    const ed = formatStopLocal(utc, 'America/New_York')
    const cd = formatStopLocal(utc, 'America/Chicago')
    expect(ed.local).toMatch(/09:00/)
    expect(cd.local).toMatch(/08:00/)
    expect(ed.zulu).toBe('13:00 Z')
  })

  it('localInputToUtc stores UTC', () => {
    const iso = localInputToUtc('2026-07-15T09:00', 'America/New_York')
    expect(iso).toBe('2026-07-15T13:00:00.000Z')
  })
})

describe('etaChain merge rule', () => {
  it('wheels_up = max(truck ready, aircraft ready)', async () => {
    const maps = new MockMapsAdapter()
    const kcak = AIRPORTS.KCAK!
    const kmdw = {
      icao: 'KMDW',
      name: 'Chicago Midway',
      lat: 41.7868,
      lon: -87.7524,
      tz: 'America/Chicago',
    }
    const ready = localInputToUtc('2026-07-15T09:00', 'America/New_York')
    const chain = await buildChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: kmdw,
        aircraftBase: { lat: 41.5651, lon: -81.4864, icao: 'KCGF', tz: 'America/New_York' },
        cruiseKts: 270,
        shipper: { lat: 41.08, lon: -81.52, tz: 'America/New_York' }, // Akron-ish
        consignee: { lat: 41.88, lon: -87.63, tz: 'America/Chicago' },
        readyAtUtc: ready,
        mode: 'd2d',
      },
      maps,
    )
    const airLeg = chain.find((l) => l.type === 'air_leg')
    expect(airLeg).toBeTruthy()
    // Merge must be after ready
    expect(DateTime.fromISO(airLeg!.est_start).toMillis()).toBeGreaterThanOrEqual(
      DateTime.fromISO(ready).toMillis(),
    )
    expect(chain.some((l) => l.branch === 'truck')).toBe(true)
    expect(chain.some((l) => l.branch === 'air')).toBe(true)
  })

  it('recompute shifts downstream on late actual', async () => {
    const maps = new MockMapsAdapter()
    const kcak = AIRPORTS.KCAK!
    const chain = await buildChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: {
          icao: 'KMDW',
          lat: 41.7868,
          lon: -87.7524,
          tz: 'America/Chicago',
        },
        aircraftBase: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        cruiseKts: 250,
        readyAtUtc: '2026-07-15T13:00:00.000Z',
        mode: 'a2a',
      },
      maps,
    )
    const first = chain[0]!
    const lateEnd = DateTime.fromISO(first.est_end).plus({ minutes: 30 }).toISO()!
    const { slippedMinutes, chain: next } = recompute(chain, {
      seq: first.seq,
      actual_end: lateEnd,
    })
    expect(slippedMinutes).toBe(30)
    expect(next[next.length - 1]!.est_end).not.toBe(chain[chain.length - 1]!.est_end)
  })
})

describe('routing flag-dont-exclude', () => {
  it('keeps aircraft missing door dims with NEEDS-INFO', async () => {
    const maps = new MockMapsAdapter()
    const kcak = AIRPORTS.KCAK!
    const fleet: AircraftCandidateSource[] = [
      {
        id: '1',
        operator_id: 'op1',
        operator_name: 'Test Op',
        tail: 'N123AB',
        type_name: 'King Air 200',
        category: 'Turboprop',
        engines: 'Multi Turboprop',
        cargo_pax: 'both',
        seats: 8,
        base_icao: 'KCAK',
        base: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        cruise_kts: 270,
        range_nm: 1700,
        max_payload_lbs: 2500,
        mtow_lbs: 12500,
        door_w_in: null,
        door_h_in: null,
        crew: 'dual',
        rate_per_nm: 12,
        rate_source: 'history',
      },
    ]
    const cands = await generateCandidates(
      {
        mode: 'a2a',
        payload_kind: 'cargo',
        pieces: [{ l_in: 48, w_in: 40, h_in: 60, weight_lbs: 800, count: 1, stackable: false }],
        pax_count: 0,
        hazmat: false,
        ready_at: '2026-07-15T13:00:00.000Z',
        origin: { ...kcak, icao: 'KCAK', tz: kcak.tz, kind: 'airport' },
        destination: {
          icao: 'KMDW',
          lat: 41.7868,
          lon: -87.7524,
          tz: 'America/Chicago',
          kind: 'airport',
        },
      },
      fleet,
      maps,
    )
    expect(cands.length).toBeGreaterThan(0)
    expect(cands[0]!.needsInfo).toContain('door dims')
  })
})
