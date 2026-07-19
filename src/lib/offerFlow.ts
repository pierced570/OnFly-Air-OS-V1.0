/**
 * Dev phone simulator — all mock SMS in/out for a trip.
 */
import { createCommsAdapter, getMockCommsLog } from '@/adapters/comms'
import {
  getTrip,
  mutateTrip,
  type OfferRow,
} from '@/lib/tripStore'
import {
  availabilityPingBody,
  parseAvailabilityReply,
  quoteLinkBody,
  standDownBody,
} from '@/domain/offers'
import { safeTransitionTrip, payloadKindOf } from '@/lib/tripStore'
import { DISCLOSURE_295_24_TEMPLATE } from '@/domain/offers'

export async function sendAvailabilityPings(tripId: string) {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  const comms = createCommsAdapter()
  if (trip.state === 'quoted_estimated') {
    safeTransitionTrip(tripId, 'offers_out', 'dispatcher')
  }
  const now = new Date().toISOString()
  const fresh = getTrip(tripId)!
  for (const o of fresh.offers) {
    const body = availabilityPingBody(fresh.lane, fresh.payload_summary, fresh.ready_label)
    await comms.send({ channel: 'sms', to: o.contact_cell, body })
    mutateTrip(tripId, (t) => {
      const offer = t.offers.find((x) => x.id === o.id)!
      offer.ping_sent_at = now
      offer.state = 'pinged'
      t.events.push({
        at: now,
        actor: 'comms',
        kind: 'offer_ping',
        payload: { offer_id: o.id, to: o.contact_cell },
      })
    })
  }
  return getTrip(tripId)!
}

export async function simulateOperatorReply(tripId: string, offerId: string, body: string) {
  const parsed = parseAvailabilityReply(body)
  if (!parsed) return { ok: false as const, reason: 'unrecognized reply' }
  const trip = getTrip(tripId)!
  const offer = trip.offers.find((o) => o.id === offerId)!
  const now = new Date().toISOString()
  const comms = createCommsAdapter()
  // log inbound
  await comms.send({
    channel: 'sms',
    to: 'ONFLY',
    body: `INBOUND from ${offer.contact_cell}: ${body}`,
  })

  mutateTrip(tripId, (t) => {
    const o = t.offers.find((x) => x.id === offerId)!
    o.replied_at = now
    o.state = parsed
    t.events.push({
      at: now,
      actor: offer.operator_name,
      kind: 'offer_reply',
      payload: { offer_id: offerId, result: parsed },
    })
  })

  if (parsed === 'available') {
    const token = offer.magic_token
    await comms.send({
      channel: 'sms',
      to: offer.contact_cell,
      body: quoteLinkBody(token),
    })
  }
  return { ok: true as const, result: parsed }
}

export async function submitOperatorQuote(
  token: string,
  input: {
    time_to_position_min: number
    live_leg_min: number
    price_net: number
    wait_ok: boolean
    max_wait_hrs: number | null
  },
) {
  const found = (await import('@/lib/tripStore')).getTripByOfferToken(token)
  if (!found) throw new Error('invalid offer token')
  const { trip, offer } = found
  mutateTrip(trip.id, (t) => {
    const o = t.offers.find((x) => x.id === offer.id)!
    o.time_to_position_min = input.time_to_position_min
    o.live_leg_min = input.live_leg_min
    o.price_net = input.price_net
    o.wait_ok = input.wait_ok
    o.max_wait_hrs = input.max_wait_hrs
    o.state = 'quoted'
    t.events.push({
      at: new Date().toISOString(),
      actor: o.operator_name,
      kind: 'offer_quoted',
      payload: { ...input, offer_id: o.id },
    })
  })
  return getTrip(trip.id)!
}

export async function selectOfferAndHardQuote(tripId: string, offerId: string, clientTotal: number) {
  const trip = getTrip(tripId)!
  const offer = trip.offers.find((o) => o.id === offerId)!
  if (offer.bookingGated) throw new Error('booking gated — insurance/compliance')
  const kind = payloadKindOf(trip)
  const accept_token = crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  mutateTrip(tripId, (t) => {
    for (const o of t.offers) {
      if (o.id === offerId) o.state = 'selected'
    }
  })
  safeTransitionTrip(tripId, 'quoted_hard', 'dispatcher', { offer_id: offerId })
  mutateTrip(tripId, (t) => {
    t.hard_quote = {
      total: clientTotal,
      accept_token,
      payload_kind: kind,
      disclosure_text: kind === 'pax' || kind === 'both' ? DISCLOSURE_295_24_TEMPLATE : undefined,
    }
  })
  const comms = createCommsAdapter()
  await comms.send({
    channel: 'sms',
    to: '+1555CLIENT',
    body: `OnFly hard quote ${trip.lane}: $${clientTotal.toFixed(0)}. Accept: /accept/${accept_token}`,
  })

  // Email client hard quote + ETA sheet (same function as estimated quotes)
  const selectedCand =
    trip.candidates.find((c) => c.aircraft_id === offer.aircraft_id) ??
    trip.candidates.find((c) => c.tail === offer.tail) ??
    trip.candidates[0]
  if (selectedCand?.chain?.length) {
    try {
      const { sendEstimatedQuote } = await import('@/lib/sendEstimatedQuote')
      const [originLabel, destLabel] = trip.lane.split(/\s*→\s*/)
      await sendEstimatedQuote({
        originLabel: originLabel?.trim() || trip.lane,
        destLabel: destLabel?.trim() || '',
        readyLabel: trip.ready_label,
        payloadKind: kind,
        candidates: trip.candidates,
        selected: selectedCand,
        airSubtotal: clientTotal,
        total: clientTotal,
        taxLines: [],
        clientId: trip.client_id,
        kind: 'hard',
        acceptUrl: `/accept/${accept_token}`,
        tripId,
      })
    } catch (e) {
      console.warn('[hard quote] email with ETA skipped', e)
    }
  }

  return getTrip(tripId)!
}

export async function acceptHardQuote(token: string) {
  const trip = (await import('@/lib/tripStore')).getTripByAcceptToken(token)
  if (!trip) throw new Error('invalid accept token')
  const kind = payloadKindOf(trip)
  mutateTrip(trip.id, (t) => {
    if (t.hard_quote && (kind === 'pax' || kind === 'both')) {
      t.hard_quote.disclosure_at = new Date().toISOString()
    }
  })
  safeTransitionTrip(trip.id, 'booked', 'client', { accept_token: token })
  {
    const { materializeTripLegsFromChain, getTrip: gt } = await import(
      '@/lib/tripStore'
    )
    const booked = gt(trip.id)
    const selectedOffer = booked?.offers.find((o) => o.state === 'selected')
    const cand =
      booked?.candidates.find((c) => c.aircraft_id === selectedOffer?.aircraft_id) ??
      booked?.candidates.find((c) => c.chain?.length)
    if (cand?.chain?.length) materializeTripLegsFromChain(trip.id, cand.chain)
  }
  const comms = createCommsAdapter()
  const fresh = getTrip(trip.id)!
  // confirmations
  await comms.send({
    channel: 'sms',
    to: '+1555CLIENT',
    body: `OnFly booked ${fresh.lane}. ETA sheet going to ops contacts.`,
  })
  const selected = fresh.offers.find((o) => o.state === 'selected')
  if (selected) {
    await comms.send({
      channel: 'sms',
      to: selected.contact_cell,
      body: `OnFly confirmed ${fresh.lane}. You are assigned. Dispatch will call to confirm.`,
    })
  }
  // stand-downs
  for (const o of fresh.offers) {
    if (o.state === 'available' || o.state === 'quoted') {
      await comms.send({
        channel: 'sms',
        to: o.contact_cell,
        body: standDownBody(fresh.lane),
      })
      mutateTrip(trip.id, (t) => {
        const row = t.offers.find((x) => x.id === o.id)!
        row.state = 'stood_down'
      })
    }
  }
  mutateTrip(trip.id, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'create_thread',
      payload: { queued: true },
    })
  })

  // Dedicated trip SMS number from DID pool
  try {
    const { assignTripThreadNumber } = await import('@/lib/threadNumbers')
    const tn = await assignTripThreadNumber(trip.id)
    if (tn) {
      mutateTrip(trip.id, (t) => {
        t.events.push({
          at: new Date().toISOString(),
          actor: 'system',
          kind: 'thread_number_assigned',
          payload: { e164: tn.e164, label: tn.label },
        })
        t.participants.push({
          id: crypto.randomUUID(),
          role: 'other',
          name: 'Trip thread',
          cell: tn.e164,
          email: '',
        })
      })
    }
  } catch (e) {
    console.warn('[thread] assign failed', e)
  }

  // ETA sheet + portal track links → tracker / supply-chain (no QB invoice here)
  const { runOnBookedAutomations } = await import('@/lib/onBooked')
  await runOnBookedAutomations(trip.id)

  return getTrip(trip.id)!
}

export function simulatorMessagesForTrip(tripId: string) {
  const trip = getTrip(tripId)
  if (!trip) return []
  const cells = new Set(trip.offers.map((o) => o.contact_cell))
  cells.add('+1555CLIENT')
  cells.add('ONFLY')
  return getMockCommsLog().filter(
    (m) => cells.has(m.to) || m.body.includes(trip.lane) || m.body.includes(tripId),
  )
}

export type { OfferRow }
