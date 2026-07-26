/**
 * Trip offers + booking flow — open requests (no auto-ping), hard quote, accept.
 * All trip state changes go through safeTransitionTrip.
 */
import { createCommsAdapter, getMockCommsLog } from '@/adapters/comms'
import { createEmailAdapter } from '@/adapters/email'
import {
  channelIncludesEmail,
  channelIncludesSms,
  normalizeQuoteLinkChannel,
  type QuoteLinkChannel,
} from '@/domain/quoteLinkChannel'
import type { Candidate } from '@/domain/routing'
import {
  availabilityEmailSubject,
  availabilityPingWithLink,
  parseAvailabilityReply,
  quoteLinkBody,
  standDownBody,
  DISCLOSURE_295_24_TEMPLATE,
} from '@/domain/offers'
import { appPublicUrl } from '@/lib/appUrl'
import { getClient, listInvoiceEmails, listRequestAlertEmails } from '@/lib/clientStore'
import { clientTotalForOffer } from '@/lib/offerPricing'
import {
  buildOfferRow,
  getTrip,
  mutateTrip,
  payloadKindOf,
  safeTransitionTrip,
  type FeeScope,
  type OfferRow,
  type TripStoreRow,
} from '@/lib/tripStore'

export type OfferContactOverride = {
  contact_email?: string
  contact_cell?: string
  quote_link_channel?: QuoteLinkChannel
}

export function buildOffersFromCandidates(
  tripId: string,
  candidates: Candidate[],
  overrides?: Record<string, OfferContactOverride>,
): OfferRow[] {
  return candidates.map((c, i) => {
    const row = buildOfferRow(tripId, c, i)
    const ov = overrides?.[c.operator_id]
    if (!ov) return row
    if (ov.contact_email !== undefined) row.contact_email = ov.contact_email.trim()
    if (ov.contact_cell !== undefined) row.contact_cell = ov.contact_cell.trim()
    if (ov.quote_link_channel !== undefined) {
      row.quote_link_channel = normalizeQuoteLinkChannel(ov.quote_link_channel)
    }
    return row
  })
}

async function persistOffersTrip(tripId: string): Promise<void> {
  const fresh = getTrip(tripId)
  if (!fresh) return
  try {
    const { persistTripSnapshot } = await import('@/lib/db/persistTrip')
    await persistTripSnapshot(fresh)
  } catch (e) {
    console.warn('[offers] persist trip snapshot failed', e)
  }
}

/**
 * Open trip offers for operators — create/share links only.
 * Does NOT SMS/email (no pings). Use sendAvailabilityPings only if
 * dispatcher explicitly opts into notify.
 */
export async function openTripOffers(tripId: string): Promise<TripStoreRow> {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  if (trip.state === 'quoted_estimated') {
    safeTransitionTrip(tripId, 'offers_out', 'dispatcher', {
      reason: 'Trip offers opened — share links (no auto-ping)',
    })
  }
  const now = new Date().toISOString()
  mutateTrip(tripId, (t) => {
    for (const offer of t.offers) {
      if (offer.state === 'stood_down' || offer.state === 'unavailable') continue
      if (offer.state === 'quoted' || offer.state === 'selected') continue
      const firstOpen = !offer.ping_sent_at
      if (firstOpen) offer.ping_sent_at = now
      if (offer.state !== 'available') offer.state = 'pinged'
      if (!firstOpen) continue
      t.events.push({
        at: now,
        actor: 'dispatcher',
        kind: 'offer_request',
        payload: {
          offer_id: offer.id,
          operator_id: offer.operator_id,
          notify: false,
        },
      })
    }
  })
  // Persist so /offer/:token resolves on other devices (public domain).
  await persistOffersTrip(tripId)
  return getTrip(tripId)!
}

/** Append one operator to an existing trip offer list (no ping). */
export async function appendOfferToTrip(
  tripId: string,
  candidate: Candidate,
  override?: OfferContactOverride,
): Promise<OfferRow> {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  if (trip.offers.some((o) => o.operator_id === candidate.operator_id)) {
    throw new Error('That operator already has this request')
  }
  const row = buildOffersFromCandidates(
    tripId,
    [candidate],
    override ? { [candidate.operator_id]: override } : undefined,
  )[0]!
  const now = new Date().toISOString()
  row.ping_sent_at = now
  row.state = 'pinged'
  mutateTrip(tripId, (t) => {
    t.offers.push(row)
    t.events.push({
      at: now,
      actor: 'dispatcher',
      kind: 'offer_added',
      payload: {
        offer_id: row.id,
        operator_id: row.operator_id,
        operator_name: row.operator_name,
        notify: false,
      },
    })
  })
  const fresh = getTrip(tripId)!
  if (fresh.state === 'quoted_estimated') {
    safeTransitionTrip(tripId, 'offers_out', 'dispatcher', {
      reason: 'Added operator to trip offer request',
    })
  }
  await persistOffersTrip(tripId)
  return row
}

/** Update mission fields on an open trip offer request (no re-ping). */
export async function updateTripOfferRequest(
  tripId: string,
  patch: {
    lane?: string
    payload_summary?: string
    ready_label?: string
  },
): Promise<TripStoreRow> {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  const now = new Date().toISOString()
  mutateTrip(tripId, (t) => {
    const before = {
      lane: t.lane,
      payload_summary: t.payload_summary,
      ready_label: t.ready_label,
    }
    if (patch.lane !== undefined) t.lane = patch.lane.trim()
    if (patch.payload_summary !== undefined) {
      t.payload_summary = patch.payload_summary.trim()
    }
    if (patch.ready_label !== undefined) t.ready_label = patch.ready_label.trim()
    t.events.push({
      at: now,
      actor: 'dispatcher',
      kind: 'offer_request_updated',
      payload: {
        before,
        after: {
          lane: t.lane,
          payload_summary: t.payload_summary,
          ready_label: t.ready_label,
        },
      },
    })
  })
  await persistOffersTrip(tripId)
  return getTrip(tripId)!
}

/**
 * Optional SMS/email notify — not used by default desk / ladder send.
 * Prefer sharing the magic-link from the offers queue.
 */
export async function sendAvailabilityPings(
  tripId: string,
  opts?: { offerIds?: string[] },
) {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  const comms = createCommsAdapter()
  const email = createEmailAdapter()
  if (trip.state === 'quoted_estimated') {
    safeTransitionTrip(tripId, 'offers_out', 'dispatcher')
  }
  const now = new Date().toISOString()
  const fresh = getTrip(tripId)!
  // Persist before outbound links so /offer/:token resolves on other devices.
  await persistOffersTrip(tripId)
  const base = appPublicUrl()
  const filter = opts?.offerIds ? new Set(opts.offerIds) : null
  for (const o of fresh.offers) {
    if (filter && !filter.has(o.id)) continue
    if (o.state === 'stood_down' || o.state === 'unavailable') continue
    const channel = normalizeQuoteLinkChannel(o.quote_link_channel)
    const body = availabilityPingWithLink(
      fresh.lane,
      fresh.payload_summary,
      fresh.ready_label,
      o.magic_token,
      base,
    )
    const sent: { sms?: string; email?: string } = {}
    if (channelIncludesSms(channel) && o.contact_cell.trim()) {
      await comms.send({ channel: 'sms', to: o.contact_cell, body })
      sent.sms = o.contact_cell
    }
    if (channelIncludesEmail(channel) && o.contact_email.includes('@')) {
      await email.send({
        to: o.contact_email.trim(),
        subject: availabilityEmailSubject(fresh.lane),
        text: body,
        html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
      })
      sent.email = o.contact_email.trim()
    }
    mutateTrip(tripId, (t) => {
      const offer = t.offers.find((x) => x.id === o.id)!
      offer.ping_sent_at = now
      offer.state = 'pinged'
      t.events.push({
        at: now,
        actor: 'comms',
        kind: 'offer_ping',
        payload: {
          offer_id: o.id,
          channel,
          to: sent,
        },
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
      body: quoteLinkBody(token, appPublicUrl()),
    })
  }
  return { ok: true as const, result: parsed }
}

export async function respondOfferAvailability(
  token: string,
  available: boolean,
): Promise<{ ok: true; available: boolean } | { ok: false; reason: string }> {
  const { getTripByOfferToken } = await import('@/lib/tripStore')
  const found = getTripByOfferToken(token)
  if (!found) return { ok: false, reason: 'invalid offer token' }
  const { trip, offer } = found
  const now = new Date().toISOString()
  mutateTrip(trip.id, (t) => {
    const o = t.offers.find((x) => x.id === offer.id)!
    o.replied_at = now
    o.state = available ? 'available' : 'unavailable'
    t.events.push({
      at: now,
      actor: offer.operator_name,
      kind: 'offer_reply',
      payload: {
        offer_id: offer.id,
        result: available ? 'available' : 'unavailable',
        channel: 'magic_link',
      },
    })
  })
  return { ok: true, available }
}

export async function submitOperatorQuote(
  token: string,
  input: {
    /** Operator-chosen tail — never pre-recommended on the offer board. */
    tail?: string
    time_to_position_min: number
    /** Ground time at origin after position ETA (default 40). */
    quick_turn_min?: number
    live_leg_min: number
    price_net: number
    wait_ok: boolean
    max_wait_hrs: number | null
    fee_scope: FeeScope
    notes?: string | null
  },
) {
  const found = (await import('@/lib/tripStore')).getTripByOfferToken(token)
  if (!found) throw new Error('invalid offer token')
  const { trip, offer } = found
  const tail = input.tail?.trim().toUpperCase()
  const quickTurn =
    input.quick_turn_min != null && Number.isFinite(input.quick_turn_min)
      ? Math.max(0, Math.floor(input.quick_turn_min))
      : 40
  mutateTrip(trip.id, (t) => {
    const o = t.offers.find((x) => x.id === offer.id)!
    if (tail) o.tail = tail
    o.time_to_position_min = input.time_to_position_min
    o.live_leg_min = input.live_leg_min
    o.price_net = input.price_net
    o.wait_ok = input.wait_ok
    o.max_wait_hrs = input.max_wait_hrs
    o.fee_scope = input.fee_scope
    o.notes = input.notes?.trim() || null
    o.state = 'quoted'
    t.events.push({
      at: new Date().toISOString(),
      actor: o.operator_name,
      kind: 'offer_quoted',
      payload: {
        ...input,
        quick_turn_min: quickTurn,
        tail: tail || o.tail,
        offer_id: o.id,
      },
    })
  })
  const { applyOfferTtpToTrip } = await import('@/lib/tripStore')
  applyOfferTtpToTrip(trip.id, offer.id, input.time_to_position_min)
  return getTrip(trip.id)!
}

export async function selectOfferAndHardQuote(
  tripId: string,
  offerId: string,
  clientTotal?: number,
) {
  return selectOffersAndHardQuote(
    tripId,
    [offerId],
    clientTotal != null ? { [offerId]: clientTotal } : undefined,
  )
}

/** Multi-select offers → client multi-option hard quote (carriers unnamed on client surface). */
export async function selectOffersAndHardQuote(
  tripId: string,
  offerIds: string[],
  clientTotalsByOffer?: Record<string, number>,
  toEmails?: string[],
) {
  const trip = getTrip(tripId)!
  if (!offerIds.length) throw new Error('select at least one offer')
  const selectedOffers = offerIds.map((id) => {
    const o = trip.offers.find((x) => x.id === id)
    if (!o) throw new Error(`offer not found: ${id}`)
    if (o.bookingGated) throw new Error('booking gated — insurance/compliance')
    if (o.state !== 'quoted' && o.state !== 'selected') {
      throw new Error(`offer ${o.tail} is not quoted yet`)
    }
    return o
  })

  const kind = payloadKindOf(trip)
  const accept_token = crypto.randomUUID().replace(/-/g, '').slice(0, 20)

  const options = selectedOffers.map((o, i) => {
    const priced = clientTotalForOffer(o, trip)
    const client =
      clientTotalsByOffer?.[o.id] != null
        ? Math.round(clientTotalsByOffer[o.id]!)
        : priced.client
    const cand = trip.candidates.find((c) => c.aircraft_id === o.aircraft_id)
    return {
      offer_id: o.id,
      label: `Option ${String.fromCharCode(65 + i)}`,
      client_total: client,
      eta_end: cand?.eta_end ?? trip.promised_delivery,
      fee_scope: o.fee_scope,
    }
  })
  const primaryTotal = Math.min(...options.map((o) => o.client_total))

  mutateTrip(tripId, (t) => {
    for (const o of t.offers) {
      if (offerIds.includes(o.id)) o.state = 'selected'
    }
  })

  if (trip.state === 'offers_out') {
    safeTransitionTrip(tripId, 'quoted_hard', 'dispatcher', {
      offer_ids: offerIds,
    })
  }

  mutateTrip(tripId, (t) => {
    t.hard_quote = {
      total: primaryTotal,
      accept_token,
      payload_kind: kind,
      disclosure_text:
        kind === 'pax' || kind === 'both' ? DISCLOSURE_295_24_TEMPLATE : undefined,
      options,
    }
  })

  const recipients = resolveHardQuoteRecipients(trip, toEmails)
  const comms = createCommsAdapter()
  const email = createEmailAdapter()
  const optionLines = options
    .map(
      (o) =>
        `${o.label}: $${o.client_total.toFixed(0)}${o.eta_end ? ` · ETA ${o.eta_end.slice(0, 16)}Z` : ''}`,
    )
    .join('\n')

  for (const cell of recipientCells(trip)) {
    await comms.send({
      channel: 'sms',
      to: cell,
      body: `OnFly hard quote ${trip.lane}:\n${optionLines}\nAccept: /accept/${accept_token}`,
    })
  }

  if (recipients.length) {
    for (const to of recipients) {
      await email.send({
        to,
        subject: `OnFly quote · ${trip.lane}`,
        text: [
          `Hard quote for ${trip.lane}.`,
          `A vetted Part 135 carrier — options below (carrier unnamed until acceptance).`,
          '',
          optionLines,
          '',
          `Accept: /accept/${accept_token}`,
          trip.po_number ? `PO: ${trip.po_number}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      })
    }
  }

  const primaryOffer = selectedOffers[0]!
  const selectedCand =
    trip.candidates.find((c) => c.aircraft_id === primaryOffer.aircraft_id) ??
    trip.candidates.find((c) => c.tail === primaryOffer.tail) ??
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
        airSubtotal: primaryTotal,
        total: primaryTotal,
        taxLines: [],
        clientId: trip.client_id,
        kind: 'hard',
        acceptUrl: `/accept/${accept_token}`,
        tripId,
        to: recipients.length ? recipients : undefined,
      })
    } catch (e) {
      console.warn('[hard quote] email with ETA skipped', e)
    }
  }

  return getTrip(tripId)!
}

function resolveHardQuoteRecipients(
  trip: NonNullable<ReturnType<typeof getTrip>>,
  override?: string[],
): string[] {
  if (override?.length) {
    return [
      ...new Set(
        override.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')),
      ),
    ]
  }
  const fromClient = trip.client_id
    ? [
        ...listRequestAlertEmails(trip.client_id),
        ...listInvoiceEmails(trip.client_id),
        getClient(trip.client_id)?.email ?? '',
        getClient(trip.client_id)?.invoice_email ?? '',
      ]
    : []
  return [
    ...new Set(
      fromClient.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')),
    ),
  ]
}

function recipientCells(trip: NonNullable<ReturnType<typeof getTrip>>): string[] {
  const cells: string[] = []
  if (trip.client_id) {
    const c = getClient(trip.client_id)
    for (const contact of c?.contacts ?? []) {
      if (
        contact.cell &&
        (contact.role === 'requester' || contact.notify_prefs?.request_alert)
      ) {
        cells.push(contact.cell)
      }
    }
  }
  if (!cells.length) cells.push('+1555CLIENT')
  return cells
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
    const { materializeTripLegsFromChain, getTrip: gt, applyOfferTtpToTrip } =
      await import('@/lib/tripStore')
    const booked = gt(trip.id)
    const selectedOffer = booked?.offers.find((o) => o.state === 'selected')
    const cand =
      booked?.candidates.find((c) => c.aircraft_id === selectedOffer?.aircraft_id) ??
      booked?.candidates.find((c) => c.chain?.length)
    if (cand?.chain?.length) {
      materializeTripLegsFromChain(trip.id, cand.chain)
      if (selectedOffer?.time_to_position_min != null) {
        applyOfferTtpToTrip(trip.id, selectedOffer.id, selectedOffer.time_to_position_min)
      }
    }
  }
  const comms = createCommsAdapter()
  const email = createEmailAdapter()
  const fresh = getTrip(trip.id)!
  const selected = fresh.offers.find((o) => o.state === 'selected')
  const trackPath = `/portal/track/${fresh.id}`

  await comms.send({
    channel: 'sms',
    to: '+1555CLIENT',
    body: `OnFly booked ${fresh.lane}. Tracking: ${trackPath}`,
  })

  if (selected) {
    await comms.send({
      channel: 'sms',
      to: selected.contact_cell,
      body: `OnFly: mission is a go for ${fresh.lane}. Tail ${selected.tail} assigned. Dispatch will confirm details.`,
    })
  }

  for (const o of fresh.offers) {
    if (o.id === selected?.id) continue
    if (
      o.state === 'available' ||
      o.state === 'quoted' ||
      o.state === 'pinged'
    ) {
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

  const timeline = fresh.legs
    .map(
      (l) =>
        `${l.label}: ${l.est_start?.slice(0, 16) ?? '—'} → ${l.est_end?.slice(0, 16) ?? '—'}`,
    )
    .join('\n')
  const opsRecipients = resolveOpsEmails(fresh)
  if (opsRecipients.length) {
    for (const to of opsRecipients) {
      await email.send({
        to,
        subject: `Mission go · T-${fresh.ref} · ${fresh.lane}`,
        text: [
          `Trip T-${fresh.ref} is booked.`,
          `Tail: ${selected?.tail ?? 'TBD'} · ${selected?.type_name ?? ''}`,
          `Lane: ${fresh.lane}`,
          `Track: ${trackPath}`,
          '',
          'Timeline:',
          timeline || '(ETA chain pending)',
        ].join('\n'),
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

  {
    const { ensureTripThread, getTrip: gt } = await import('@/lib/tripStore')
    await ensureTripThread(trip.id)
    const booked = gt(trip.id)
    const sel = booked?.offers.find((o) => o.state === 'selected')
    if (sel && booked) {
      const { addTripParticipant, inviteTripParticipant } = await import(
        '@/lib/tripStore'
      )
      const already = booked.participants.some(
        (p) => p.role === 'operator_ops' && p.name === sel.operator_name,
      )
      if (!already) {
        const p = addTripParticipant(trip.id, {
          name: sel.operator_name,
          role: 'operator_ops',
          cell: sel.contact_cell,
          in_thread: true,
        })
        await inviteTripParticipant(trip.id, p.id)
      }
    }
  }

  try {
    const { createInvoiceForTrip } = await import('@/lib/tripStore')
    await createInvoiceForTrip(trip.id)
  } catch (e) {
    console.warn('[accept] invoice failed', e)
  }

  const { runOnBookedAutomations } = await import('@/lib/onBooked')
  await runOnBookedAutomations(trip.id)

  return getTrip(trip.id)!
}

function resolveOpsEmails(trip: NonNullable<ReturnType<typeof getTrip>>): string[] {
  const out: string[] = []
  if (trip.client_id) {
    out.push(...listInvoiceEmails(trip.client_id))
    const c = getClient(trip.client_id)
    for (const contact of c?.contacts ?? []) {
      if (contact.role === 'supply_chain' && contact.email) out.push(contact.email)
    }
  }
  for (const p of trip.participants) {
    if (p.email && (p.role === 'dispatcher' || p.role === 'ops')) out.push(p.email)
  }
  return [
    ...new Set(out.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'))),
  ]
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
