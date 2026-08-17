import { describe, expect, it } from 'vitest'
import { getMockSentEmails } from '@/adapters/email'
import { sendPortalChatMessage } from '@/lib/portalChatNotify'
import { createQuickDispatchTrip, getTrip } from '@/lib/tripStore'

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

describe('sendPortalChatMessage', () => {
  it('emails OnFly a copy when the client posts', async () => {
    const trip = seedTrip()
    const before = getMockSentEmails().length
    await sendPortalChatMessage({
      tripId: trip.id,
      role: 'client',
      body: 'Need the AWB before 1400Z',
      fromLabel: 'Alex',
    })
    const sent = getMockSentEmails().slice(before)
    expect(sent.length).toBeGreaterThanOrEqual(1)
    const ping = sent.find((m) =>
      String(m.subject).includes('New portal chat'),
    )
    expect(ping?.to).toBe('info@onflyair.com')
    expect(ping?.text).toContain('Need the AWB before 1400Z')
    expect(ping?.text).toMatch(/sent a new chat on the portal/i)
    expect(getTrip(trip.id)?.portal_chat).toHaveLength(1)
  })

  it('emails the client when OnFly replies in chat', async () => {
    const trip = seedTrip()
    const before = getMockSentEmails().length
    await sendPortalChatMessage({
      tripId: trip.id,
      role: 'onfly',
      body: 'Forklift is booked at Signature.',
      fromLabel: 'OnFly Dispatch',
    })
    const sent = getMockSentEmails().slice(before)
    const reply = sent.find((m) =>
      String(m.subject).includes('OnFly message'),
    )
    expect(reply?.to).toEqual(['ap@acme.test'])
    expect(reply?.text).toContain('Forklift is booked at Signature.')
    expect(reply?.text).toMatch(/replied on your trip portal/i)
    expect(getTrip(trip.id)?.portal_chat?.[0]?.role).toBe('onfly')
  })
})
