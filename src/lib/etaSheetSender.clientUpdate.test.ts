import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '@/domain/routing'
import { getMockSentEmails } from '@/adapters/email'
import {
  getEtaSheetThreadMeta,
  sendClientTrackingUpdate,
} from './etaSheetSender'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  mutateTrip,
  type TripStoreRow,
} from './tripStore'

function cand(tail: string): Candidate {
  return {
    aircraft_id: crypto.randomUUID(),
    operator_id: crypto.randomUUID(),
    operator_name: `Op ${tail}`,
    tail,
    type_name: 'King Air 200',
    mtow_lbs: 12500,
    cost: 4000,
    price: 4600,
    chain: [],
    confidence: 0.8,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: new Date().toISOString(),
    circuit_nm: 300,
    rate_per_nm: 8,
    rate_source: 'assumption',
  }
}

describe('eta sheet client update thread', () => {
  beforeEach(() => {
    __resetTripsForTests()
    vi.stubEnv('VITE_EMAIL_ADAPTER', 'mock')
    vi.stubEnv('VITE_APP_URL', 'https://ofaops.onflyair.com')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function seedTrip(): TripStoreRow {
    const trip = createTripFromCandidates({
      lane: 'KCAK → KMDW',
      ready_label: 'ASAP',
      payload_summary: 'cargo',
      candidates: [cand('N123AB')],
      payload_kind: 'cargo',
    })
    mutateTrip(trip.id, (t) => {
      t.state = 'in_progress'
      t.po_number = '9911'
      t.quick = {
        client_id: '',
        client_name: '',
        po: '9911',
        timing: 'asap',
        roundtrip: false,
        cargo_only: true,
        operator_name: 'Op',
        aircraft_type: 'King Air',
        tail: 'N123AB',
        vendor_cost: 0,
        client_price: 0,
        pay_terms: '',
        invoice_email: '',
        cc_emails: [],
        send_invoice: false,
        referred_by: '',
        referral_id: null,
        referral_share_amount: null,
        notes: '',
        legs: [],
      }
      t.events.push({
        at: '2026-07-15T12:00:00.000Z',
        actor: 'system',
        kind: 'eta_sheet_sent',
        payload: {
          recipients: ['tracker@client.test'],
          cc: [],
          subject: 'OnFly ETA sheet · PO #9911 · CAK → MDW · N123AB',
          email_ids: ['re_abc'],
          message_ids: ['<abc@resend.dev>'],
        },
      })
    })
    return trip
  }

  it('reads ETA sheet thread meta from events', () => {
    const trip = seedTrip()
    const meta = getEtaSheetThreadMeta(trip)
    expect(meta?.recipients).toEqual(['tracker@client.test'])
    expect(meta?.messageIds).toEqual(['<abc@resend.dev>'])
    expect(meta?.subject).toMatch(/OnFly ETA sheet/)
  })

  it('sends client update as Re: with In-Reply-To headers', async () => {
    const trip = seedTrip()
    const before = getMockSentEmails().length
    const result = await sendClientTrackingUpdate({
      tripId: trip.id,
      headline: 'ETA update',
      etaLine: 'Landing ~18:40 local',
      body: 'Wheels-up slipped twenty minutes.',
    })
    expect(result.subject).toBe(
      'Re: OnFly ETA sheet · PO #9911 · CAK → MDW · N123AB',
    )
    expect(result.sentTo).toEqual(['tracker@client.test'])
    const sent = getMockSentEmails().slice(before)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers?.['In-Reply-To']).toBe('<abc@resend.dev>')
    expect(sent[0]!.headers?.References).toContain('<abc@resend.dev>')
    expect(sent[0]!.html).toMatch(/Wheels-up slipped/)
  })
})
