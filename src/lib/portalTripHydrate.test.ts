import { describe, expect, it } from 'vitest'
import { mapEtaNodeRows } from './mapEtaNodeRow'
import {
  coercePortalEtaChain,
  portalSafeQuickFromRow,
  stubTripFromPortalRow,
  synthesizeLegsFromLane,
} from './portalTripHydrate'
import {
  buildPortalTrackingView,
  portalAircraftMapVisible,
  tripToTrackingInput,
} from '@/domain/portalTracking'

describe('portal ETA + award hydrate', () => {
  it('fills aircraft / stops / timeline from eta nodes + portal trip facts', () => {
    const chain = mapEtaNodeRows([
      {
        seq: 1,
        type: 'position',
        branch: 'air',
        label: 'Position',
        event: 'Arrive origin',
        from_icao: 'KCLE',
        to_icao: 'KCAK',
        from_tz: 'America/New_York',
        to_tz: 'America/New_York',
        from_lat: 41.4,
        from_lon: -81.8,
        to_lat: 40.9,
        to_lon: -81.4,
        est_start: '2026-08-15T16:00:00.000Z',
        est_end: '2026-08-15T18:00:00.000Z',
        duration_min: 120,
        duration_key: 'acft_ttp',
        source: 'quoted',
      },
      {
        seq: 2,
        type: 'air_leg',
        branch: 'air',
        label: 'Live',
        event: 'Wheels up',
        from_icao: 'KCAK',
        to_icao: 'KHPN',
        from_tz: 'America/New_York',
        to_tz: 'America/New_York',
        from_lat: 40.9,
        from_lon: -81.4,
        to_lat: 41.06,
        to_lon: -73.7,
        est_start: '2026-08-15T18:47:00.000Z',
        est_end: '2026-08-15T20:58:00.000Z',
        duration_min: 131,
        source: 'quoted',
      },
    ])
    expect(chain).toHaveLength(2)

    const stub = stubTripFromPortalRow(
      {
        id: 't1',
        ref: 76,
        code: 'TN285',
        state: 'in_progress',
        lane_label: 'KCAK → KHPN',
        po_number: 'T-76',
        service_pattern: 'A2A',
        payload_summary: 'AOG cargo',
        ready_label: 'ASAP',
        tail: 'N6209X',
        aircraft_type: 'Cessna 310',
        portal_pickup_address: 'Hangar 5 · CAK',
        portal_dropoff_address: 'Signature HPN',
        portal_pax_names: [],
        portal_chat: [
          {
            id: 'm1',
            at: '2026-08-17T12:00:00.000Z',
            role: 'client',
            from_label: 'Client',
            body: 'Need a forklift',
          },
        ],
        cargo_notes: 'Priority AOG part',
        cargo_only: true,
      },
      [],
      chain,
    )
    expect(stub.eta_chain).toHaveLength(2)
    expect(stub.quick?.tail).toBe('N6209X')
    expect(stub.quick?.aircraft_type).toBe('Cessna 310')
    expect(stub.portal_pickup_address).toBe('Hangar 5 · CAK')
    expect(stub.portal_dropoff_address).toBe('Signature HPN')

    const view = buildPortalTrackingView(tripToTrackingInput(stub))
    expect(view.opsForecastRows.length).toBeGreaterThan(0)
    expect(portalAircraftMapVisible(view.aircraft)).toBe(true)
    expect(view.tail).toBe('N6209X')
    expect(view.aircraftType).toBe('Cessna 310')
    expect(view.pickupStreet).toBe('Hangar 5 · CAK')
    expect(view.dropoffStreet).toBe('Signature HPN')
    expect(view.stops.length).toBeGreaterThan(0)
    expect(view.cargo.cargoLines).toContain('Priority AOG part')
    expect(view.code).toBe('TN285')
    expect(stub.portal_chat).toHaveLength(1)
    expect(stub.portal_chat?.[0]?.body).toBe('Need a forklift')
  })

  it('falls back to award RPC fields when session_meta quick is empty', () => {
    const quick = portalSafeQuickFromRow(
      { po_number: 'T-76' },
      { tail: 'N643EA', aircraft_type: 'King Air 90' },
    )
    expect(quick?.tail).toBe('N643EA')
    expect(quick?.aircraft_type).toBe('King Air 90')
    expect(quick?.vendor_cost).toBe(0)
    expect(quick?.client_price).toBe(0)
  })

  it('does not invent TBD when portal trip has no tail', () => {
    const quick = portalSafeQuickFromRow(
      { po_number: '000067', aircraft_type: 'C310' },
      null,
    )
    expect(quick?.tail).toBe('')
    expect(quick?.aircraft_type).toBe('C310')
    const stub = stubTripFromPortalRow(
      {
        id: 't84',
        ref: 84,
        state: 'in_progress',
        lane_label: 'KCAK → KHPN · KHPN → KCAK',
        po_number: '000067',
        payload_summary: 'cargo',
        ready_label: 'ASAP',
        aircraft_type: 'C310',
      },
      [],
      [],
    )
    expect(stub.quick?.tail).toBe('')
    const view = buildPortalTrackingView(tripToTrackingInput(stub))
    expect(view.tail).toBeFalsy()
  })

  it('recovers KCLT→KICT ICAOs from lane when legs + eta nodes are empty', () => {
    const stub = stubTripFromPortalRow(
      {
        id: 't90',
        ref: 90,
        code: 'T-90',
        state: 'booked',
        lane_label: 'KCLT→KICT',
        po_number: 'TEST',
        payload_summary: 'cargo',
        ready_label: 'ASAP',
        service_pattern: 'A2A',
      },
      [],
      [],
    )
    expect(synthesizeLegsFromLane({ id: 't90', lane_label: 'KCLT→KICT' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origin: 'KCLT', dest: 'KICT', type: 'air_leg' }),
      ]),
    )
    expect(stub.legs[0]?.origin).toBe('KCLT')
    expect(stub.legs[0]?.dest).toBe('KICT')

    const view = buildPortalTrackingView(tripToTrackingInput(stub))
    expect(view.flightFacts.originIcao).toBe('KCLT')
    expect(view.flightFacts.destIcao).toBe('KICT')
    expect(view.stops.some((s) => s.icao === 'KCLT')).toBe(true)
    expect(view.stops.some((s) => s.icao === 'KICT')).toBe(true)
  })

  it('uses session_meta eta_chain jsonb when trip_eta_nodes are empty', () => {
    const metaChain = [
      {
        seq: 1,
        type: 'air_leg',
        branch: 'air',
        label: 'Live',
        event: 'Wheels up',
        from: { icao: 'KCLT', lat: 35.2, lon: -80.9, tz: 'America/New_York' },
        to: { icao: 'KICT', lat: 37.6, lon: -97.4, tz: 'America/Chicago' },
        est_start: '2026-08-17T14:00:00.000Z',
        est_end: '2026-08-17T16:30:00.000Z',
        actual_start: null,
        actual_end: null,
        duration_min: 150,
        source: 'assumed',
        duration_source: 'assumed',
      },
    ]
    expect(coercePortalEtaChain(metaChain)).toHaveLength(1)
    const stub = stubTripFromPortalRow(
      {
        id: 't90b',
        ref: 90,
        state: 'in_progress',
        lane_label: 'KCLT→KICT',
        payload_summary: 'cargo',
        ready_label: 'ASAP',
        tail: 'N123AB',
        aircraft_type: 'C310',
        eta_chain: metaChain,
      },
      [],
      [],
    )
    expect(stub.eta_chain).toHaveLength(1)
    const view = buildPortalTrackingView(tripToTrackingInput(stub))
    expect(view.opsForecastRows.length).toBeGreaterThan(0)
    expect(view.flightFacts.originIcao).toBe('KCLT')
    expect(view.tail).toBe('N123AB')
  })
})
