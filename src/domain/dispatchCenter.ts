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
  offerRecipientStatus,
  offerRecipientStatusLabel,
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
  /** Channel + email/SMS on file for this offer. */
  destination_summary: string
  destination_gaps: string[]
  notified: boolean
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
      notified_at?: string | null
      replied_at?: string | null
      magic_token?: string
      price_net?: number | null
      time_to_position_min?: number | null
      live_leg_min?: number | null
      fee_scope?: string | null
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
    out.requests.push({
      kind: 'request',
      id: r.id,
      title: `R-${r.ref} · ${r.lane}`,
      subtitle: `${requestSourceLabel(r.source)} · ${r.summary}${
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
      const notified = Boolean(o.notified_at)
      const dest = describeOfferDestination(o)
      const atIso = notified ? o.notified_at : o.ping_sent_at
      const sent = formatOfferSentAt(atIso, Date.now(), notified ? 'notified' : 'link')
      return {
        offer_id: o.id,
        name: o.operator_name,
        status,
        status_label: offerRecipientStatusLabel(status, { notified }),
        quote_summary: formatOfferQuoteSummary(o),
        sent_at: atIso ?? null,
        sent_label: sent?.display ?? null,
        destination_summary: dest.summary,
        destination_gaps: dest.gaps,
        notified,
        magic_token: token,
        href: token ? `/offer/${token}` : `/trips/${t.id}/offers`,
      }
    })
    const yes = recipients.filter((r) => r.status === 'yes').length
    const no = recipients.filter((r) => r.status === 'no').length
    const quoted = recipients.filter((r) => r.status === 'quote_submitted').length
    const awaiting = recipients.filter((r) => r.status === 'awaiting').length
    const notifiedN = recipients.filter((r) => r.notified).length
    const offerBit =
      t.state === 'offers_out' && recipients.length
        ? ` · ${recipients.length} recipients · ${notifiedN} notified · ${yes} yes · ${no} no · ${quoted} quoted · ${awaiting} awaiting`
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
