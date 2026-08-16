import { describe, expect, it } from 'vitest'
import { buildInvoiceEmailTemplate } from './buildInvoiceEmail'
import type { TripStoreRow } from './tripStore'

function baseTrip(over: Partial<TripStoreRow> = {}): TripStoreRow {
  return {
    id: 't-inv-email',
    ref: 76,
    code: 'AB076',
    lane: 'KCAK → KHPN',
    state: 'booked',
    client_id: null,
    client_name: 'PSA Airlines',
    po_number: 'T-76',
    payload_summary: 'cargo',
    ready_label: 'ASAP',
    service_pattern: 'A2A',
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
        from: { lat: 0, lon: 0, icao: 'KCLE', tz: 'America/New_York' },
        to: { lat: 0, lon: 0, icao: 'KCAK', tz: 'America/New_York' },
        est_start: '2026-08-15T16:00:00.000Z',
        est_end: '2026-08-15T17:00:00.000Z',
        duration_min: 60,
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
        from: { lat: 0, lon: 0, icao: 'KCAK', tz: 'America/New_York' },
        to: { lat: 0, lon: 0, icao: 'KHPN', tz: 'America/New_York' },
        est_start: '2026-08-15T18:47:00.000Z',
        est_end: '2026-08-15T20:58:00.000Z',
        duration_min: 131,
        source: 'quoted',
        duration_source: 'quoted',
      },
    ],
    quick: {
      client_id: '',
      client_name: 'PSA Airlines',
      po: 'T-76',
      timing: 'asap',
      roundtrip: false,
      cargo_only: true,
      operator_name: 'Test Op',
      aircraft_type: 'Cessna 310',
      tail: 'N6209X',
      vendor_cost: 8000,
      client_price: 12658,
      pay_terms: 'Net 30',
      invoice_email: 'ap@psa.test',
      cc_emails: [],
      send_invoice: true,
      referred_by: '',
      notes: '',
      legs: [
        {
          origin_icao: 'KCAK',
          dest_icao: 'KHPN',
          date: '2026-08-15',
          pax: 0,
          repo_time: '1h',
          live_leg_time: '2h 11m',
        },
      ],
    },
    ...over,
  } as TripStoreRow
}

describe('buildInvoiceEmailTemplate', () => {
  it('builds ETA-sheet chrome with portal + milestones for invoice send', () => {
    const tpl = buildInvoiceEmailTemplate({
      trip: baseTrip(),
      portalUrl: 'https://ofaops.onflyair.com/portal/track/abc',
      amountUsd: 12658,
      payUrl: 'https://qbo.example/pay',
    })
    expect(tpl.poNumber).toMatch(/T-76/)
    expect(tpl.laneShort).toBe('CAK → HPN')
    expect(tpl.tail).toBe('N6209X')
    expect(tpl.aircraftType).toMatch(/Cessna 310/)
    expect(tpl.amountUsd).toBe(12658)
    expect(tpl.portalUrl).toContain('/portal/track/')
    expect(tpl.pickup.kind).toBe('pickup')
    expect(tpl.dropoff.kind).toBe('dropoff')
    expect(tpl.milestones.length).toBeGreaterThan(0)
    expect(tpl.milestones.some((m) => /Wheels up|Landing|Arrive/i.test(m.label))).toBe(
      true,
    )
    expect(tpl.patternLabel).toContain('AIRPORT')
  })
})
