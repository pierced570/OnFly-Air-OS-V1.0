import { describe, expect, it } from 'vitest'
import { mapEtaNodeRows } from './mapEtaNodeRow'
import { stubTripFromPortalRow } from './portalTripHydrate'
import {
  buildPortalTrackingView,
  portalAircraftMapVisible,
  tripToTrackingInput,
} from '@/domain/portalTracking'

describe('portal ETA hydrate', () => {
  it('maps portal_eta_nodes rows into a chain that activates tracking UI', () => {
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
    expect(chain[0]?.type).toBe('position')
    expect(chain[1]?.type).toBe('air_leg')

    const stub = stubTripFromPortalRow(
      {
        id: 't1',
        ref: 76,
        code: 'TN285',
        state: 'in_progress',
        lane_label: 'KCAK → KHPN',
        po_number: 'T-76',
        service_pattern: 'A2A',
      },
      [],
      chain,
    )
    expect(stub.eta_chain).toHaveLength(2)

    const view = buildPortalTrackingView(
      tripToTrackingInput({
        ...stub,
        ready_label: 'ASAP',
        payload_summary: 'cargo',
        events: [],
        documents: [],
        quick: { tail: 'N6209X', aircraft_type: 'Cessna 310', po: 'T-76' },
      }),
    )
    expect(view.opsForecastRows.length).toBeGreaterThan(0)
    expect(portalAircraftMapVisible(view.aircraft)).toBe(true)
    expect(view.code).toBe('TN285')
  })
})
