import { describe, expect, it } from 'vitest'
import { mapEtaNodeRows } from './mapEtaNodeRow'
import {
  portalSafeQuickFromRow,
  stubTripFromPortalRow,
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
})
