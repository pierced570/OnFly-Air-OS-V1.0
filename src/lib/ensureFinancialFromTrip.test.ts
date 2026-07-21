import { beforeEach, describe, expect, it } from 'vitest'
import { addReferral, __resetReferralsForTests } from '@/lib/referralStore'
import {
  clearFinancialOverrides,
  getFinancial,
} from '@/lib/financialsStore'
import { ensureFinancialFromBookedTrip } from '@/lib/ensureFinancialFromTrip'
import type { TripStoreRow } from '@/lib/tripStore'

function stubTrip(partial: Partial<TripStoreRow> & { id: string }): TripStoreRow {
  return {
    ref: 1,
    state: 'booked',
    lane: 'KCAK → KMDW',
    payload_summary: 'cargo',
    ready_label: 'ASAP',
    candidates: [],
    offers: [],
    eta_chain: [],
    service_pattern: 'A2A',
    promised_delivery: null,
    eta_defaults_snapshot: {},
    thread_number: null,
    thread_disbanded_at: null,
    legs: [],
    participants: [],
    thread: [],
    documents: [],
    invoice: null,
    events: [],
    ...partial,
  } as TripStoreRow
}

describe('ensureFinancialFromBookedTrip', () => {
  beforeEach(() => {
    __resetReferralsForTests()
    clearFinancialOverrides()
  })

  it('writes referral name + computed share onto ledger', () => {
    const person = addReferral({
      name: 'Casey Broker',
      share_mode: 'percent_margin',
      share_value: 10,
    })
    const trip = stubTrip({
      id: 'trip-ref-1',
      quick: {
        client_id: 'c1',
        client_name: 'Acme Air',
        po: 'PO #00999',
        timing: 'asap',
        roundtrip: false,
        cargo_only: true,
        operator_name: 'Sky Op',
        aircraft_type: 'Citation',
        tail: 'N123AB',
        vendor_cost: 9000,
        client_price: 10000,
        pay_terms: 'Net 30',
        invoice_email: 'bill@acme.test',
        cc_emails: [],
        send_invoice: false,
        referred_by: person.name,
        referral_id: person.id,
        referral_share_amount: null,
        notes: '',
        legs: [
          {
            origin_icao: 'KCAK',
            dest_icao: 'KMDW',
            date: '2026-07-20',
            pax: 0,
            repo_time: '',
            live_leg_time: '',
          },
        ],
      },
      referral: {
        id: person.id,
        name: person.name,
        share_amount: 100,
      },
    })

    const row = ensureFinancialFromBookedTrip(trip)
    expect(row.referral_name).toBe('Casey Broker')
    expect(row.referral_share_amount).toBe(100)
    expect(row.margin).toBe(1000)
    expect(getFinancial(row.id)?.referral_name).toBe('Casey Broker')
  })
})
