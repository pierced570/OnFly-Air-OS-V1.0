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
import { buildQuoteTotals, priceFromMargin } from '@/domain/quote'
import { PRICING_CONSTANTS } from '@/domain/routing'
import { getTaxRates } from '@/lib/taxRatesStore'

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
  // Quoted TTP + live leg replace assumed chain durations → recompute
  const { applyOfferTtpToTrip, applyOfferLiveLegToTrip } = await import(
    '@/lib/tripStore'
  )
  applyOfferTtpToTrip(trip.id, offer.id, input.time_to_position_min)
  applyOfferLiveLegToTrip(trip.id, offer.id, input.live_leg_min)
  return getTrip(trip.id)!
}

/** Client hard-quote total = target margin on operator net + table-driven tax (FET). */
export function hardQuoteTotalsForOffer(
  trip: NonNullable<ReturnType<typeof getTrip>>,
  offer: OfferRow,
): {
  airSubtotal: number
  total: number
  taxLines: { code: string; amount: number; note?: string }[]
} {
  const kind = payloadKindOf(trip)
  const net = offer.price_net ?? 0
  const marginPct = PRICING_CONSTANTS.targetMargin * 100
  const airSubtotal = priceFromMargin(net, marginPct)
  const selectedCand =
    trip.candidates.find((c) => c.aircraft_id === offer.aircraft_id) ??
    trip.candidates.find((c) => c.tail === offer.tail) ??
    trip.candidates[0]
  const paxMatch = trip.payload_summary.match(/(\d+)\s*pax/i)
  const paxCount = paxMatch
    ? Number(paxMatch[1])
    : kind === 'pax' || kind === 'both'
      ? 1
      : 0
  const totals = buildQuoteTotals(
    {
      ...(selectedCand ?? {
        operator_id: '',
        operator_name: '',
        aircraft_id: '',
        tail: offer.tail,
        type_name: offer.type_name,
        mtow_lbs: null,
        chain: [],
        confidence: 1,
        needsInfo: [],
        bookingGated: false,
        reasoning: [],
        eta_end: '',
        circuit_nm: 0,
      }),
      cost: net,
      price: airSubtotal,
    },
    {
      markupMode: 'dollars',
      markupValue: airSubtotal - net,
      payloadKind: kind,
      mtowLbs: selectedCand?.mtow_lbs ?? null,
      paxCount,
      segments: 1,
      rates: getTaxRates(),
    },
  )
  return {
    airSubtotal: totals.airSubtotal,
    total: totals.total,
    taxLines: totals.tax.lines.map((l) => ({
      code: l.code,
      amount: l.amount,
      note: l.note,
    })),
  }
}

export async function selectOfferAndHardQuote(tripId: string, offerId: string) {
  const trip = getTrip(tripId)!
  const offer = trip.offers.find((o) => o.id === offerId)!
  if (offer.bookingGated) throw new Error('booking gated — insurance/compliance')
  const kind = payloadKindOf(trip)
  const priced = hardQuoteTotalsForOffer(trip, offer)
  const clientTotal = priced.total
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
        airSubtotal: priced.airSubtotal,
        total: clientTotal,
        taxLines: priced.taxLines,
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
  if (trip.state === 'booked' || trip.state === 'in_progress' || trip.state === 'delivered') {
    return getTrip(trip.id)!
  }
  if (trip.state !== 'quoted_hard') {
    throw new Error(`cannot accept from state ${trip.state}`)
  }
  const kind = payloadKindOf(trip)
  mutateTrip(trip.id, (t) => {
    if (t.hard_quote && (kind === 'pax' || kind === 'both')) {
      t.hard_quote.disclosure_at = new Date().toISOString()
    }
  })
  safeTransitionTrip(trip.id, 'booked', 'client', { accept_token: token })
  {
    const { materializeTripLegsFromChain, getTrip: gt, applyOfferTtpToTrip, applyOfferLiveLegToTrip } =
      await import('@/lib/tripStore')
    const booked = gt(trip.id)
    const selectedOffer = booked?.offers.find((o) => o.state === 'selected')
    const cand =
      booked?.candidates.find((c) => c.aircraft_id === selectedOffer?.aircraft_id) ??
      booked?.candidates.find((c) => c.chain?.length)
    if (cand?.chain?.length) {
      // Winning quote TTP + live leg already on candidate; copy chain onto trip
      materializeTripLegsFromChain(trip.id, cand.chain)
      if (selectedOffer?.time_to_position_min != null) {
        applyOfferTtpToTrip(trip.id, selectedOffer.id, selectedOffer.time_to_position_min)
      }
      if (selectedOffer?.live_leg_min != null) {
        applyOfferLiveLegToTrip(trip.id, selectedOffer.id, selectedOffer.live_leg_min)
      }
    }
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

  // Spin up SMS thread pool number + intro path
  {
    const { ensureTripThread, getTrip: gt } = await import('@/lib/tripStore')
    await ensureTripThread(trip.id)
    const booked = gt(trip.id)
    const selected = booked?.offers.find((o) => o.state === 'selected')
    if (selected && booked) {
      const { addTripParticipant, inviteTripParticipant } = await import(
        '@/lib/tripStore'
      )
      const already = booked.participants.some(
        (p) => p.role === 'operator_ops' && p.name === selected.operator_name,
      )
      if (!already) {
        const p = addTripParticipant(trip.id, {
          name: selected.operator_name,
          role: 'operator_ops',
          cell: selected.contact_cell,
          in_thread: true,
        })
        await inviteTripParticipant(trip.id, p.id)
      }
    }
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
