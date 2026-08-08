/**
 * Dispatch Center waterfall drawers — derived view over Trip + inbound.
 * Rule: one trip appears in exactly one stage at a time.
 * Labels for operators: "trip offers" (never "bid").
 */

import type { TripState } from '@/domain/stateMachine'
import {
  describeOfferDestination,
  formatOfferSentAt,
  offerQuoteFacts,
  offerRecipientStatus,
  offerRecipientStatusLabel,
  type OfferQuoteFacts,
  type OfferRecipientStatus,
} from '@/domain/offerRecipients'

export const DISPATCH_DRAWERS = [
  {
    id: 'requests',
    label: 'Trip requests',
    shortLabel: 'Trip requests',
    blurb: 'New work — open or delete a request',
  },
  {
    id: 'offers',
    label: 'Trip offers to operators',
    shortLabel: 'Offers out',
    blurb: 'Send offers and wait for replies — no quotes in yet',
  },
  {
    id: 'submitted_quotes',
    label: 'Submitted quotes',
    shortLabel: 'Quotes in',
    blurb: 'Operator quotes in — compare, price, send hard quote to client',
  },
  {
    id: 'quotes',
    label: 'Quotes to clients',
    shortLabel: 'Quotes to clients',
    blurb: 'Hard quote out — revise / send another, or wait for client Yes',
  },
  {
    id: 'approved',
    label: 'Approved trips',
    shortLabel: 'Approved',
    blurb: 'Client accepted — send invoice, ETA sheet, then start live tracking',
  },
  {
    id: 'tracking',
    label: 'Live tracking',
    shortLabel: 'Live tracking',
    blurb:
      'In progress — portal, chat, then Log as complete when the mission is done',
  },
] as const

export type DispatchDrawerId = (typeof DISPATCH_DRAWERS)[number]['id']

export type DispatchRecipient = {
  offer_id: string
  name: string
  status: OfferRecipientStatus
  status_label: string
  quote_summary: string | null
  quote_facts: OfferQuoteFacts | null
  sent_at: string | null
  sent_label: string | null
  destination_summary: string
  destination_gaps: string[]
  notified: boolean
  declined_acked: boolean
  magic_token: string
  href: string
}

export type DispatchCard = {
  id: string
  title: string
  subtitle: string
  href: string
  kind: 'request' | 'trip' | 'offer_quote'
  state?: TripState
  ref?: number
  /** Trip public code for the gold badge (e.g. SC965). */
  code?: string | null
  /** Muted meta beside the code (e.g. "1 quote", "2 options"). */
  meta?: string | null
  recipients?: DispatchRecipient[]
  trip_id?: string
  deletable: boolean
  approvable: boolean
  approve_offer_id?: string
  chips?: string[]
  booking?: {
    operator_name: string | null
    type_name: string | null
    tail: string | null
    client_total: number | null
    po: string | null
  } | null
  /** Structured quote facts (submitted quotes stage). */
  quote_facts?: OfferQuoteFacts | null
}

function requestSourceLabel(source: string): string {
  if (source === 'portal') return 'Portal'
  if (source === 'scratchpad') return 'Scratchpad'
  return 'Dispatch'
}

export type DispatchDrawerBucket = Record<DispatchDrawerId, DispatchCard[]>

function emptyBuckets(): DispatchDrawerBucket {
  return {
    requests: [],
    offers: [],
    submitted_quotes: [],
    quotes: [],
    approved: [],
    tracking: [],
  }
}

function hasOperatorQuote(
  offers?: Array<{ state: string }>,
): boolean {
  return (offers ?? []).some(
    (o) => o.state === 'quoted' || o.state === 'selected',
  )
}

/**
 * Exclusive stage for a trip — never two drawers at once.
 * offers_out with quotes → submitted_quotes (leaves Trip offers).
 */
export function exclusiveDrawerForTrip(input: {
  state: TripState
  offers?: Array<{ state: string }>
}): DispatchDrawerId | null {
  switch (input.state) {
    case 'booked':
      return 'approved'
    case 'in_progress':
      return 'tracking'
    case 'quoted_hard':
    case 'quoted_estimated':
    case 'draft':
    case 'routed':
      return 'quotes'
    case 'offers_out':
      return hasOperatorQuote(input.offers) ? 'submitted_quotes' : 'offers'
    default:
      return null
  }
}

/** @deprecated Prefer exclusiveDrawerForTrip — state alone is not enough for offers_out. */
export function drawerForTripState(state: TripState): DispatchDrawerId | null {
  switch (state) {
    case 'offers_out':
      return 'offers'
    case 'draft':
    case 'routed':
    case 'quoted_estimated':
    case 'quoted_hard':
      return 'quotes'
    case 'booked':
      return 'approved'
    case 'in_progress':
      return 'tracking'
    default:
      return null
  }
}

type TripInput = {
  id: string
  ref: number
  code?: string | null
  lane: string
  state: TripState
  /** When set, the inbound request has moved on — hide it from Trip requests. */
  request_id?: string | null
  client_name?: string | null
  service_pattern?: string | null
  forklift_required?: boolean
  forklift_recommended?: boolean
  awb_needed?: boolean
  quick?: {
    po?: string
    client_name?: string
    tail?: string
    aircraft_type?: string
    operator_name?: string
  } | null
  po_number?: string | null
  hard_quote?: {
    total?: number
    options?: Array<{
      offer_id: string
      client_total: number
      type_name?: string | null
      tail?: string | null
      operator_name?: string | null
    }>
  } | null
  legs: Array<{ status: string }>
  offers?: Array<{
    id: string
    operator_name: string
    state: string
    ping_sent_at?: string | null
    notified_at?: string | null
    declined_acked_at?: string | null
    replied_at?: string | null
    magic_token?: string
    price_net?: number | null
    time_to_position_min?: number | null
    quick_turn_min?: number | null
    live_leg_min?: number | null
    fee_scope?: string | null
    type_name?: string | null
    tail?: string | null
    contact_email?: string | null
    contact_cell?: string | null
    contact_cell_is_mock?: boolean
    quote_link_channel?: string | null
  }>
}

function missionChips(t: TripInput): string[] | undefined {
  const chips: string[] = []
  if (t.service_pattern) chips.push(t.service_pattern)
  if (t.forklift_required) chips.push('forklift required')
  else if (t.forklift_recommended) chips.push('forklift recommended')
  if (t.awb_needed) chips.push('AWB needed')
  if (
    t.service_pattern === 'D2D' ||
    t.service_pattern === 'D2A' ||
    t.service_pattern === 'A2D'
  ) {
    chips.push('ground courier')
  }
  return chips.length ? chips : undefined
}

function mapRecipients(
  t: TripInput,
  drawer: DispatchDrawerId,
  opts?: { quotedOnly?: boolean },
): DispatchRecipient[] {
  return (t.offers ?? [])
    .filter((o) => {
      if (!opts?.quotedOnly) return true
      return o.state === 'quoted' || o.state === 'selected'
    })
    .map((o) => {
      const status = offerRecipientStatus(o.state)
      const token = o.magic_token ?? ''
      const notified = Boolean(o.notified_at)
      const declined_acked =
        status === 'no' && Boolean(o.declined_acked_at)
      const dest = describeOfferDestination(o)
      const atIso = notified ? o.notified_at : o.ping_sent_at
      const sent = formatOfferSentAt(
        atIso,
        Date.now(),
        notified ? 'notified' : 'link',
      )
      return {
        offer_id: o.id,
        name: o.operator_name,
        status,
        status_label: declined_acked
          ? 'unavailable'
          : offerRecipientStatusLabel(status, { notified }),
        quote_summary: null,
        quote_facts: offerQuoteFacts(o),
        sent_at: atIso ?? null,
        sent_label: sent?.display ?? null,
        destination_summary: dest.summary,
        destination_gaps: dest.gaps,
        notified,
        declined_acked,
        magic_token: token,
        href: token
          ? `/offer/${token}`
          : `/dispatch?drawer=${drawer}&focus=${t.id}`,
      }
    })
}

export function buildDispatchDrawers(input: {
  requests: Array<{
    id: string
    ref: number
    lane: string
    summary: string
    source: string
    status: string
    email?: string
    client_name?: string | null
    hard_quote_requested_at?: string | null
  }>
  trips: TripInput[]
}): DispatchDrawerBucket {
  const out = emptyBuckets()
  const seenTripIds = new Set<string>()
  // Request → trip handoff: once a trip claims the request, leave Trip requests.
  const claimedRequestIds = new Set(
    input.trips
      .map((t) => t.request_id?.trim())
      .filter((id): id is string => Boolean(id)),
  )

  for (const r of input.requests) {
    if (r.status !== 'submitted' && r.status !== 'in_review') continue
    if (claimedRequestIds.has(r.id)) continue
    const client = (r.client_name ?? '').trim()
    out.requests.push({
      kind: 'request',
      id: r.id,
      title: client
        ? `R-${r.ref} · ${client} · ${r.lane}`
        : `R-${r.ref} · ${r.lane}`,
      subtitle: `${requestSourceLabel(r.source)} · ${r.summary}${
        r.hard_quote_requested_at ? ' · HARD QUOTE' : ''
      }${r.email ? ` · ${r.email}` : ''}`,
      href: `/trips/new?request=${r.id}`,
      ref: r.ref,
      deletable: true,
      approvable: false,
    })
  }

  for (const t of input.trips) {
    if (seenTripIds.has(t.id)) continue
    const drawer = exclusiveDrawerForTrip(t)
    if (!drawer) continue
    seenTripIds.add(t.id)

    const client = (
      t.client_name ||
      t.quick?.client_name ||
      ''
    ).trim()
    const code = (t.code ?? '').trim().toUpperCase()
    const tripIdLabel = code || `T-${t.ref}`
    const tripTitle = client
      ? `${client} · ${t.lane}`
      : `Client TBD · ${t.lane}`
    const chips = missionChips(t)
    const quoteableOffers = (t.offers ?? []).filter(
      (o) =>
        (o.state === 'quoted' || o.state === 'selected') &&
        o.price_net != null,
    )

    // —— Submitted quotes: trip leaves Offers; show quoted operators only ——
    if (drawer === 'submitted_quotes') {
      const quotedRecipients = mapRecipients(t, drawer, { quotedOnly: true })
      const quoteMeta = `${quoteableOffers.length} quote${
        quoteableOffers.length === 1 ? '' : 's'
      }`
      out.submitted_quotes.push({
        kind: 'trip',
        id: t.id,
        title: tripTitle,
        subtitle: quoteMeta,
        code: tripIdLabel,
        meta: quoteMeta,
        href: `/dispatch?drawer=submitted_quotes&focus=${t.id}`,
        ref: t.ref,
        state: t.state,
        recipients: quotedRecipients,
        trip_id: t.id,
        deletable: true,
        // Booking waits for client accept — desk does not Approve here.
        approvable: false,
        approve_offer_id: undefined,
        chips,
      })
      continue
    }

    const selectedOffer =
      (t.offers ?? []).find((o) => o.state === 'selected') ??
      (t.offers ?? []).find((o) => o.state === 'quoted')
    const hqOpt =
      t.hard_quote?.options?.find((o) => o.offer_id === selectedOffer?.id) ??
      t.hard_quote?.options?.[0]

    const booking =
      drawer === 'approved'
        ? {
            operator_name:
              selectedOffer?.operator_name?.trim() ||
              hqOpt?.operator_name?.trim() ||
              t.quick?.operator_name?.trim() ||
              null,
            type_name:
              selectedOffer?.type_name?.trim() ||
              hqOpt?.type_name?.trim() ||
              t.quick?.aircraft_type?.trim() ||
              null,
            tail:
              (selectedOffer?.tail?.trim() && selectedOffer.tail !== 'TBD'
                ? selectedOffer.tail.trim()
                : null) ||
              (hqOpt?.tail?.trim() && hqOpt.tail !== 'TBD'
                ? hqOpt.tail.trim()
                : null) ||
              t.quick?.tail?.trim() ||
              null,
            client_total: hqOpt?.client_total ?? t.hard_quote?.total ?? null,
            po: t.po_number?.trim() || t.quick?.po?.trim() || null,
          }
        : null

    let meta: string | null = null
    if (drawer === 'approved') {
      meta = [
        booking?.type_name,
        booking?.tail,
        booking?.client_total != null
          ? `$${Math.round(booking.client_total).toLocaleString('en-US')}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || null
    } else if (drawer === 'tracking') {
      meta = 'Live'
    } else if (drawer === 'quotes') {
      meta = quoteableOffers.length
        ? `${quoteableOffers.length} option${quoteableOffers.length === 1 ? '' : 's'}`
        : null
    }
    // Offers stage: trip code badge only (operator count lives in SENT TO).

    const recipients =
      drawer === 'offers'
        ? mapRecipients(t, drawer)
        : drawer === 'quotes'
          ? mapRecipients(t, drawer, { quotedOnly: true })
          : undefined

    out[drawer].push({
      kind: 'trip',
      id: t.id,
      title: tripTitle,
      subtitle: [tripIdLabel, meta].filter(Boolean).join(' · '),
      code: tripIdLabel,
      meta,
      href: `/dispatch?drawer=${drawer}&focus=${t.id}`,
      ref: t.ref,
      state: t.state,
      recipients,
      trip_id: t.id,
      // Delete only while still shaping the mission — not after book / live.
      // (submitted_quotes uses its own push path above, also deletable.)
      deletable: drawer === 'offers' || drawer === 'quotes',
      // Never desk-approve — client Yes books the trip into Approved.
      approvable: false,
      approve_offer_id: undefined,
      chips: drawer === 'tracking' ? undefined : chips,
      booking,
    })
  }

  return out
}
