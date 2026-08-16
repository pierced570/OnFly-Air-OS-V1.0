import { describe, expect, it } from 'vitest'
import { createQuickDispatchTrip, getTrip } from '@/lib/tripStore'
import { exclusiveDrawerForTrip } from '@/domain/dispatchCenter'

describe('createQuickDispatchTrip ETA spine', () => {
  it('materializes eta_chain + timed legs for Tracking / ETA sheet', () => {
    const trip = createQuickDispatchTrip({
      client_id: 'c1',
      client_name: 'Acme',
      po: '1001',
      timing: 'asap',
      roundtrip: false,
      cargo_only: true,
      operator_name: 'Sky Cargo',
      aircraft_type: 'Caravan',
      tail: 'NTEST',
      vendor_cost: 4000,
      client_price: 6500,
      pay_terms: 'Net 30',
      invoice_email: 'ap@acme.test',
      cc_emails: ['ops@acme.test'],
      send_invoice: true,
      referred_by: '',
      referral_id: null,
      referral_share_amount: null,
      notes: '',
      legs: [
        {
          origin_icao: 'KCAK',
          dest_icao: 'KMDW',
          date: '',
          pax: 0,
          repo_time: '2h',
          live_leg_time: '1h',
        },
      ],
    })
    const row = getTrip(trip.id)!
    expect(row.eta_chain.length).toBeGreaterThanOrEqual(3)
    expect(row.legs.length).toBe(row.eta_chain.length)
    expect(row.legs[0]!.est_end).toBeTruthy()
    expect(row.promised_delivery).toBeTruthy()
    expect(row.state).toBe('booked')
    expect(row.po_number).toBe('1001')
    expect(row.quick?.po).toBe('1001')
    // After desk transition, exclusive drawer is tracking
    expect(
      exclusiveDrawerForTrip({ state: 'in_progress', offers: [] }),
    ).toBe('tracking')
  })
})
