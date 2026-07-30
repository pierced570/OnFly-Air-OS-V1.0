import { describe, expect, it } from 'vitest'
import {
  createQuickDispatchTrip,
  getTrip,
  setTripPassengers,
} from '@/lib/tripStore'

describe('setTripPassengers', () => {
  it('saves structured passengers and syncs portal_pax_names', () => {
    const trip = createQuickDispatchTrip({
      client_id: 'c1',
      client_name: 'Acme',
      po: '1001',
      timing: 'asap',
      roundtrip: false,
      cargo_only: false,
      operator_name: 'Sky Cargo',
      aircraft_type: 'Caravan',
      tail: 'NTEST',
      vendor_cost: 4000,
      client_price: 6500,
      pay_terms: 'Net 30',
      invoice_email: 'ap@acme.test',
      cc_emails: [],
      send_invoice: false,
      referred_by: '',
      referral_id: null,
      referral_share_amount: null,
      notes: '',
      legs: [
        {
          origin_icao: 'KGSP',
          dest_icao: 'KCVG',
          date: '',
          pax: 1,
          repo_time: '2h',
          live_leg_time: '1h',
        },
      ],
    })

    setTripPassengers(trip.id, [
      {
        id: 'p1',
        name: 'Alex Tech',
        weight_lbs: 180,
        dob: '1990-05-01',
      },
      { id: 'p2', name: '  ', weight_lbs: '', dob: '' },
    ])

    const row = getTrip(trip.id)!
    expect(row.passengers).toHaveLength(1)
    expect(row.passengers?.[0]).toMatchObject({
      name: 'Alex Tech',
      weight_lbs: 180,
      dob: '1990-05-01',
    })
    expect(row.portal_pax_names).toEqual(['Alex Tech'])
    expect(
      row.events.some((e) => e.kind === 'passenger_info_updated'),
    ).toBe(true)
  })
})
