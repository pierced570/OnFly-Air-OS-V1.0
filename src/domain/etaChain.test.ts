import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { MockMapsAdapter } from '@/adapters/maps'
import {
  applyQuotedTtp,
  buildTripChain,
  buildChain,
  editDuration,
  resetDurationToDefault,
  recompute,
  applyActual,
  mileageBlock,
  detectServicePattern,
  BUILTIN_ETA_DEFAULTS,
} from './etaChain'
import { formatStopLocal, formatZuluLocal, localInputToUtc } from './timeFmt'
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

  it('Zulu-first display includes zone label', () => {
    const d = formatZuluLocal('2026-07-15T14:30:00.000Z', 'America/New_York')
    expect(d.zulu).toBe('1430Z')
    expect(d.local).toMatch(/EDT|EST/)
    expect(d.display).toContain('1430Z')
    expect(d.display).toContain('/')
  })

  it('localInputToUtc stores UTC', () => {
    const iso = localInputToUtc('2026-07-15T09:00', 'America/New_York')
    expect(iso).toBe('2026-07-15T13:00:00.000Z')
  })
})

describe('service patterns', () => {
  it('detects D2D / A2A / D2A / A2D', () => {
    expect(
      detectServicePattern({
        shipper: { lat: 1, lon: 1 },
        consignee: { lat: 2, lon: 2 },
      }),
    ).toBe('D2D')
    expect(detectServicePattern({ mode: 'a2a' })).toBe('A2A')
    expect(
      detectServicePattern({ shipper: { lat: 1, lon: 1 }, consignee: null }),
    ).toBe('D2A')
    expect(
      detectServicePattern({ shipper: null, consignee: { lat: 2, lon: 2 } }),
    ).toBe('A2D')
  })
})

describe('etaChain merge rule + patterns', () => {
  const kcak = AIRPORTS.KCAK!
  const kmdw = {
    icao: 'KMDW',
    name: 'Chicago Midway',
    lat: 41.7868,
    lon: -87.7524,
    tz: 'America/Chicago',
  }

  it('D2D: wheels_up = max(truck ready, aircraft ready) and has truck rows', async () => {
    const maps = new MockMapsAdapter()
    const ready = localInputToUtc('2026-07-15T09:00', 'America/New_York')
    const { legs, meta } = await buildTripChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: kmdw,
        aircraftBase: { lat: 41.5651, lon: -81.4864, icao: 'KCGF', tz: 'America/New_York' },
        cruiseKts: 270,
        shipper: { lat: 41.08, lon: -81.52, tz: 'America/New_York' },
        consignee: { lat: 41.88, lon: -87.63, tz: 'America/Chicago' },
        readyAtUtc: ready,
        mode: 'D2D',
      },
      maps,
    )
    expect(meta.pattern).toBe('D2D')
    expect(legs.some((l) => l.branch === 'truck')).toBe(true)
    expect(legs.some((l) => l.duration_key === 'acft_ttp')).toBe(true)
    // Position = base→origin flight time (KCGF→KCAK), not flat 2:00 callout.
    const ttp = legs.find((l) => l.duration_key === 'acft_ttp')!
    expect(ttp.duration_min).toBe(21)
    expect(ttp.distance_nm).toBeGreaterThan(30)
    expect(ttp.source).toBe('assumed')
    const airLeg = legs.find((l) => l.type === 'air_leg')
    expect(airLeg).toBeTruthy()
    expect(DateTime.fromISO(airLeg!.est_start).toMillis()).toBeGreaterThanOrEqual(
      DateTime.fromISO(ready).toMillis(),
    )
    expect(legs.some((l) => l.event === 'Delivered')).toBe(true)
    const miles = mileageBlock(legs)
    expect(miles.total_truck_mi).toBeGreaterThan(0)
    expect(miles.total_air_nm).toBeGreaterThan(0)
  })

  it('A2A: no truck rows', async () => {
    const maps = new MockMapsAdapter()
    const { legs, meta } = await buildTripChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: kmdw,
        aircraftBase: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        cruiseKts: 250,
        readyAtUtc: '2026-07-15T13:00:00.000Z',
        mode: 'A2A',
      },
      maps,
    )
    expect(meta.pattern).toBe('A2A')
    expect(legs.some((l) => l.branch === 'truck')).toBe(false)
    expect(legs.some((l) => l.type === 'truck_pickup')).toBe(false)
    expect(legs.some((l) => l.type === 'truck_delivery')).toBe(false)
    // Co-located base uses callout default (not taxi-only).
    expect(legs.find((l) => l.duration_key === 'acft_ttp')!.duration_min).toBe(120)
  })

  it('distant base position uses flight minutes, not flat acft_ttp', async () => {
    const maps = new MockMapsAdapter()
    const khum = AIRPORTS.KHUM!
    const { legs } = await buildTripChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: kmdw,
        aircraftBase: { ...khum, icao: 'KHUM', tz: khum.tz },
        cruiseKts: 470,
        readyAtUtc: '2026-07-15T13:00:00.000Z',
        mode: 'A2A',
      },
      maps,
    )
    const ttp = legs.find((l) => l.duration_key === 'acft_ttp')!
    expect(ttp.distance_nm).toBeGreaterThan(800)
    // ~817 NM ÷ 470 kts + taxi ≈ 116 — far above a local callout, not capped at 120.
    expect(ttp.duration_min).toBeGreaterThan(100)
    expect(ttp.duration_min).toBeLessThan(130)
  })

  it('quoted TTP 1:45 replaces 2:00 and shifts wheels-up', async () => {
    const maps = new MockMapsAdapter()
    const chain = await buildChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: kmdw,
        aircraftBase: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        cruiseKts: 250,
        readyAtUtc: '2026-07-15T13:00:00.000Z',
        mode: 'A2A',
      },
      maps,
    )
    const before = chain.find((l) => l.type === 'air_leg')!.est_start
    const { chain: next } = applyQuotedTtp(chain, 105) // 1:45
    const ttp = next.find((l) => l.duration_key === 'acft_ttp')!
    expect(ttp.duration_min).toBe(105)
    expect(ttp.source).toBe('quoted')
    const after = next.find((l) => l.type === 'air_leg')!.est_start
    // 2:00 → 1:45 = −15m on position; turn still default; wheels-up earlier by 15
    expect(
      DateTime.fromISO(before).diff(DateTime.fromISO(after), 'minutes').minutes,
    ).toBe(15)
  })

  it('dispatcher edits load to 0:45 → delivery slips 0:15', async () => {
    const maps = new MockMapsAdapter()
    const { legs } = await buildTripChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: kmdw,
        aircraftBase: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        cruiseKts: 270,
        shipper: { lat: 41.08, lon: -81.52, tz: 'America/New_York' },
        consignee: { lat: 41.88, lon: -87.63, tz: 'America/Chicago' },
        readyAtUtc: '2026-07-15T13:00:00.000Z',
        mode: 'D2D',
        // Make truck the merge bottleneck so load edit ripples delivery
        acftTtpMin: 30,
        acftTtpSource: 'quoted',
      },
      maps,
      BUILTIN_ETA_DEFAULTS,
    )
    const load = legs.find((l) => l.duration_key === 'driver_load')!
    expect(load.duration_min).toBe(30)
    const beforeDelivery = legs[legs.length - 1]!.est_end
    const { chain: next, slippedMinutes } = editDuration(legs, load.seq, 45, 'manual')
    expect(slippedMinutes).toBe(15)
    expect(next.find((l) => l.seq === load.seq)!.source).toBe('manual')
    const afterDelivery = next[next.length - 1]!.est_end
    expect(
      DateTime.fromISO(afterDelivery).diff(DateTime.fromISO(beforeDelivery), 'minutes')
        .minutes,
    ).toBe(15)
  })

  it('does not overwrite manual duration with assumed unless allowReset', async () => {
    const maps = new MockMapsAdapter()
    const legs = await buildChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: kmdw,
        aircraftBase: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        cruiseKts: 270,
        readyAtUtc: '2026-07-15T13:00:00.000Z',
        mode: 'A2A',
      },
      maps,
      BUILTIN_ETA_DEFAULTS,
    )
    const turn = legs.find((l) => l.duration_key === 'acft_turn')!
    const { chain: manual } = editDuration(legs, turn.seq, 45, 'manual')
    const { chain: blocked } = editDuration(manual, turn.seq, 60, 'assumed')
    expect(blocked.find((l) => l.seq === turn.seq)!.duration_min).toBe(45)
    expect(blocked.find((l) => l.seq === turn.seq)!.source).toBe('manual')
    const { chain: reset } = resetDurationToDefault(
      manual,
      turn.seq,
      BUILTIN_ETA_DEFAULTS,
    )
    expect(reset.find((l) => l.seq === turn.seq)!.duration_min).toBe(
      BUILTIN_ETA_DEFAULTS.acft_turn,
    )
    expect(reset.find((l) => l.seq === turn.seq)!.source).toBe('assumed')
  })

  it('wheels-up actual ripples downstream', async () => {
    const maps = new MockMapsAdapter()
    const chain = await buildChain(
      {
        originAirport: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        destAirport: kmdw,
        aircraftBase: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        cruiseKts: 250,
        readyAtUtc: '2026-07-15T13:00:00.000Z',
        mode: 'A2A',
      },
      maps,
    )
    const air = chain.find((l) => l.type === 'air_leg')!
    const late = DateTime.fromISO(air.est_start).plus({ minutes: 20 }).toISO()!
    const { chain: next, slippedMinutes } = applyActual(chain, {
      seq: air.seq,
      actual_start: late,
    })
    expect(slippedMinutes).toBe(20)
    expect(next.find((l) => l.seq === air.seq)!.source).toBe('actual')
    expect(next.find((l) => l.seq === air.seq)!.est_start).toBe(late)
    expect(next.find((l) => l.seq === air.seq)!.est_end).not.toBe(air.est_end)
  })

  it('recompute shifts downstream on late actual_end', async () => {
    const maps = new MockMapsAdapter()
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

  it('missing insurance is NEEDS-INFO, not bookingGated', async () => {
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
        door_w_in: 52,
        door_h_in: 52,
        crew: 'dual',
        rate_per_nm: 12,
        rate_source: 'history',
        insurance_expiry: null,
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
    expect(cands[0]!.bookingGated).toBe(false)
    expect(cands[0]!.needsInfo).toContain('insurance')
  })

  it('no_single_engine_night hard-fails SE on night air legs', async () => {
    const maps = new MockMapsAdapter()
    const kcak = AIRPORTS.KCAK!
    const fleet: AircraftCandidateSource[] = [
      {
        id: 'se1',
        operator_id: 'op1',
        operator_name: 'SE Op',
        tail: 'N9SE',
        type_name: 'Cessna 208',
        category: 'Turboprop',
        engines: 'Single Turboprop',
        cargo_pax: 'cargo',
        seats: 2,
        base_icao: 'KCAK',
        base: { ...kcak, icao: 'KCAK', tz: kcak.tz },
        cruise_kts: 180,
        range_nm: 900,
        max_payload_lbs: 2500,
        mtow_lbs: 8000,
        door_w_in: 50,
        door_h_in: 50,
        crew: 'single',
        rate_per_nm: 9,
        rate_source: 'assumption',
        insurance_expiry: '2030-01-01',
      },
    ]
    const cands = await generateCandidates(
      {
        mode: 'a2a',
        payload_kind: 'cargo',
        pieces: [{ l_in: 20, w_in: 20, h_in: 20, weight_lbs: 100, count: 1, stackable: true }],
        pax_count: 0,
        hazmat: false,
        // Evening UTC → local night at KCAK (America/New_York)
        ready_at: '2026-01-15T03:00:00.000Z',
        client_rules: { no_single_engine_night: true },
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
    expect(cands.length).toBe(0)
  })
})
