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

  it('logs FET vs other tax on financials while client invoice stays all-in', () => {
    const trip = stubTrip({
      id: 'trip-tax-1',
      candidates: [
        {
          aircraft_id: 'a1',
          operator_id: 'o1',
          operator_name: 'Op',
          tail: 'N900XX',
          type_name: 'King Air 200',
          mtow_lbs: 12500,
          cost: 8000,
          price: 10000,
          chain: [],
          confidence: 1,
          needsInfo: [],
          bookingGated: false,
          reasoning: [],
          eta_end: new Date().toISOString(),
          circuit_nm: 300,
          rate_per_nm: 8,
          rate_source: 'assumption',
        },
      ],
      offers: [
        {
          id: 'off1',
          aircraft_id: 'a1',
          operator_name: 'Op',
          type_name: 'King Air 200',
          tail: 'N900XX',
          state: 'selected',
          price_net: 8000,
          magic_token: 'tok',
          bookingGated: false,
          needsInfo: [],
          contact_cell: '',
          contact_cell_is_mock: true,
          contact_email: '',
          quote_link_channel: 'email',
        } as unknown as TripStoreRow['offers'][number],
      ],
      hard_quote: {
        total: 10625,
        accept_token: 'acc',
        payload_kind: 'cargo',
        options: [
          {
            offer_id: 'off1',
            label: 'A',
            client_total: 10625,
            eta_end: null,
            fee_scope: null,
            type_name: 'King Air 200',
            time_to_position_min: 90,
            quick_turn_min: 40,
            live_leg_min: 75,
          },
        ],
      },
    })
    const row = ensureFinancialFromBookedTrip(trip)
    expect(row.client_invoiced_amount).toBe(10625)
    expect(row.client_subtotal_pre_tax).toBe(10000)
    expect(row.tax_total).toBe(625)
    expect(row.tax_breakdown.some((l) => l.code === 'FET_CARGO')).toBe(true)
  })
})
