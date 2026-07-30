import { describe, expect, it } from 'vitest'
import { buildInvoiceItineraryLines } from '@/domain/qbInvoice'
import type { TripStoreRow } from '@/lib/tripStore'
import { invoiceTripFacts } from './invoiceTripFacts'

function baseTrip(over: Partial<TripStoreRow> = {}): TripStoreRow {
  return {
    id: 't1',
    ref: 1,
    code: 'AB001',
    lane: 'KNQA → KDFW',
    state: 'booked',
    client_id: null,
    client_name: 'PSA Airlines',
    po_number: '00346',
    payload_summary: 'cargo',
    ready_label: 'ASAP',
    legs: [],
    offers: [],
    candidates: [],
    participants: [],
    documents: [],
    events: [],
    exceptions: [],
    hard_quote: null,
    invoice: null,
    eta_chain: [
      {
        seq: 1,
        type: 'position',
        branch: 'air',
        label: 'Position',
        event: 'Position',
        from: { lat: 0, lon: 0, icao: 'KMEM' },
        to: { lat: 0, lon: 0, icao: 'KNQA' },
        est_start: '2026-07-28T12:00:00.000Z',
        est_end: '2026-07-28T14:15:00.000Z',
        duration_min: 135,
        duration_key: 'acft_ttp',
        source: 'quoted',
        duration_source: 'quoted',
      },
      {
        seq: 2,
        type: 'air_leg',
        branch: 'air',
        label: 'Live',
        event: 'Wheels Up',
        from: { lat: 0, lon: 0, icao: 'KNQA' },
        to: { lat: 0, lon: 0, icao: 'KDFW' },
        est_start: '2026-07-28T14:15:00.000Z',
        est_end: '2026-07-28T16:00:00.000Z',
        duration_min: 105,
        source: 'quoted',
        duration_source: 'quoted',
      },
    ],
    quick: {
      client_id: '',
      client_name: 'PSA Airlines',
      po: '00346',
      timing: 'asap',
      roundtrip: false,
      cargo_only: true,
      operator_name: 'Test Op',
      aircraft_type: 'MU2',
      tail: 'N175CA',
      vendor_cost: 8000,
      client_price: 10600,
      pay_terms: 'Net 30',
      invoice_email: 'ap@psa.test',
      cc_emails: [],
      send_invoice: true,
      referred_by: '',
      notes: '',
      legs: [
        {
          origin_icao: 'KNQA',
          dest_icao: 'KDFW',
          date: '2026-07-28',
          pax: 0,
          repo_time: '2h 15m',
          live_leg_time: '1h 45m',
        },
      ],
    },
    ...over,
  } as TripStoreRow
}

describe('invoiceTripFacts', () => {
  it('builds itinerary + amount for payment-request email / QBO memo', () => {
    const facts = invoiceTripFacts(baseTrip(), { poNumber: '00346' })
    expect(facts.amountUsd).toBe(10600)
    expect(facts.tail).toBe('N175CA')
    expect(facts.aircraftType).toBe('MU2')
    expect(facts.itineraryLines).toEqual(
      buildInvoiceItineraryLines({
        lane: 'KNQA → KDFW',
        pickupEtaMin: 135,
        liveLegMin: 105,
        originIcao: 'KNQA',
        destIcao: 'KDFW',
      }),
    )
    expect(facts.itineraryLines.some((l) => /Pickup in NQA/.test(l))).toBe(true)
  })
})
