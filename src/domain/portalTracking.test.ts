import { describe, expect, it } from 'vitest'
import {
  buildCargoManifest,
  buildMilestones,
  buildOpsForecastRows,
  buildPortalTrackingView,
  classifyPortalShipmentPhase,
  interpolateGc,
  portalAircraftMapBlocked,
  portalAircraftMapVisible,
  resolveAircraftPosition,
  summarizePortalShipments,
  tripToTrackingInput,
  type PortalTrackingTripInput,
} from './portalTracking'
import type { ChainLeg } from './etaChain'

function sampleD2d(overrides?: Partial<PortalTrackingTripInput>): PortalTrackingTripInput {
  const chain: ChainLeg[] = [
    {
      seq: 1,
      type: 'position',
      branch: 'air',
      label: 'TTP',
      event: 'In Position',
      from: { lat: 41.5, lon: -81.5, icao: 'KCGF', tz: 'America/New_York' },
      to: { lat: 40.9, lon: -81.4, icao: 'KCAK', tz: 'America/New_York' },
      est_start: '2026-07-15T13:00:00.000Z',
      est_end: '2026-07-15T15:00:00.000Z',
      duration_min: 120,
      source: 'assumed',
      duration_source: 'assumed',
      duration_key: 'acft_ttp',
    },
    {
      seq: 2,
      type: 'ground_stop',
      branch: 'air',
      label: 'Turn',
      event: 'Ready Wheels Up',
      from: { lat: 40.9, lon: -81.4, icao: 'KCAK', tz: 'America/New_York' },
      to: { lat: 40.9, lon: -81.4, icao: 'KCAK', tz: 'America/New_York' },
      est_start: '2026-07-15T15:00:00.000Z',
      est_end: '2026-07-15T16:00:00.000Z',
      duration_min: 60,
      source: 'assumed',
      duration_source: 'assumed',
      duration_key: 'acft_turn',
    },
    {
      seq: 3,
      type: 'air_leg',
      branch: 'merged',
      label: 'Live',
      event: 'Wheels Up → Wheels Down',
      from: { lat: 40.9, lon: -81.4, icao: 'KCAK', tz: 'America/New_York' },
      to: { lat: 41.78, lon: -87.75, icao: 'KMDW', tz: 'America/Chicago' },
      est_start: '2026-07-15T16:00:00.000Z',
      est_end: '2026-07-15T17:30:00.000Z',
      duration_min: 90,
      source: 'assumed',
      duration_source: 'assumed',
      duration_key: 'air_time',
      distance_nm: 280,
    },
  ]
  return {
    ref: 2101,
    lane: 'KCAK → KMDW',
    state: 'booked',
    ready_label: 'ASAP',
    payload_summary: 'cargo',
    service_pattern: 'A2A',
    promised_delivery: '2026-07-15T17:30:00.000Z',
    eta_chain: chain,
    legs: chain.map((c, i) => ({
      seq: c.seq,
      type: c.type,
      label: c.label,
      status: i === 0 ? 'active' : 'pending',
      origin: c.from.icao,
      dest: c.to.icao,
      est_start: c.est_start,
      est_end: c.est_end,
      actual_start: null,
      actual_end: null,
    })),
    events: [
      {
        at: '2026-07-15T12:00:00.000Z',
        actor: 'dispatcher',
        kind: 'estimated_quote_sent',
        payload: {},
      },
      {
        at: '2026-07-15T12:30:00.000Z',
        actor: 'system',
        kind: 'eta_chain_copied_to_trip',
        payload: {},
      },
    ],
    documents: [
      {
        id: 'd1',
        kind: 'eta_sheet',
        title: 'ETA sheet',
        at: '2026-07-15T12:30:00.000Z',
        url: '#eta',
      },
    ],
    tail: 'N123AB',
    aircraft_type: 'King Air 200',
    ...overrides,
  }
}

describe('portalTracking', () => {
  it('interpolates great-circle midpoint', () => {
    const mid = interpolateGc(
      { lat: 0, lon: 0 },
      { lat: 0, lon: 10 },
      0.5,
    )
    expect(mid.lat).toBeCloseTo(0, 1)
    expect(mid.lon).toBeCloseTo(5, 1)
  })

  it('builds quote-approved milestone from estimate event', () => {
    const ms = buildMilestones(sampleD2d())
    const quote = ms.find((m) => m.kind === 'quote_approved')
    expect(quote?.done).toBe(true)
    expect(quote?.at).toBeTruthy()
    const booked = ms.find((m) => m.kind === 'booked')
    expect(booked?.done).toBe(true)
  })

  it('reads state_transition events for milestones and timeline', () => {
    const trip = sampleD2d({
      state: 'booked',
      events: [
        {
          at: '2026-07-15T12:00:00.000Z',
          actor: 'dispatcher',
          kind: 'estimated_quote_sent',
          payload: {},
        },
        {
          at: '2026-07-15T12:10:00.000Z',
          actor: 'system',
          kind: 'state_transition',
          payload: { from: 'quoted_estimated', to: 'quoted_hard' },
        },
        {
          at: '2026-07-15T12:20:00.000Z',
          actor: 'client',
          kind: 'state_transition',
          payload: { from: 'quoted_hard', to: 'booked' },
        },
      ],
    })
    const ms = buildMilestones(trip)
    expect(ms.find((m) => m.kind === 'quote_approved')?.at).toBe(
      '2026-07-15T12:10:00.000Z',
    )
    expect(ms.find((m) => m.kind === 'booked')?.at).toBe('2026-07-15T12:20:00.000Z')
    const view = buildPortalTrackingView(trip)
    expect(view.timeline.some((t) => t.label === 'Status change')).toBe(true)
  })

  it('infers en-route position from ETA when mid-air', () => {
    const trip = sampleD2d({
      state: 'in_progress',
      eta_chain: sampleD2d().eta_chain.map((l) =>
        l.type === 'air_leg'
          ? { ...l, actual_start: '2026-07-15T16:00:00.000Z' }
          : l,
      ),
    })
    const pos = resolveAircraftPosition(
      trip,
      null,
      '2026-07-15T16:45:00.000Z',
    )
    expect(pos.source).toBe('eta')
    expect(pos.phase).toBe('airborne')
    expect(pos.lat).not.toBeNull()
    expect(pos.progressPct).toBeGreaterThan(40)
    expect(pos.summary).not.toMatch(/operator|margin|\$/i)
  })

  it('prefers ADS-B over ETA when live', () => {
    const trip = sampleD2d({ state: 'in_progress' })
    const pos = resolveAircraftPosition(
      trip,
      {
        tail: 'N123AB',
        lat: 41.2,
        lon: -84,
        alt: 18000,
        gs: 240,
        seenAt: '2026-07-15T16:20:00.000Z',
        laddBlocked: false,
        phase: 'airborne',
      },
      '2026-07-15T16:25:00.000Z',
    )
    expect(pos.source).toBe('adsb')
    expect(pos.summary).toMatch(/airborne/i)
    expect(pos.summary).toMatch(/N123AB/)
    expect(pos.altFt).toBe(18000)
    expect(pos.fromLat).not.toBeNull()
    expect(pos.toLat).not.toBeNull()
    expect(portalAircraftMapVisible(pos)).toBe(true)
  })

  it('does not pin a days-old last flight as the live map position', () => {
    const trip = sampleD2d({ state: 'in_progress' })
    const pos = resolveAircraftPosition(
      trip,
      {
        tail: 'N6209X',
        lat: 40.8,
        lon: -85.5,
        alt: 0,
        gs: 0,
        seenAt: '2026-08-12T10:42:00.000Z',
        laddBlocked: false,
        phase: 'on_ground',
        originIcao: 'KMSN',
        destinationIcao: 'KHHG',
      },
      '2026-08-17T13:30:00.000Z',
    )
    expect(pos.source).not.toBe('adsb')
    expect(pos.lat).not.toBe(40.8)
  })

  it('shows map-ready coords while positioning before wheels-up', () => {
    const trip = sampleD2d({ state: 'booked' })
    const pos = resolveAircraftPosition(
      trip,
      null,
      '2026-07-15T14:00:00.000Z',
    )
    // Mid-position leg → enroute to pickup (airborne along ferry)
    expect(pos.phase).toBe('airborne')
    expect(pos.summary).toMatch(/enroute to pickup/i)
    expect(pos.lat).not.toBeNull()
    expect(pos.fromIcao).toBeTruthy()
    expect(portalAircraftMapVisible(pos)).toBe(true)
  })

  it('parks at origin when position leg is complete but wheels-up not yet', () => {
    const trip = sampleD2d({
      state: 'booked',
      eta_chain: sampleD2d().eta_chain.map((l) =>
        l.type === 'position'
          ? { ...l, actual_end: '2026-07-15T15:00:00.000Z' }
          : l,
      ),
    })
    const pos = resolveAircraftPosition(
      trip,
      null,
      '2026-07-15T15:30:00.000Z',
    )
    expect(pos.phase).toBe('positioning')
    expect(pos.lat).not.toBeNull()
    expect(portalAircraftMapVisible(pos)).toBe(true)
  })

  it('buildPortalTrackingView never exposes money or carrier name', () => {
    const view = buildPortalTrackingView(sampleD2d())
    expect(view.carrierLabel).toBe('a vetted Part 135 carrier')
    expect(view.etaRows.length).toBeGreaterThan(0)
    expect(view.etaRows[0]!.estDisplay).toMatch(/Z|EDT|EST|CDT|CST|UTC/)
    expect(view.promisedDisplay).toBeTruthy()
    const blob = JSON.stringify(view)
    expect(blob).not.toMatch(/\$|margin|vendor/i)
  })

  it('builds itinerary stops with departure/arrival FBOs and flight facts', () => {
    const view = buildPortalTrackingView(sampleD2d())
    expect(view.flightFacts.tail).toBe('N123AB')
    expect(view.flightFacts.aircraftType).toBe('King Air 200')
    expect(view.flightFacts.originIcao).toBe('KCAK')
    expect(view.flightFacts.destIcao).toBe('KMDW')
    expect(view.flightFacts.wheelsDownDisplay).toBeTruthy()
    const dep = view.stops.find((s) => s.role === 'departure_fbo')
    const arr = view.stops.find((s) => s.role === 'arrival_fbo')
    expect(dep?.icao).toBe('KCAK')
    expect(arr?.icao).toBe('KMDW')
    expect(arr?.etaDisplay).toBeTruthy()
  })

  it('classifies portal shipment phases for cards', () => {
    expect(
      classifyPortalShipmentPhase({
        state: 'in_progress',
        aircraftPhase: 'airborne',
      }),
    ).toBe('in_flight')
    expect(
      classifyPortalShipmentPhase({
        state: 'in_progress',
        aircraftPhase: 'on_ground',
        legs: [{ type: 'truck_delivery', status: 'active' }],
      }),
    ).toBe('on_truck')
    expect(classifyPortalShipmentPhase({ state: 'delivered' })).toBe(
      'delivered',
    )
    expect(classifyPortalShipmentPhase({ state: 'booked' })).toBe('booked')
  })

  it('summarizes shipment counts for the home headline', () => {
    expect(
      summarizePortalShipments(['in_flight', 'on_truck', 'delivered', 'booked']),
    ).toEqual({ inMotion: 1, onGround: 2, delivered: 1 })
  })

  it('exposes PO, code, phase, and dual-time ETA rows on the view', () => {
    const view = buildPortalTrackingView(
      sampleD2d({
        code: 'a3s6d',
        po_number: '12345',
        state: 'in_progress',
        eta_chain: sampleD2d().eta_chain.map((l) =>
          l.type === 'air_leg'
            ? { ...l, actual_start: '2026-07-15T16:00:00.000Z' }
            : l,
        ),
      }),
      { nowIso: '2026-07-15T16:45:00.000Z' },
    )
    expect(view.poNumber).toBe('12345')
    expect(view.code).toBe('a3s6d')
    expect(view.phase).toBe('in_flight')
    expect(view.etaRows[0]!.scheduledLocal).toBeTruthy()
    expect(view.etaRows[0]!.scheduledZulu).toMatch(/Z/)
  })

  it('builds enroute-pickup / at-pickup / enroute-dest / landed stages', () => {
    const rows = buildOpsForecastRows(sampleD2d())
    expect(rows.map((r) => r.key)).toEqual([
      'enroute_pickup',
      'at_pickup',
      'enroute_dest',
      'landed_dest',
    ])
    expect(rows[0]!.label).toMatch(/Enroute to KCAK/)
    expect(rows[1]!.label).toMatch(/At KCAK/)
    expect(rows[2]!.label).toMatch(/Enroute to KMDW/)
    expect(rows[2]!.kind).toBe('duration')
    expect(rows[3]!.label).toMatch(/Landed KMDW/)
  })

  it('builds ops forecast from trip.legs when eta_chain is empty', () => {
    const base = sampleD2d()
    const rows = buildOpsForecastRows({
      ...base,
      eta_chain: [],
      legs: [
        {
          seq: 1,
          type: 'position',
          label: 'Position to KCAK',
          status: 'active',
          origin: 'KBKL',
          dest: 'KCAK',
          est_start: '2026-07-15T13:00:00.000Z',
          est_end: '2026-07-15T15:00:00.000Z',
          actual_start: null,
          actual_end: null,
        },
        {
          seq: 2,
          type: 'ground_stop',
          label: 'Turn',
          status: 'pending',
          origin: 'KCAK',
          dest: 'KCAK',
          est_start: '2026-07-15T15:00:00.000Z',
          est_end: '2026-07-15T16:00:00.000Z',
          actual_start: null,
          actual_end: null,
        },
        {
          seq: 3,
          type: 'air_leg',
          label: 'Live',
          status: 'pending',
          origin: 'KCAK',
          dest: 'KMDW',
          est_start: '2026-07-15T16:00:00.000Z',
          est_end: '2026-07-15T17:30:00.000Z',
          actual_start: null,
          actual_end: null,
        },
      ],
    })
    expect(rows).toHaveLength(4)
    expect(rows[0]!.label).toBe('Enroute to KCAK')
    expect(rows[0]!.status).toBe('active')
    expect(rows[3]!.label).toBe('Landed KMDW')
  })

  it('builds cargo manifest with pax names and cargo lines', () => {
    const cargo = buildCargoManifest(
      sampleD2d({
        payload_kind: 'both',
        pax_count: 2,
        pax_names: ['Ada Lovelace', 'Grace Hopper'],
        cargo_lines: ['Standard tooling 48×40×60', 'Window seat preferred'],
        payload_summary: '2 pax + tooling',
      }),
    )
    expect(cargo.paxCount).toBe(2)
    expect(cargo.paxNames).toEqual(['Ada Lovelace', 'Grace Hopper'])
    expect(cargo.cargoLines.join(' ')).toMatch(/Standard tooling/)
    expect(cargo.cargoLines.join(' ')).toMatch(/Window/)
    const view = buildPortalTrackingView(
      sampleD2d({
        pax_count: 2,
        pax_names: ['Ada Lovelace'],
        cargo_lines: ['Standard tooling'],
        pickup_street: '100 Industrial Pkwy',
      }),
    )
    expect(view.cargo.paxNames).toContain('Ada Lovelace')
    expect(view.pickupStreet).toBe('100 Industrial Pkwy')
    expect(view.opsForecastRows).toHaveLength(4)
  })

  it('overlays ADS-B actual takeoff / landing on trip stages', () => {
    const rows = buildOpsForecastRows(sampleD2d(), {
      nowIso: '2026-07-15T18:00:00.000Z',
      adsb: {
        tail: 'N450CJ',
        lat: 41,
        lon: -87,
        alt: 0,
        gs: 0,
        seenAt: '2026-07-15T17:40:00.000Z',
        phase: 'on_ground',
        laddBlocked: false,
        originIcao: 'KCAK',
        destinationIcao: 'KMDW',
        lastTakeoffAt: '2026-07-15T16:05:00.000Z',
        lastLandingAt: '2026-07-15T17:35:00.000Z',
        takeoffIsActual: true,
        landingIsActual: true,
      },
    })
    expect(rows[0]!.status).toBe('done')
    expect(rows[1]!.status).toBe('done')
    expect(rows[2]!.status).toBe('done')
    expect(rows[2]!.isForecast).toBe(false)
    expect(rows[3]!.status).toBe('done')
    expect(rows[3]!.isForecast).toBe(false)
    expect(rows[3]!.actualOrForecastLocal).toMatch(/on ground/i)
  })

  it('uses ETA track when tail is LADD-blocked (no live ADS-B cover)', () => {
    const trip = sampleD2d({ state: 'in_progress' })
    const pos = resolveAircraftPosition(
      trip,
      {
        tail: 'N123AB',
        lat: 0,
        lon: 0,
        alt: 0,
        gs: 0,
        seenAt: new Date(0).toISOString(),
        laddBlocked: true,
        phase: 'no_data',
      },
      '2026-07-15T16:40:00.000Z',
    )
    // Like FlightAware flight pages: keep the schedule track, don't blank the map.
    expect(pos.laddBlocked).toBe(false)
    expect(pos.source).toBe('eta')
    expect(pos.lat).not.toBeNull()
    expect(portalAircraftMapVisible(pos)).toBe(true)
    expect(portalAircraftMapBlocked(pos)).toBe(false)
  })

  it('no_data ADS-B without LADD still uses ETA track (not blocked)', () => {
    const trip = sampleD2d({ state: 'in_progress' })
    const pos = resolveAircraftPosition(
      trip,
      {
        tail: 'N6209X',
        lat: 0,
        lon: 0,
        alt: 0,
        gs: 0,
        seenAt: new Date(0).toISOString(),
        laddBlocked: false,
        phase: 'no_data',
      },
      '2026-07-15T16:40:00.000Z',
    )
    expect(pos.laddBlocked).toBe(false)
    expect(portalAircraftMapBlocked(pos)).toBe(false)
    expect(pos.source).toBe('eta')
  })

  it('stays enroute to pickup when airborne toward dest without an origin landing', () => {
    const rows = buildOpsForecastRows(sampleD2d({ state: 'in_progress' }), {
      nowIso: '2026-07-15T16:40:00.000Z',
      adsb: {
        tail: 'N123AB',
        lat: 41.3,
        lon: -84,
        alt: 12000,
        gs: 220,
        seenAt: '2026-07-15T16:40:00.000Z',
        phase: 'airborne',
        laddBlocked: false,
        originIcao: 'KCAK',
        destinationIcao: 'KMDW',
        lastTakeoffAt: '2026-07-15T16:05:00.000Z',
        takeoffIsActual: true,
        landingIsActual: false,
      },
    })
    expect(rows[0]!.status).toBe('active')
    expect(rows[1]!.status).toBe('pending')
    expect(rows[2]!.status).toBe('pending')
    expect(rows[3]!.status).toBe('pending')
  })

  it('stays enroute to pickup until FA shows a landing at origin ICAO', () => {
    const rows = buildOpsForecastRows(sampleD2d({ state: 'in_progress' }), {
      nowIso: '2026-08-17T12:00:00.000Z',
      adsb: {
        tail: 'N6209X',
        lat: 40.8,
        lon: -85.5,
        alt: 0,
        gs: 0,
        seenAt: '2026-08-12T10:42:00.000Z',
        phase: 'on_ground',
        laddBlocked: false,
        originIcao: 'KMSN',
        destinationIcao: 'KHHG',
        lastLandingAt: '2026-08-12T10:42:00.000Z',
        landingIsActual: true,
        takeoffIsActual: false,
      },
    })
    expect(rows[0]!.status).toBe('active')
    expect(rows[1]!.status).toBe('pending')
    expect(rows[2]!.status).toBe('pending')
    expect(rows[3]!.status).toBe('pending')
  })

  it('moves to at-pickup only after landing at origin ICAO', () => {
    const rows = buildOpsForecastRows(sampleD2d({ state: 'in_progress' }), {
      nowIso: '2026-08-17T15:00:00.000Z',
      adsb: {
        tail: 'N6209X',
        lat: 41.4,
        lon: -81.8,
        alt: 0,
        gs: 0,
        seenAt: '2026-08-17T14:55:00.000Z',
        phase: 'on_ground',
        laddBlocked: false,
        originIcao: 'KBKL',
        destinationIcao: 'KCAK',
        lastLandingAt: '2026-08-17T14:50:00.000Z',
        landingIsActual: true,
        takeoffIsActual: false,
      },
    })
    expect(rows[0]!.status).toBe('done')
    expect(rows[1]!.status).toBe('active')
    expect(rows[2]!.status).toBe('pending')
    expect(rows[3]!.status).toBe('pending')
  })

  it('moves to enroute-dest only after origin landing then airborne again', () => {
    const base = sampleD2d({ state: 'in_progress' })
    const rows = buildOpsForecastRows(
      {
        ...base,
        eta_chain: base.eta_chain.map((l) =>
          l.type === 'position'
            ? { ...l, actual_end: '2026-07-15T14:50:00.000Z' }
            : l,
        ),
      },
      {
        nowIso: '2026-07-15T16:40:00.000Z',
        adsb: {
          tail: 'N123AB',
          lat: 41.3,
          lon: -84,
          alt: 12000,
          gs: 220,
          seenAt: '2026-07-15T16:40:00.000Z',
          phase: 'airborne',
          laddBlocked: false,
          originIcao: 'KCAK',
          destinationIcao: 'KMDW',
          lastTakeoffAt: '2026-07-15T16:05:00.000Z',
          takeoffIsActual: true,
          landingIsActual: false,
        },
      },
    )
    expect(rows[0]!.status).toBe('done')
    expect(rows[1]!.status).toBe('done')
    expect(rows[2]!.status).toBe('active')
    expect(rows[3]!.status).toBe('pending')
  })

  it('keeps dest landing active until 10 min on ground, then Delivered', () => {
    const adsb = {
      tail: 'N123AB',
      lat: 41.78,
      lon: -87.75,
      alt: 0,
      gs: 0,
      seenAt: '2026-07-15T17:36:00.000Z',
      phase: 'on_ground' as const,
      laddBlocked: false,
      originIcao: 'KCAK',
      destinationIcao: 'KMDW',
      lastTakeoffAt: '2026-07-15T16:05:00.000Z',
      lastLandingAt: '2026-07-15T17:35:00.000Z',
      takeoffIsActual: true,
      landingIsActual: true,
    }
    const early = buildOpsForecastRows(sampleD2d({ state: 'in_progress' }), {
      nowIso: '2026-07-15T17:40:00.000Z',
      adsb,
    })
    expect(early[2]!.status).toBe('done')
    expect(early[3]!.status).toBe('active')
    expect(early[3]!.label).toMatch(/Landed KMDW/)

    const later = buildOpsForecastRows(sampleD2d({ state: 'in_progress' }), {
      nowIso: '2026-07-15T17:46:00.000Z',
      adsb,
    })
    expect(later[3]!.status).toBe('done')
    expect(later[3]!.label).toBe('Delivered')
    const view = buildPortalTrackingView(sampleD2d({ state: 'in_progress' }), {
      nowIso: '2026-07-15T17:46:00.000Z',
      adsb,
    })
    expect(view.phase).toBe('delivered')
  })
})

describe('tripToTrackingInput tail resolution', () => {
  it('recovers tail from hard_quote option when quick is empty', () => {
    const input = tripToTrackingInput({
      ref: 89,
      lane: 'KCAK→KSHV',
      state: 'in_progress',
      ready_label: 'ASAP',
      payload_summary: 'cargo',
      legs: [],
      events: [],
      quick: { tail: '', aircraft_type: '', po: '00002' },
      hard_quote: {
        payload_kind: 'cargo',
        options: [{ offer_id: 'o1', label: 'A', client_total: 1, eta_end: null, fee_scope: null, tail: 'N310XX', type_name: 'C310' }],
      },
      offers: [],
    } as never)
    expect(input.tail).toBe('N310XX')
  })

  it('recovers tail from quick_dispatch event', () => {
    const input = tripToTrackingInput({
      ref: 90,
      lane: 'KCAK→KSHV',
      state: 'in_progress',
      ready_label: 'ASAP',
      payload_summary: 'cargo',
      legs: [],
      events: [
        {
          at: new Date().toISOString(),
          actor: 'dispatcher',
          kind: 'quick_dispatch',
          payload: { tail: 'N450CJ', aircraft_type: 'Citation' },
        },
      ],
      quick: { tail: '', po: '00002' },
      offers: [],
    } as never)
    expect(input.tail).toBe('N450CJ')
  })
})
