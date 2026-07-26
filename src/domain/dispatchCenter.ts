/**
 * Dispatch Center waterfall drawers — derived view over Trip + inbound.
 * Labels for operators: "trip offers" (never "bid").
 */

import type { TripState } from '@/domain/stateMachine'
import { tripStateLabel } from '@/domain/pipelineStages'

export const DISPATCH_DRAWERS = [
  {
    id: 'requests',
    label: 'Trip requests',
    blurb: 'Inbound portal, email/SMS, and open requests',
  },
  {
    id: 'offers',
    label: 'Trip offers to operators',
    blurb: 'Availability asks out — waiting on operator replies / quotes',
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

export type DispatchCard = {
  id: string
  title: string
  subtitle: string
  href: string
  kind: 'intake' | 'request' | 'trip'
  state?: TripState
  ref?: number
}

export type DispatchDrawerBucket = Record<DispatchDrawerId, DispatchCard[]>

function emptyBuckets(): DispatchDrawerBucket {
  return {
    requests: [],
    offers: [],
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
  intake: Array<{
    id: string
    channel: string
    from: string
    subject: string
    extracted?: {
      origin_text?: string
      destination_text?: string
      [k: string]: unknown
    } | null
  }>
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
    offers?: Array<{ state: string }>
  }>
}): DispatchDrawerBucket {
  const out = emptyBuckets()

  for (const d of input.intake) {
    const route = d.extracted
      ? `${String(d.extracted.origin_text ?? '?')} → ${String(d.extracted.destination_text ?? '?')}`
      : d.subject
    out.requests.push({
      kind: 'intake',
      id: d.id,
      title: `${d.channel.toUpperCase()} · ${d.from}`,
      subtitle: route,
      href: `/intake/${d.id}`,
    })
  }

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
    const offerBit =
      t.state === 'offers_out' && t.offers?.length
        ? ` · ${t.offers.filter((o) => o.state === 'quoted').length}/${t.offers.length} replied`
        : ''
    out[drawer].push({
      kind: 'trip',
      id: t.id,
      title: `T-${t.ref} · ${t.lane}${po}`,
      subtitle: `${tripStateLabel(t.state)}${t.quick ? ' · quick' : ''}${legBit}${offerBit}`,
      href:
        t.state === 'offers_out'
          ? `/trips/${t.id}/offers`
          : t.state === 'in_progress'
            ? `/chat/${t.id}`
            : `/trips/${t.id}`,
      ref: t.ref,
      state: t.state,
    })
  }

  return out
}
