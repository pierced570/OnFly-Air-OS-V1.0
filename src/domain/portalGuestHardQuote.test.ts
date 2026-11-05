import { describe, expect, it } from 'vitest'
import { emptyTripRequestDraft } from '@/domain/tripRequest'
import {
  buildPortalDispatchSees,
  portalGuestHardQuoteSoftBand,
} from './portalGuestHardQuote'

describe('portalGuestHardQuote', () => {
  it('builds dispatch preview + light-jet soft band for a DFW→ORD door move', () => {
    const draft = emptyTripRequestDraft()
    draft.email = 'ops@summitaero.com'
    draft.client_name = 'Summit Aero Components'
    draft.service_mode = 'd2d'
    draft.timing = 'asap'
    draft.hazmat = false
    draft.forklift_required = true
    draft.cargo_weight_lbs = 800
    draft.legs = [
      {
        ...draft.legs[0]!,
        origin_icao: 'KDFW',
        dest_icao: 'KORD',
        pickup_address: '2201 W Airfield Dr, DFW Airport, TX',
        dropoff_address: '4120 Industrial Pkwy, Elk Grove Village, IL',
        cargo_dims_status: 'known',
      },
    ]
    // one standard skid dims via notes/pieces — weight alone is enough for preview
    draft.cargo_notes = '1 skid 48x40x60 @ 800ea'

    const view = buildPortalDispatchSees(draft)
    expect(view.who).toContain('Summit Aero')
    expect(view.move).toMatch(/Door → Door/)
    expect(view.move).toMatch(/KDFW → KORD/)
    expect(view.readyLine).toMatch(/Within 4/)
    expect(view.flags).toMatch(/Forklift/)
    expect(view.from?.code).toBe('KDFW')
    expect(view.to?.code).toBe('KORD')
    expect(view.soft?.name).toBe('Light jet')
    const band = portalGuestHardQuoteSoftBand(view.soft)
    expect(band?.price).toMatch(/^\$[\d,]+ — \$[\d,]+$/)
    expect(band?.blurb).toMatch(/desk confirms the hard quote/)
  })

  it('marks not ready without email or airports', () => {
    const draft = emptyTripRequestDraft()
    expect(buildPortalDispatchSees(draft).ready).toBe(false)
  })
})
