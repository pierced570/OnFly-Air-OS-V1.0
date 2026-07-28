import { describe, expect, it } from 'vitest'
import type { TrackingStop } from '@/domain/portalTracking'
import { enrichTrackingStops } from './portalTrackingEnrich'
import { addFbo, listFbos } from '@/lib/fboStore'

describe('portalTrackingEnrich', () => {
  it('attaches FBO name and address for airport stops', () => {
    const icao = 'KZZZ'
    // Ensure a known FBO for this airport
    if (!listFbos().some((f) => f.airport_icao === icao)) {
      addFbo({
        name: 'Test Flight Support',
        airport_icao: icao,
        phone: '+15555550100',
        after_hours_phone: '',
        is_24hr: true,
        forklift: true,
        forklift_capacity_lbs: 4000,
        gl_insurance: true,
        gl_coverage: 1_000_000,
        fee_handling: 50,
        fee_ramp: 20,
        fee_overnight: 40,
        fee_callout: 75,
        fees_waived_with_fuel: false,
        street: '1 Ramp Way',
        city: 'Testville',
        state: 'OH',
        zip: '44000',
        lat: 41,
        lon: -81,
        notes: '',
      })
    }

    const stops: TrackingStop[] = [
      {
        role: 'arrival_fbo',
        title: 'Arrival FBO / airport',
        icao,
        placeLabel: icao,
        addressHint: null,
        etaDisplay: '1:30 PM CDT',
        etaActualDisplay: null,
        status: 'pending',
        tz: 'America/Chicago',
        event: 'Wheels down',
      },
    ]
    const enriched = enrichTrackingStops(stops)
    expect(enriched[0]!.fboName).toBe('Test Flight Support')
    expect(enriched[0]!.displayAddress).toMatch(/1 Ramp Way/)
    expect(enriched[0]!.fboPhone).toBe('+15555550100')
  })
})
