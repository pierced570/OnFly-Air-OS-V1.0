/**
 * Dispatcher pipeline stages — derived view over Trip spine + inbound requests.
 * Not a parallel status field; never write these to the DB.
 */

import type { TripState } from '@/domain/stateMachine'

export const PIPELINE_STAGES = [
  {
    id: 'inbound',
    label: 'Inbound',
    blurb: 'Request or email/SMS awaiting work',
  },
  {
    id: 'quote',
    label: 'Quote',
    blurb: 'Estimate, trip offers, hard quote',
  },
  {
    id: 'booked',
    label: 'Booked · ETA',
    blurb: 'Booked — ETA sheet & confirmations',
  },
  {
    id: 'tracking',
    label: 'Tracking',
    blurb: 'In progress — live execution',
  },
  {
    id: 'invoice',
    label: 'Invoice',
    blurb: 'Delivered — invoice / sheets',
  },
  {
    id: 'done',
    label: 'Done',
    blurb: 'Closed',
  },
] as const

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]['id']

/** Lost / cancelled — shown separately, not in the happy-path columns. */
export type PipelineBucket = PipelineStageId | 'out'

/** Map trip state machine → pipeline column. */
export function stageForTripState(state: TripState): PipelineBucket {
  switch (state) {
    case 'draft':
    case 'routed':
    case 'quoted_estimated':
    case 'offers_out':
    case 'quoted_hard':
      return 'quote'
    case 'booked':
      return 'booked'
    case 'in_progress':
      return 'tracking'
    case 'delivered':
    case 'invoiced':
      return 'invoice'
    case 'closed':
      return 'done'
    case 'lost':
    case 'cancelled':
      return 'out'
    default:
      return 'quote'
  }
}

/** Human label for a trip state inside its pipeline stage. */
export function tripStateLabel(state: TripState): string {
  const map: Record<TripState, string> = {
    draft: 'Draft',
    routed: 'Shortlist ready',
    quoted_estimated: 'Quote sent',
    offers_out: 'Offers out',
    quoted_hard: 'Hard quote',
    booked: 'Booked',
    in_progress: 'Tracking',
    delivered: 'Delivered',
    invoiced: 'Invoice sent',
    closed: 'Closed',
    lost: 'Lost',
    cancelled: 'Cancelled',
  }
  return map[state] ?? state
}

export type PipelineCard =
  | {
      kind: 'request'
      id: string
      stage: 'inbound'
      title: string
      subtitle: string
      href: string
      ref: number
    }
  | {
      kind: 'trip'
      id: string
      stage: PipelineBucket
      title: string
      subtitle: string
      href: string
      ref: number
      state: TripState
    }

export function buildPipeline(input: {
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
  }>
}): Record<PipelineBucket, PipelineCard[]> {
  const empty = (): Record<PipelineBucket, PipelineCard[]> => ({
    inbound: [],
    quote: [],
    booked: [],
    tracking: [],
    invoice: [],
    done: [],
    out: [],
  })
  const out = empty()

  for (const r of input.requests) {
    if (r.status !== 'submitted' && r.status !== 'in_review') continue
    out.inbound.push({
      kind: 'request',
      id: r.id,
      stage: 'inbound',
      title: `R-${r.ref} · ${r.lane}`,
      subtitle: `${
        r.source === 'portal'
          ? 'Portal'
          : r.source === 'scratchpad'
            ? 'Scratchpad'
            : 'Dispatch'
      } · ${r.summary}${
        r.hard_quote_requested_at ? ' · HARD QUOTE' : ''
      }${r.email ? ` · ${r.email}` : ''}`,
      href: `/trips/new?request=${r.id}`,
      ref: r.ref,
    })
  }

  for (const t of input.trips) {
    const stage = stageForTripState(t.state)
    const legsDone = t.legs.filter((l) => l.status === 'done').length
    const legBit = t.legs.length ? ` · ${legsDone}/${t.legs.length} legs` : ''
    const po = t.quick?.po ? ` · PO ${t.quick.po}` : ''
    out[stage].push({
      kind: 'trip',
      id: t.id,
      stage,
      title: `T-${t.ref} · ${t.lane}${po}`,
      subtitle: `${tripStateLabel(t.state)}${t.quick ? ' · quick' : ''}${legBit}`,
      href: `/trips/${t.id}`,
      ref: t.ref,
      state: t.state,
    })
  }

  return out
}

/** Ordered stage ids for the happy-path strip (excludes out). */
export const PIPELINE_STAGE_ORDER: PipelineStageId[] = PIPELINE_STAGES.map(
  (s) => s.id,
)

/** Index 0..n for progress UI; -1 if out/unknown. */
export function stageIndex(stage: PipelineBucket): number {
  if (stage === 'out') return -1
  return PIPELINE_STAGE_ORDER.indexOf(stage)
}
