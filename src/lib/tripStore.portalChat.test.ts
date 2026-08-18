import { describe, expect, it } from 'vitest'
import {
  createQuickDispatchTrip,
  getTrip,
  postPortalChatMessage,
} from '@/lib/tripStore'

function seedTrip() {
  return createQuickDispatchTrip({
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
    cc_emails: [],
    send_invoice: false,
    referred_by: '',
    referral_id: null,
    referral_share_amount: null,
    notes: '',
    legs: [
      {
        origin_icao: 'KCLT',
        dest_icao: 'KICT',
        date: '',
        pax: 0,
        repo_time: '2h',
        live_leg_time: '1h',
      },
    ],
  })
}

describe('postPortalChatMessage', () => {
  it('appends a client message and an event without touching the ops thread', () => {
    const trip = seedTrip()
    const msg = postPortalChatMessage(trip.id, {
      role: 'client',
      body: 'Need a forklift at Signature',
      fromLabel: 'Alex',
    })
    const row = getTrip(trip.id)!
    expect(msg.body).toBe('Need a forklift at Signature')
    expect(row.portal_chat).toHaveLength(1)
    expect(row.portal_chat?.[0]).toMatchObject({
      role: 'client',
      from_label: 'Alex',
      body: 'Need a forklift at Signature',
    })
    expect(row.thread).toHaveLength(0)
    expect(row.events.some((e) => e.kind === 'portal_chat_message')).toBe(true)
  })

  it('keeps OnFly replies on the same thread', () => {
    const trip = seedTrip()
    postPortalChatMessage(trip.id, {
      role: 'client',
      body: 'ETA still 1800Z?',
    })
    postPortalChatMessage(trip.id, {
      role: 'onfly',
      body: 'Yes — wheels-down ~1800Z.',
      fromLabel: 'OnFly Dispatch',
    })
    const row = getTrip(trip.id)!
    expect(row.portal_chat?.map((m) => m.role)).toEqual(['client', 'onfly'])
    expect(row.portal_chat?.[1]?.body).toMatch(/1800Z/)
  })
})
