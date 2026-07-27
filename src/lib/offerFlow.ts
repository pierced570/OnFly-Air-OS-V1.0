/**
 * Trip offers + booking flow — open requests (no auto-ping), hard quote, accept.
 * All trip state changes go through safeTransitionTrip.
 */
import { createCommsAdapter } from '@/adapters/comms'
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
  availabilityPingHtml,
  availabilityPingWithLink,
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
    if (ov.contact_cell !== undefined) {
      row.contact_cell = ov.contact_cell.trim()
      // Desk/profile override replaces any invented mock cell.
      row.contact_cell_is_mock = false
    }
    if (ov.quote_link_channel !== undefined) {
      row.quote_link_channel = normalizeQuoteLinkChannel(ov.quote_link_channel)
    }
    return row
  })
}

async function persistOffersTrip(
  tripId: string,
  opts?: { requirePublicLinks?: boolean },
): Promise<void> {
  const fresh = getTrip(tripId)
  if (!fresh) return
  try {
    if (opts?.requirePublicLinks) {
      const { persistTripOffersForPublicLinks } = await import(
        '@/lib/db/persistTrip'
      )
      await persistTripOffersForPublicLinks(fresh)
      return
    }
    const { persistTripSnapshot } = await import('@/lib/db/persistTrip')
    await persistTripSnapshot(fresh)
  } catch (e) {
    console.warn('[offers] persist trip snapshot failed', e)
    if (opts?.requirePublicLinks) {
      throw e instanceof Error ? e : new Error(String(e))
    }
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
  await persistOffersTrip(tripId, { requirePublicLinks: true })
  return getTrip(tripId)!
}

/** Append one operator to an existing trip offer list and send the offer link. */
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
        notify: true,
      },
    })
  })
  const fresh = getTrip(tripId)!
  if (fresh.state === 'quoted_estimated') {
    safeTransitionTrip(tripId, 'offers_out', 'dispatcher', {
      reason: 'Added operator to trip offer request',
    })
  }
  await persistOffersTrip(tripId, { requirePublicLinks: true })
  await sendAvailabilityPings(tripId, { offerIds: [row.id] })
  const after = getTrip(tripId)!
  const updated = after.offers.find((o) => o.id === row.id)
  if (!updated) throw new Error('offer not found after notify')
  return updated
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
 * Send trip-offer / quote-request links via email (and SMS when live).
 * Desk + ladder + add-operator call this after creating offers.
 */
export async function sendAvailabilityPings(
  tripId: string,
  opts?: { offerIds?: string[]; requireDelivery?: boolean },
) {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  const email = createEmailAdapter()
  if (trip.state === 'quoted_estimated') {
    safeTransitionTrip(tripId, 'offers_out', 'dispatcher')
  }
  const now = new Date().toISOString()
  const fresh = getTrip(tripId)!
  // Persist + verify tokens BEFORE emailing — otherwise operators hit "expired".
  await persistOffersTrip(tripId, { requirePublicLinks: true })
  const base = appPublicUrl()
  if (!base) {
    console.warn(
      '[offers] VITE_APP_URL unset — offer links in email/SMS may be relative or wrong host',
    )
  }
  const filter = opts?.offerIds ? new Set(opts.offerIds) : null
  const targeted: OfferRow[] = []
  const missedNames: string[] = []
  // RingCentral not wired — email is the live delivery path for offer links.
  const smsLive = false

  for (const o of fresh.offers) {
    if (filter && !filter.has(o.id)) continue
    if (o.state === 'stood_down' || o.state === 'unavailable') continue
    targeted.push(o)
    let channel = normalizeQuoteLinkChannel(o.quote_link_channel)
    // Until SMS is live, SMS-only falls back to email when an address is on file.
    if (!smsLive && channel === 'sms') channel = 'email'
    const body = availabilityPingWithLink(
      fresh.lane,
      fresh.payload_summary,
      fresh.ready_label,
      o.magic_token,
      base,
    )
    const sent: { sms?: string; email?: string } = {}
    if (
      smsLive &&
      channelIncludesSms(channel) &&
      o.contact_cell.trim() &&
      !o.contact_cell_is_mock
    ) {
      const comms = createCommsAdapter()
      await comms.send({ channel: 'sms', to: o.contact_cell, body })
      sent.sms = o.contact_cell
    }
    if (channelIncludesEmail(channel) && o.contact_email.includes('@')) {
      await email.send({
        to: o.contact_email.trim(),
        subject: availabilityEmailSubject(fresh.lane),
        text: body,
        html: availabilityPingHtml(
          fresh.lane,
          fresh.payload_summary,
          fresh.ready_label,
          o.magic_token,
          base,
        ),
      })
      sent.email = o.contact_email.trim()
    }
    if (!sent.sms && !sent.email) {
      missedNames.push(o.operator_name)
      continue
    }
    mutateTrip(tripId, (t) => {
      const offer = t.offers.find((x) => x.id === o.id)!
      offer.ping_sent_at = now
      offer.notified_at = now
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
  await persistOffersTrip(tripId)
  const requireDelivery = opts?.requireDelivery !== false
  if (requireDelivery && targeted.length > 0 && missedNames.length > 0) {
    throw new Error(
      `Could not deliver offer link to: ${missedNames.join(', ')}. ` +
        'Add an email on file (SMS delivery is not connected yet).',
    )
  }
  return getTrip(tripId)!
}

/** Update destination contacts on an open offer before notify / share. */
export async function updateOfferContacts(
  tripId: string,
  offerId: string,
  patch: OfferContactOverride,
): Promise<OfferRow> {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  const now = new Date().toISOString()
  mutateTrip(tripId, (t) => {
    const offer = t.offers.find((x) => x.id === offerId)
    if (!offer) throw new Error('offer not found')
    const before = {
      contact_email: offer.contact_email,
      contact_cell: offer.contact_cell,
      quote_link_channel: offer.quote_link_channel,
    }
    if (patch.contact_email !== undefined) {
      offer.contact_email = patch.contact_email.trim()
    }
    if (patch.contact_cell !== undefined) {
      offer.contact_cell = patch.contact_cell.trim()
      offer.contact_cell_is_mock = false
    }
    if (patch.quote_link_channel !== undefined) {
      offer.quote_link_channel = normalizeQuoteLinkChannel(
        patch.quote_link_channel,
      )
    }
    t.events.push({
      at: now,
      actor: 'dispatcher',
      kind: 'offer_contacts_updated',
      payload: {
        offer_id: offerId,
        before,
        after: {
          contact_email: offer.contact_email,
          contact_cell: offer.contact_cell,
          quote_link_channel: offer.quote_link_channel,
        },
      },
    })
  })
  await persistOffersTrip(tripId)
  const fresh = getTrip(tripId)!
  const row = fresh.offers.find((o) => o.id === offerId)
  if (!row) throw new Error('offer not found')
  return row
}

/**
 * Desk acknowledges a Declined (No) so the recipient collapses to a
 * compact "Name · unavailable" line on Dispatch / Offers.
 */
export async function acknowledgeDeclinedOffer(
  tripId: string,
  offerId: string,
): Promise<OfferRow> {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  const offer = trip.offers.find((o) => o.id === offerId)
  if (!offer) throw new Error('offer not found')
  if (offer.state !== 'unavailable') {
    throw new Error('Only declined (No) offers can be acknowledged')
  }
  const now = new Date().toISOString()
  mutateTrip(tripId, (t) => {
    const o = t.offers.find((x) => x.id === offerId)!
    if (o.declined_acked_at) return
    o.declined_acked_at = now
    t.events.push({
      at: now,
      actor: 'dispatcher',
      kind: 'offer_declined_acked',
      payload: {
        offer_id: offerId,
        operator_id: o.operator_id,
        operator_name: o.operator_name,
      },
    })
  })
  const { flushPersistTrip } = await import('@/lib/tripStore')
  await flushPersistTrip(tripId)
  const fresh = getTrip(tripId)!
  const row = fresh.offers.find((o) => o.id === offerId)
  if (!row) throw new Error('offer not found')
  return row
}

export async function respondOfferAvailability(
  token: string,
  available: boolean,
): Promise<{ ok: true; available: boolean } | { ok: false; reason: string }> {
  const { flushPersistTrip, getTripByOfferToken } = await import(
    '@/lib/tripStore'
  )
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
  // Await DB write so Dispatch center poll/hydrate sees Yes/No immediately.
  await flushPersistTrip(trip.id)
  return { ok: true, available }
}

export type OperatorQuoteInput = {
  /** Aircraft type — client-safe (shown on logistics quote). */
  type_name?: string
  /** Operator-chosen tail — desk/ops only; never on client quote. */
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
}

async function applyOfferQuote(
  tripId: string,
  offerId: string,
  input: OperatorQuoteInput,
  meta: { actor: string; kind: string; source: 'operator' | 'desk_manual' },
) {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  const offer = trip.offers.find((o) => o.id === offerId)
  if (!offer) throw new Error('offer not found')
  if (offer.state === 'unavailable' || offer.state === 'stood_down') {
    throw new Error('cannot quote a declined or stood-down offer')
  }
  if (['booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(trip.state)) {
    throw new Error(`cannot quote from trip state ${trip.state}`)
  }
  const tail = input.tail?.trim().toUpperCase()
  const typeName = input.type_name?.trim() || ''
  if (!typeName) throw new Error('aircraft type is required')
  if (!tail) throw new Error('tail number is required')
  const quickTurn =
    input.quick_turn_min != null && Number.isFinite(input.quick_turn_min)
      ? Math.max(0, Math.floor(input.quick_turn_min))
      : 40
  const price = Math.max(0, Math.round(Number(input.price_net) || 0))
  if (!(price > 0)) throw new Error('price NET NET is required')
  const at = new Date().toISOString()
  mutateTrip(tripId, (t) => {
    const o = t.offers.find((x) => x.id === offerId)!
    o.type_name = typeName
    o.tail = tail
    o.time_to_position_min = input.time_to_position_min
    o.quick_turn_min = quickTurn
    o.live_leg_min = input.live_leg_min
    o.price_net = price
    o.wait_ok = input.wait_ok
    o.max_wait_hrs = input.max_wait_hrs
    o.fee_scope = input.fee_scope
    o.notes = input.notes?.trim() || null
    if (o.state !== 'selected') o.state = 'quoted'
    if (!o.replied_at) o.replied_at = at
    // Keep candidate label in sync for desk shortlist views.
    const cand =
      t.candidates.find((c) => c.aircraft_id === o.aircraft_id) ??
      t.candidates.find((c) => c.tail === o.tail)
    if (cand) {
      cand.type_name = typeName
      cand.tail = tail
    }
    t.events.push({
      at,
      actor: meta.actor,
      kind: meta.kind,
      payload: {
        ...input,
        type_name: typeName,
        price_net: price,
        quick_turn_min: quickTurn,
        tail,
        offer_id: o.id,
        source: meta.source,
      },
    })
  })
  const { applyOfferTtpToTrip, flushPersistTrip } = await import(
    '@/lib/tripStore'
  )
  applyOfferTtpToTrip(tripId, offerId, input.time_to_position_min)
  await flushPersistTrip(tripId)
  return getTrip(tripId)!
}

export async function submitOperatorQuote(
  token: string,
  input: OperatorQuoteInput,
) {
  const found = (await import('@/lib/tripStore')).getTripByOfferToken(token)
  if (!found) throw new Error('invalid offer token')
  const { trip, offer } = found
  return applyOfferQuote(trip.id, offer.id, input, {
    actor: offer.operator_name,
    kind: 'offer_quoted',
    source: 'operator',
  })
}

/** Desk enters a quote from phone/email — same fields as the operator form. */
export async function submitDeskManualQuote(
  tripId: string,
  offerId: string,
  input: OperatorQuoteInput,
) {
  return applyOfferQuote(tripId, offerId, input, {
    actor: 'dispatcher',
    kind: 'offer_quoted_manual',
    source: 'desk_manual',
  })
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
  opts?: {
    notifyClient?: boolean
    ccEmails?: string[]
    bccEmails?: string[]
    /** Desk margin % applied when totals are not overridden. */
    marginPct?: number | null
  },
) {
  const trip = getTrip(tripId)!
  if (!offerIds.length) throw new Error('select at least one offer')
  const notifyClient = opts?.notifyClient !== false
  if (opts?.marginPct != null && Number.isFinite(opts.marginPct)) {
    mutateTrip(tripId, (t) => {
      t.offer_margin_pct = Math.max(0, opts.marginPct!)
    })
  }
  const pricedTrip = getTrip(tripId)!
  const selectedOffers = offerIds.map((id) => {
    const o = pricedTrip.offers.find((x) => x.id === id)
    if (!o) throw new Error(`offer not found: ${id}`)
    if (o.bookingGated) throw new Error('booking gated — insurance/compliance')
    if (o.state !== 'quoted' && o.state !== 'selected') {
      throw new Error(`offer ${o.tail} is not quoted yet`)
    }
    return o
  })

  const kind = payloadKindOf(pricedTrip)
  const accept_token = crypto.randomUUID().replace(/-/g, '').slice(0, 20)

  const sentAt = new Date().toISOString()
  const options = selectedOffers.map((o, i) => {
    const priced = clientTotalForOffer(o, pricedTrip)
    const client =
      clientTotalsByOffer?.[o.id] != null
        ? Math.round(clientTotalsByOffer[o.id]!)
        : priced.client
    const cand = pricedTrip.candidates.find((c) => c.aircraft_id === o.aircraft_id)
    return {
      offer_id: o.id,
      label: `Option ${String.fromCharCode(65 + i)}`,
      client_total: client,
      eta_end: cand?.eta_end ?? pricedTrip.promised_delivery,
      fee_scope: o.fee_scope,
      /** Client-safe aircraft type (not carrier). */
      type_name: o.type_name ?? cand?.type_name ?? null,
      time_to_position_min: o.time_to_position_min,
      quick_turn_min: o.quick_turn_min,
      live_leg_min: o.live_leg_min,
      // Desk display — never shown on client accept / portal.
      operator_name: o.operator_name,
      tail: o.tail || null,
    }
  })
  const primaryTotal = Math.min(...options.map((o) => o.client_total))

  mutateTrip(tripId, (t) => {
    for (const o of t.offers) {
      if (offerIds.includes(o.id)) o.state = 'selected'
      else if (o.state === 'selected') o.state = 'stood_down'
    }
  })

  if (trip.state === 'offers_out' || trip.state === 'lost') {
    safeTransitionTrip(tripId, 'quoted_hard', 'dispatcher', {
      offer_ids: offerIds,
      reopen_from: trip.state === 'lost' ? 'lost' : undefined,
    })
  }

  mutateTrip(tripId, (t) => {
    const prev = t.hard_quote
    if (prev?.accept_token && prev.accept_token !== accept_token) {
      t.events.push({
        at: sentAt,
        actor: 'dispatcher',
        kind: 'hard_quote_superseded',
        payload: {
          previous_accept_token: prev.accept_token,
          previous_total: prev.total,
          previous_decision: prev.client_decision ?? null,
        },
      })
    }
    t.lost_reason = undefined
    t.hard_quote = {
      total: primaryTotal,
      accept_token,
      payload_kind: kind,
      disclosure_text:
        kind === 'pax' || kind === 'both' ? DISCLOSURE_295_24_TEMPLATE : undefined,
      sent_at: sentAt,
      client_decision: undefined,
      accepted_at: undefined,
      declined_at: undefined,
      options,
    }
    t.events.push({
      at: sentAt,
      actor: 'dispatcher',
      kind: 'hard_quote_sent',
      payload: {
        offer_ids: offerIds,
        accept_token,
        option_count: options.length,
        notify_client: notifyClient,
      },
    })
  })

  const recipients = resolveHardQuoteRecipients(trip, toEmails)
  const ccEmails = [
    ...new Set(
      (opts?.ccEmails ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@') && !recipients.includes(e)),
    ),
  ]
  const bccEmails = [
    ...new Set(
      (opts?.bccEmails ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter(
          (e) =>
            e.includes('@') && !recipients.includes(e) && !ccEmails.includes(e),
        ),
    ),
  ]

  if (notifyClient) {
    const comms = createCommsAdapter()
    const email = createEmailAdapter()
    const {
      buildHardQuoteEmailPayload,
      renderHardQuoteEmail,
    } = await import('@/lib/hardQuoteEmail')
    const { buildOpsSheetNotes } = await import('@/domain/opsFlags')
    const liveTrip = getTrip(tripId)!
    const hasTruck = (liveTrip.eta_chain ?? []).some(
      (l) => l.branch === 'truck' || l.type.startsWith('truck'),
    )
    const clientOpsNotes = buildOpsSheetNotes({
      pattern: liveTrip.service_pattern,
      hasTruckLegs: hasTruck,
      forkliftLevel: liveTrip.forklift_required
        ? 'required'
        : liveTrip.forklift_recommended
          ? 'recommended'
          : 'none',
      flags: [],
    })
    const payload = buildHardQuoteEmailPayload({
      trip: liveTrip,
      options: options.map((o) => ({
        offer_id: o.offer_id,
        label: o.label,
        type_name: o.type_name,
        time_to_position_min: o.time_to_position_min,
        quick_turn_min: o.quick_turn_min,
        live_leg_min: o.live_leg_min,
        client_total: o.client_total,
      })),
      acceptUrl: `/accept/${accept_token}`,
      goAtIso: sentAt,
      opsNotes: clientOpsNotes,
    })
    const rendered = renderHardQuoteEmail(payload)

    // Process flags (after-hours / forklift gaps) — desk + Board, not client email.
    void import('@/lib/applyTripOpsFlags').then((m) =>
      m.applyTripOpsFlags(tripId),
    )

    for (const cell of recipientCells(trip)) {
      await comms.send({
        channel: 'sms',
        to: cell,
        body: `${rendered.subject}\n\n${rendered.text.slice(0, 320)}\n\nAccept: /accept/${accept_token}`,
      })
    }

    if (recipients.length) {
      const [primary, ...restTo] = recipients
      await email.send({
        to: primary!,
        cc: [...restTo, ...ccEmails],
        bcc: bccEmails,
        subject: rendered.subject,
        html: rendered.html,
        text: [
          rendered.text,
          trip.po_number ? `PO: ${trip.po_number}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      })
    }
  }

  return getTrip(tripId)!
}

/** Client accepts one option from the public accept page. */
/**
 * Update client-facing totals / margin on an already-sent hard quote
 * without re-notifying the client (desk edit).
 */
export function updateHardQuoteClientPricing(
  tripId: string,
  input: {
    margin_pct: number
    options: Array<{ offer_id: string; client_total: number }>
  },
): TripStoreRow {
  const trip = getTrip(tripId)
  if (!trip?.hard_quote?.options?.length) {
    throw new Error('no hard quote to update')
  }
  const margin = Math.max(0, input.margin_pct)
  const byId = new Map(
    input.options.map((o) => [o.offer_id, Math.round(o.client_total)]),
  )
  mutateTrip(tripId, (t) => {
    t.offer_margin_pct = margin
    if (!t.hard_quote?.options) return
    for (const opt of t.hard_quote.options) {
      const next = byId.get(opt.offer_id)
      if (next != null) opt.client_total = next
    }
    t.hard_quote.total = Math.min(
      ...t.hard_quote.options.map((o) => o.client_total),
    )
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'hard_quote_pricing_updated',
      payload: {
        margin_pct: margin,
        totals: Object.fromEntries(byId),
        accept_token: t.hard_quote.accept_token,
      },
    })
  })
  return getTrip(tripId)!
}

export async function acceptHardQuoteOption(token: string, offerId: string) {
  const trip = (await import('@/lib/tripStore')).getTripByAcceptToken(token)
  if (!trip) throw new Error('invalid accept token')
  if (trip.state === 'booked' || trip.state === 'in_progress' || trip.state === 'delivered') {
    return getTrip(trip.id)!
  }
  if (trip.state !== 'quoted_hard') {
    throw new Error(`cannot accept from state ${trip.state}`)
  }
  const opt = trip.hard_quote?.options?.find((o) => o.offer_id === offerId)
  const offer = trip.offers.find((o) => o.id === offerId)
  if (!offer && !opt) throw new Error('option not found')
  mutateTrip(trip.id, (t) => {
    for (const o of t.offers) {
      if (o.id === offerId) o.state = 'selected'
      else if (o.state === 'selected' || o.state === 'quoted') o.state = 'stood_down'
    }
    if (t.hard_quote?.options?.length) {
      const kept = t.hard_quote.options.find((o) => o.offer_id === offerId)
      if (kept) {
        t.hard_quote.total = kept.client_total
        t.hard_quote.options = [kept]
      }
    }
  })
  return acceptHardQuote(token)
}

/**
 * Desk accepts one quoted option on the client's behalf (no client email blast).
 * Marks that offer selected, stands other selected offers down, books the trip.
 */
export async function deskAcceptOfferOption(
  tripId: string,
  offerId: string,
  clientTotal?: number,
): Promise<TripStoreRow> {
  const totals =
    clientTotal != null ? { [offerId]: clientTotal } : undefined
  await selectOffersAndHardQuote(tripId, [offerId], totals, [], {
    notifyClient: false,
  })
  const trip = getTrip(tripId)
  const token = trip?.hard_quote?.accept_token
  if (!token) throw new Error('hard quote missing after select')
  return acceptHardQuote(token, { actor: 'dispatcher' })
}

/**
 * Desk "Approve trip" from Dispatch waterfall — pick a quoted operator
 * (or use offerId), lock hard quote without client email, book the trip.
 */
export async function deskApproveTrip(
  tripId: string,
  offerId?: string,
): Promise<TripStoreRow> {
  const trip = getTrip(tripId)
  if (!trip) throw new Error('trip not found')
  if (
    ['booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(
      trip.state,
    )
  ) {
    return trip
  }

  const quoteable = trip.offers.filter(
    (o) =>
      (o.state === 'quoted' || o.state === 'selected') &&
      o.price_net != null &&
      !o.bookingGated,
  )
  const picked =
    (offerId
      ? quoteable.find((o) => o.id === offerId) ??
        trip.offers.find((o) => o.id === offerId)
      : null) ??
    quoteable.find((o) => o.state === 'selected') ??
    [...quoteable].sort(
      (a, b) => (a.price_net ?? Infinity) - (b.price_net ?? Infinity),
    )[0]

  if (!picked) {
    throw new Error('Enter an operator quote before approving the trip')
  }
  if (picked.bookingGated) {
    throw new Error('booking gated — insurance/compliance')
  }
  if (picked.price_net == null) {
    throw new Error('Enter an operator quote before approving the trip')
  }
  if (picked.state !== 'quoted' && picked.state !== 'selected') {
    throw new Error('Operator must have submitted a quote before approve')
  }

  // Estimated quotes sit before offers_out — step through for legal transitions.
  if (trip.state === 'quoted_estimated') {
    safeTransitionTrip(tripId, 'offers_out', 'dispatcher', {
      reason: 'desk_approve_trip',
    })
  }

  mutateTrip(tripId, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'desk_approve_trip',
      payload: { offer_id: picked.id, operator_name: picked.operator_name },
    })
  })

  return deskAcceptOfferOption(tripId, picked.id)
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
  return cells
}

function canSms(cell: string | null | undefined, isMock?: boolean): boolean {
  return Boolean(cell?.trim()) && !isMock
}

export async function acceptHardQuote(
  token: string,
  opts?: { actor?: string },
) {
  const trip = (await import('@/lib/tripStore')).getTripByAcceptToken(token)
  if (!trip) throw new Error('invalid accept token')
  if (trip.state === 'booked' || trip.state === 'in_progress' || trip.state === 'delivered') {
    return getTrip(trip.id)!
  }
  if (trip.state !== 'quoted_hard') {
    throw new Error(`cannot accept from state ${trip.state}`)
  }
  const actor = opts?.actor?.trim() || 'client'
  const kind = payloadKindOf(trip)
  const acceptedAt = new Date().toISOString()
  mutateTrip(trip.id, (t) => {
    if (!t.hard_quote) return
    t.hard_quote.client_decision = 'accepted'
    t.hard_quote.accepted_at = acceptedAt
    t.hard_quote.declined_at = undefined
    if (kind === 'pax' || kind === 'both') {
      t.hard_quote.disclosure_at = acceptedAt
    }
    t.events.push({
      at: acceptedAt,
      actor,
      kind: 'hard_quote_accepted',
      payload: {
        accept_token: token,
        desk_approved: actor === 'dispatcher',
      },
    })
  })
  safeTransitionTrip(trip.id, 'booked', actor, { accept_token: token })
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
  const { portalTrackingUrlForTrip } = await import('@/lib/etaSheetSender')
  const trackPath = portalTrackingUrlForTrip(fresh.id)

  for (const cell of recipientCells(fresh)) {
    await comms.send({
      channel: 'sms',
      to: cell,
      body: `OnFly booked ${fresh.lane}. Tracking: ${trackPath}`,
    })
  }

  if (selected && canSms(selected.contact_cell, selected.contact_cell_is_mock)) {
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
      if (canSms(o.contact_cell, o.contact_cell_is_mock)) {
        await comms.send({
          channel: 'sms',
          to: o.contact_cell,
          body: standDownBody(fresh.lane),
        })
      }
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
          company: sel.operator_name,
          role: 'operator_ops',
          cell: sel.contact_cell,
          in_thread: true,
        })
        await inviteTripParticipant(trip.id, p.id)
      }
    }
  }

  try {
    const { allocateNextPoForClient } = await import('@/lib/allocateNextPo')
    const { getClient } = await import('@/lib/clientStore')
    const booked = getTrip(trip.id)!
    const clientName =
      booked.quick?.client_name ??
      (booked.client_id ? getClient(booked.client_id)?.name : undefined) ??
      'Client'
    if (!booked.po_number?.trim() && !booked.quick?.po?.trim()) {
      const po = await allocateNextPoForClient({
        clientId: booked.client_id,
        clientName,
      })
      mutateTrip(trip.id, (t) => {
        t.po_number = po
        if (t.quick) t.quick.po = po
      })
    }
    // Create QB invoice (draft) — desk sends from Approved actions with bubble.
    const { createInvoiceForTrip } = await import('@/lib/tripStore')
    await createInvoiceForTrip(trip.id, { skipEmail: true })
  } catch (e) {
    console.warn('[accept] invoice / PO allocate failed', e)
  }

  const { runOnBookedAutomations } = await import('@/lib/onBooked')
  // ETA sheet is a desk action on Approved (bubble + send) — not auto-blast.
  await runOnBookedAutomations(trip.id, { skipEtaEmail: true })

  return getTrip(trip.id)!
}

/**
 * Client declines the hard quote. Stays in quoted_hard so the desk can
 * send another quote; status shows Declined (No) until a new quote is sent.
 */
export async function declineHardQuote(token: string) {
  const trip = (await import('@/lib/tripStore')).getTripByAcceptToken(token)
  if (!trip) throw new Error('invalid accept token')
  if (trip.hard_quote?.client_decision === 'declined') {
    return getTrip(trip.id)!
  }
  if (trip.state !== 'quoted_hard') {
    throw new Error(`cannot decline from state ${trip.state}`)
  }
  const declinedAt = new Date().toISOString()
  mutateTrip(trip.id, (t) => {
    if (t.hard_quote) {
      t.hard_quote.client_decision = 'declined'
      t.hard_quote.declined_at = declinedAt
      t.hard_quote.accepted_at = undefined
    }
    t.events.push({
      at: declinedAt,
      actor: 'client',
      kind: 'hard_quote_declined',
      payload: { accept_token: token },
    })
  })
  const { flushPersistTrip } = await import('@/lib/tripStore')
  await flushPersistTrip(trip.id)
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

export type { OfferRow }
