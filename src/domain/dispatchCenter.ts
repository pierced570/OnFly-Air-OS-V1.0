/**
 * Dispatch Center waterfall drawers — derived view over Trip + inbound.
 * Labels for operators: "trip offers" (never "bid").
 */

import type { TripState } from '@/domain/stateMachine'
import { tripStateLabel } from '@/domain/pipelineStages'
import {
  formatOfferQuoteSummary,
  formatOfferSentAt,
  offerRecipientStatus,
  offerRecipientStatusLabel,
  type OfferRecipientStatus,
} from '@/domain/offerRecipients'
import { extractFromScratchNotes } from '@/domain/scratchParse'

/** Stable id for the live Call pad card in Trip requests. */
export const CALL_PAD_REQUEST_ID = 'call-pad'

export const DISPATCH_DRAWERS = [
  {
    id: 'requests',
    label: 'Trip requests',
    blurb: 'Call pad notes, portal requests, and open requests',
  },
  {
    id: 'offers',
    label: 'Trip offers to operators',
    blurb: 'Who got the request — yes / no / awaiting',
  },
  {
    id: 'submitted_quotes',
    label: 'Submitted quotes',
    blurb: 'Operator quotes in — open to compare',
  },
  {
    id: 'quotes',
    label: 'Quotes to clients',
    blurb: 'Estimates and hard quotes with the client',
  },
  {
    id: 'approved',
    label: 'Approved trips',
    blurb: 'Booked — confirmations and ETA sheets',
  },
  {
    id: 'tracking',
    label: 'Live tracking',
    blurb: 'In progress — execution and exceptions',
  },
] as const

export type DispatchDrawerId = (typeof DISPATCH_DRAWERS)[number]['id']

export type DispatchRecipient = {
  offer_id: string
  name: string
  status: OfferRecipientStatus
  status_label: string
  quote_summary: string | null
  sent_at: string | null
  sent_label: string | null
  magic_token: string
  href: string
}

export type DispatchCard = {
  id: string
  title: string
  subtitle: string
  href: string
  kind: 'call_pad' | 'request' | 'trip' | 'offer_quote'
  state?: TripState
  ref?: number
  /** Per-operator rows for trip-offer cards. */
  recipients?: DispatchRecipient[]
  trip_id?: string
  /** Full Call pad body when kind is call_pad. */
  notes?: string
}

/** Build a Trip requests card from live Call pad notes (heuristic parse). */
export function callPadRequestCard(body: string): DispatchCard | null {
  const text = body.trim()
  if (!text) return null
  const ex = extractFromScratchNotes(text)
  const origin = ex.origin_text?.trim()
  const dest = ex.destination_text?.trim()
  const lane =
    origin && dest
      ? `${origin} → ${dest}`
      : origin || dest || 'Route TBD'
  const client = ex.client_name?.trim()
  const bits = [
    client,
    ex.asap ? 'ASAP' : ex.ready_local?.trim() || null,
    ex.pieces_text?.trim() || null,
    ex.pax_count != null ? `${ex.pax_count} pax` : null,
    ex.hazmat ? 'hazmat' : null,
  ].filter(Boolean) as string[]
  const preview = text.replace(/\s+/g, ' ')
  const short =
    preview.length > 160 ? `${preview.slice(0, 160)}…` : preview
  return {
    kind: 'call_pad',
    id: CALL_PAD_REQUEST_ID,
    title: client ? `${client} · ${lane}` : lane,
    subtitle: `Call pad${bits.length ? ` · ${bits.join(' · ')}` : ''} · ${short}`,
    href: '/desk',
    notes: text,
  }
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

/** Split quote-path trip states into offers vs client quotes. */
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
  /** Live Call pad body — surfaces first in Trip requests. */
  callPadBody?: string | null
  requests: Array<{
    id: string
    ref: number
    lane: string
    summary: string
    source: string
    status: string
    email?: string
    hard_quote_requested_at?: string | null
  }>
  trips: Array<{
    id: string
    ref: number
    lane: string
    state: TripState
    quick?: { po?: string } | null
    legs: Array<{ status: string }>
    offers?: Array<{
      id: string
      operator_name: string
      state: string
      ping_sent_at?: string | null
      replied_at?: string | null
      magic_token?: string
      price_net?: number | null
      time_to_position_min?: number | null
      live_leg_min?: number | null
      fee_scope?: string | null
      tail?: string | null
    }>
  }>
}): DispatchDrawerBucket {
  const out = emptyBuckets()

  const callPad = callPadRequestCard(input.callPadBody ?? '')
  if (callPad) out.requests.push(callPad)

  for (const r of input.requests) {
    if (r.status !== 'submitted' && r.status !== 'in_review') continue
    out.requests.push({
      kind: 'request',
      id: r.id,
      title: `R-${r.ref} · ${r.lane}`,
      subtitle: `${r.source === 'portal' ? 'Portal' : 'Dispatch'} · ${r.summary}${
        r.hard_quote_requested_at ? ' · HARD QUOTE' : ''
      }${r.email ? ` · ${r.email}` : ''}`,
      href: `/trips/new?request=${r.id}`,
      ref: r.ref,
    })
  }

  for (const t of input.trips) {
    const drawer = drawerForTripState(t.state)
    if (!drawer) continue
    const legsDone = t.legs.filter((l) => l.status === 'done').length
    const legBit = t.legs.length ? ` · ${legsDone}/${t.legs.length} legs` : ''
    const po = t.quick?.po ? ` · PO ${t.quick.po}` : ''
    const recipients: DispatchRecipient[] = (t.offers ?? []).map((o) => {
      const status = offerRecipientStatus(o.state)
      const token = o.magic_token ?? ''
      const sent = formatOfferSentAt(o.ping_sent_at)
      return {
        offer_id: o.id,
        name: o.operator_name,
        status,
        status_label: offerRecipientStatusLabel(status),
        quote_summary: formatOfferQuoteSummary(o),
        sent_at: o.ping_sent_at ?? null,
        sent_label: sent?.display ?? null,
        magic_token: token,
        href: token ? `/offer/${token}` : `/trips/${t.id}/offers`,
      }
    })
    const yes = recipients.filter((r) => r.status === 'yes').length
    const no = recipients.filter((r) => r.status === 'no').length
    const quoted = recipients.filter((r) => r.status === 'quote_submitted').length
    const awaiting = recipients.filter((r) => r.status === 'awaiting').length
    const offerBit =
      t.state === 'offers_out' && recipients.length
        ? ` · ${recipients.length} sent · ${yes} yes · ${no} no · ${quoted} quoted · ${awaiting} awaiting`
        : ''
    out[drawer].push({
      kind: 'trip',
      id: t.id,
      title: `T-${t.ref} · ${t.lane}${po}`,
      subtitle: `${tripStateLabel(t.state)}${t.quick ? ' · quick' : ''}${legBit}${offerBit}`,
      href:
        t.state === 'offers_out'
          ? `/trips/${t.id}/offers`
          : `/trips/${t.id}`,
      ref: t.ref,
      state: t.state,
      recipients: t.state === 'offers_out' ? recipients : undefined,
      trip_id: t.id,
    })

    // Submitted quotes waterfall — each quoted operator as its own card.
    if (t.state === 'offers_out' || t.state === 'quoted_hard') {
      for (const o of t.offers ?? []) {
        if (o.state !== 'quoted' && o.state !== 'selected') continue
        const summary = formatOfferQuoteSummary(o)
        out.submitted_quotes.push({
          kind: 'offer_quote',
          id: o.id,
          title: `${o.operator_name} · Quote submitted`,
          subtitle: `T-${t.ref} · ${t.lane}${summary ? ` · ${summary}` : ''}`,
          href: `/trips/${t.id}/offers`,
          ref: t.ref,
          trip_id: t.id,
        })
      }
    }
  }

  return out
}
