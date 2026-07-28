/**
 * Dispatch Center waterfall drawers — derived view over Trip + inbound.
 * Labels for operators: "trip offers" (never "bid").
 */

import type { TripState } from '@/domain/stateMachine'
import { tripStateLabel } from '@/domain/pipelineStages'
import {
  describeOfferDestination,
  formatOfferQuoteSummary,
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
    blurb: 'Scratchpad, portal requests, and open requests',
  },
  {
    id: 'offers',
    label: 'Trip offers to operators',
    blurb: 'Operator trip offers and replies',
  },
  {
    id: 'submitted_quotes',
    label: 'Submitted quotes',
    blurb: 'Operator quotes in — open to compare',
  },
  {
    id: 'quotes',
    label: 'Quotes to clients',
    blurb: 'Compare operator quotes, set client price, send branded email',
  },
  {
    id: 'approved',
    label: 'Approved trips',
    blurb: 'Booked only — send invoice, then ETA sheet',
  },
  {
    id: 'tracking',
    label: 'Live tracking',
    blurb: 'In progress — tracking portal + trip group chat',
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
  /** Channel + email/SMS on file for this offer. */
  destination_summary: string
  destination_gaps: string[]
  notified: boolean
  /** Declined (No) collapsed after desk Acknowledge. */
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
  /** Per-operator rows for trip-offer cards. */
  recipients?: DispatchRecipient[]
  trip_id?: string
  /**
   * Dynamic queue data can be deleted from the waterfall.
   * Hardcoded chrome (tools, drawer labels) never becomes a card.
   */
  deletable: boolean
  /** Desk can book this card (quoted operator ready). */
  approvable: boolean
  /** Preferred offer when approving a submitted-quote card. */
  approve_offer_id?: string
  /** Mission / ops chips (D2D, forklift required, ground courier). */
  chips?: string[]
  /**
   * Booked / approved trip facts for invoice + ETA sheet desk work.
   * Desk-only — never copy operator_name onto client docs.
   */
  booking?: {
    operator_name: string | null
    type_name: string | null
    tail: string | null
    client_total: number | null
    po: string | null
  } | null
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

/** Split quote-path trip states into waterfall drawers.
 * Approved = booked only (invoice + ETA sheet). Live work → tracking.
 */
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
  trips: Array<{
    id: string
    ref: number
    /** Unique internal code (2 letters + 3 digits), e.g. AB123. */
    code?: string | null
    lane: string
    state: TripState
    /** Who this trip is for — preferred in card titles over T-####. */
    client_name?: string | null
    service_pattern?: string | null
    forklift_required?: boolean
    forklift_recommended?: boolean
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
  }>
}): DispatchDrawerBucket {
  const out = emptyBuckets()

  for (const r of input.requests) {
    if (r.status !== 'submitted' && r.status !== 'in_review') continue
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
    const drawer = drawerForTripState(t.state)
    if (!drawer) continue
    const legsDone = t.legs.filter((l) => l.status === 'done').length
    const legBit = t.legs.length ? ` · ${legsDone}/${t.legs.length} legs` : ''
    const po = t.quick?.po ? ` · PO ${t.quick.po}` : ''
    const client = (
      t.client_name ||
      t.quick?.client_name ||
      ''
    ).trim()
    const code = (t.code ?? '').trim().toUpperCase()
    const tripIdLabel = code || `T-${t.ref}`
    const tripTitle = client
      ? `${client} · ${t.lane}${po}`
      : `Client TBD · ${t.lane}${po}`
    const recipients: DispatchRecipient[] = (t.offers ?? []).map((o) => {
      const status = offerRecipientStatus(o.state)
      const token = o.magic_token ?? ''
      const notified = Boolean(o.notified_at)
      const declined_acked =
        status === 'no' && Boolean(o.declined_acked_at)
      const dest = describeOfferDestination(o)
      const atIso = notified ? o.notified_at : o.ping_sent_at
      const sent = formatOfferSentAt(atIso, Date.now(), notified ? 'notified' : 'link')
      return {
        offer_id: o.id,
        name: o.operator_name,
        status,
        status_label: declined_acked
          ? 'unavailable'
          : offerRecipientStatusLabel(status, { notified }),
        quote_summary: formatOfferQuoteSummary(o),
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
          : `/dispatch?drawer=${drawer ?? 'offers'}&focus=${t.id}`,
      }
    })
    const stayOnDispatch =
      t.state === 'offers_out' ||
      t.state === 'quoted_hard' ||
      t.state === 'booked' ||
      t.state === 'in_progress'
    const selectedOffer =
      (t.offers ?? []).find((o) => o.state === 'selected') ??
      (t.offers ?? []).find((o) => o.state === 'quoted')
    const hqOpt =
      t.hard_quote?.options?.find((o) => o.offer_id === selectedOffer?.id) ??
      t.hard_quote?.options?.[0]
    const booking =
      t.state === 'booked'
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
            client_total:
              hqOpt?.client_total ??
              t.hard_quote?.total ??
              null,
            po:
              t.po_number?.trim() ||
              t.quick?.po?.trim() ||
              null,
          }
        : null
    const offerSubtitle =
      t.state === 'offers_out' || t.state === 'quoted_hard'
        ? tripIdLabel
        : t.state === 'booked'
          ? [
              'Approved',
              tripIdLabel,
              booking?.type_name,
              booking?.tail,
              booking?.client_total != null
                ? `$${Math.round(booking.client_total).toLocaleString('en-US')}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : t.state === 'in_progress'
            ? ['Live', tripIdLabel].filter(Boolean).join(' · ')
          : `${tripStateLabel(t.state)} · ${tripIdLabel}${
              t.quick ? ' · quick' : ''
            }${legBit}`
    const quoteableOffers = (t.offers ?? []).filter(
      (o) =>
        (o.state === 'quoted' || o.state === 'selected') &&
        o.price_net != null,
    )
    // Approve lives on Submitted quotes / Quotes to clients — never on Approved.
    const tripApprovable =
      quoteableOffers.length > 0 &&
      (t.state === 'offers_out' ||
        t.state === 'quoted_hard' ||
        t.state === 'quoted_estimated' ||
        t.state === 'lost')
    const chips: string[] = []
    if (t.service_pattern) chips.push(t.service_pattern)
    if (t.forklift_required) chips.push('forklift required')
    else if (t.forklift_recommended) chips.push('forklift recommended')
    if (
      t.service_pattern === 'D2D' ||
      t.service_pattern === 'D2A' ||
      t.service_pattern === 'A2D'
    ) {
      chips.push('ground courier')
    }
    out[drawer].push({
      kind: 'trip',
      id: t.id,
      title: tripTitle,
      subtitle: offerSubtitle,
      href: stayOnDispatch
        ? `/dispatch?drawer=${drawer}&focus=${t.id}`
        : `/trips/${t.id}`,
      ref: t.ref,
      state: t.state,
      recipients:
        t.state === 'offers_out' || t.state === 'quoted_hard'
          ? recipients
          : undefined,
      trip_id: t.id,
      deletable: true,
      approvable: tripApprovable,
      approve_offer_id: quoteableOffers.find((o) => o.state === 'selected')?.id,
      chips: chips.length ? chips : undefined,
      booking,
    })

    // Submitted quotes waterfall — each quoted operator as its own card.
    if (t.state === 'offers_out' || t.state === 'quoted_hard') {
      const focusDrawer =
        t.state === 'quoted_hard' ? 'quotes' : 'offers'
      for (const o of t.offers ?? []) {
        if (o.state !== 'quoted' && o.state !== 'selected') continue
        const summary = formatOfferQuoteSummary(o)
        const who = client || tripIdLabel
        out.submitted_quotes.push({
          kind: 'offer_quote',
          id: o.id,
          title: `${o.operator_name} · Quote submitted`,
          subtitle: `${who} · ${t.lane}${summary ? ` · ${summary}` : ''}`,
          href: `/dispatch?drawer=${focusDrawer}&focus=${t.id}`,
          ref: t.ref,
          trip_id: t.id,
          deletable: true,
          approvable: o.price_net != null,
          approve_offer_id: o.id,
          chips: chips.length ? chips : undefined,
        })
      }
    }
  }

  return out
}
