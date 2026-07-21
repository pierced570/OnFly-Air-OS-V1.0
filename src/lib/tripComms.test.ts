import { describe, expect, it } from 'vitest'
import {
  addTripParticipant,
  createTripFromCandidates,
  disbandTripComms,
  ensureTripThread,
  inviteTripParticipant,
  listChatTrips,
  mutateTrip,
  postThreadMessage,
} from '@/lib/tripStore'
import { listBankedContacts } from '@/lib/contactBankStore'
import type { Candidate } from '@/domain/routing'

function stubCand(): Candidate {
  return {
    operator_id: 'op1',
    operator_name: 'Sky Freight',
    aircraft_id: 'ac1',
    tail: 'N100AA',
    type_name: 'Citation',
    mtow_lbs: 12500,
    cost: 1,
    price: 2,
    chain: [],
    confidence: 0.9,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: new Date().toISOString(),
    circuit_nm: 100,
    rate_per_nm: 10,
    rate_source: 'assumption',
  }
}

describe('trip comms lifecycle', () => {
  it('assigns thread, invites ops via SMS, disbands and banks contacts', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK → KMDW',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [stubCand()],
      payload_kind: 'cargo',
      client_id: undefined,
    })

    const number = await ensureTripThread(trip.id)
    expect(number).toMatch(/^\+1555/)

    const p = addTripParticipant(trip.id, {
      name: 'Mike Pilot',
      role: 'pilot',
      cell: '+15559876543',
    })
    const invited = await inviteTripParticipant(trip.id, p.id)
    expect(invited.ok).toBe(true)
    expect(invited.channel).toBe('sms')

    mutateTrip(trip.id, (t) => {
      t.state = 'delivered'
    })

    const beforeBank = listBankedContacts().length
    const result = await disbandTripComms(trip.id, { bankContacts: true })
    expect(result.banked).toBeGreaterThan(0)
    expect(listBankedContacts().length).toBeGreaterThanOrEqual(beforeBank)

    const fresh = (await import('@/lib/tripStore')).getTrip(trip.id)!
    expect(fresh.thread_disbanded_at).toBeTruthy()
    expect(fresh.participants.every((x) => !x.in_thread || x.released_at)).toBe(
      true,
    )
  })

  it('listChatTrips surfaces trips with open threads', async () => {
    const trip = createTripFromCandidates({
      lane: 'KHPN → KTEB',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [stubCand()],
      payload_kind: 'cargo',
    })
    await ensureTripThread(trip.id)
    postThreadMessage(trip.id, {
      from: 'OnFly Dispatch',
      channel: 'web',
      body: 'Thread open — standing by',
    })
    const chat = listChatTrips()
    expect(chat.some((t) => t.id === trip.id)).toBe(true)
    expect(chat[0]?.thread_number).toBeTruthy()
  })
})
