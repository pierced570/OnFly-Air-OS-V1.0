import { describe, expect, it } from 'vitest'
import { flagAwbIfNeeded, clearAwbFlag, tripNeedsAwb } from '@/lib/awbFlagFlow'
import { listExceptions } from '@/lib/exceptionStore'
import { listOpenNeedsInfo } from '@/lib/needsInfoStore'
import { createQuickDispatchTrip, getTrip } from '@/lib/tripStore'

function qd(
  origin: string,
  dest: string,
  cargo_only: boolean,
) {
  return createQuickDispatchTrip({
    client_id: 'c1',
    client_name: 'Test Client',
    po: '00350',
    timing: 'asap',
    roundtrip: false,
    cargo_only,
    operator_name: 'Exec Shuttle',
    aircraft_type: 'Citation',
    tail: 'N643EA',
    vendor_cost: 8000,
    client_price: 10000,
    pay_terms: 'Net 30',
    invoice_email: 'ap@test.com',
    cc_emails: [],
    send_invoice: false,
    referred_by: '',
    referral_id: null,
    referral_share_amount: null,
    notes: '',
    legs: [
      {
        origin_icao: origin,
        dest_icao: dest,
        date: '',
        pax: cargo_only ? 0 : 2,
        repo_time: '2h',
        live_leg_time: '1h',
      },
    ],
  })
}

describe('awbFlagFlow', () => {
  it('flags intl cargo when send/book path runs', () => {
    const trip = qd('KGSP', 'CYYZ', true)
    expect(tripNeedsAwb(trip)).toBe(true)
    expect(flagAwbIfNeeded(trip.id)).toBe(true)
    const next = getTrip(trip.id)!
    expect(next.awb_needed).toBe(true)
    expect(
      listOpenNeedsInfo().some(
        (t) => t.entity_id === trip.id && t.field === 'awb',
      ),
    ).toBe(true)
    expect(
      listExceptions().some(
        (e) => e.trip_id === trip.id && e.title === 'AWB needed',
      ),
    ).toBe(true)
    expect(flagAwbIfNeeded(trip.id)).toBe(true)
    clearAwbFlag(trip.id)
    expect(getTrip(trip.id)!.awb_needed).toBe(false)
    expect(tripNeedsAwb(getTrip(trip.id)!)).toBe(false)
  })

  it('does not flag domestic cargo', () => {
    const trip = qd('KCAK', 'KBGR', true)
    expect(flagAwbIfNeeded(trip.id)).toBe(false)
    expect(getTrip(trip.id)!.awb_needed).toBeFalsy()
  })

  it('does not flag intl pax-only', () => {
    const trip = qd('KGSP', 'CYYZ', false)
    expect(flagAwbIfNeeded(trip.id)).toBe(false)
  })
})
