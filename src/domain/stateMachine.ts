/**
 * Trip state machine — pure TypeScript (no React, no Supabase).
 * Transition map mirrors blueprint §3.1 and supabase trip_transition RPC.
 *
 * FORBIDDEN elsewhere: direct `update trips set state=...`
 * All state changes go through transition() / trip_transition RPC.
 */

export const TRIP_STATES = [
  'draft',
  'routed',
  'quoted_estimated',
  'offers_out',
  'quoted_hard',
  'booked',
  'in_progress',
  'delivered',
  'invoiced',
  'closed',
  'lost',
  'cancelled',
] as const

export type TripState = (typeof TRIP_STATES)[number]

/** Legal transitions: from → allowed to[] */
export const TRANSITIONS: Record<TripState, readonly TripState[]> = {
  draft: ['routed'],
  routed: ['quoted_estimated'],
  quoted_estimated: ['offers_out', 'lost'],
  offers_out: ['quoted_hard', 'lost'],
  quoted_hard: ['booked', 'lost'],
  booked: ['in_progress', 'cancelled'],
  in_progress: ['delivered', 'cancelled'],
  delivered: ['invoiced'],
  invoiced: ['closed'],
  closed: [],
  lost: [],
  cancelled: [],
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: TripState,
    public readonly to: TripState,
  ) {
    super(`Illegal trip transition: ${from} → ${to}`)
    this.name = 'IllegalTransitionError'
  }
}

export function canTransition(from: TripState, to: TripState): boolean {
  if (from === to) return false
  return (TRANSITIONS[from] ?? []).includes(to)
}

export type TransitionResult = {
  from: TripState
  to: TripState
  actor: string
  payload: Record<string, unknown>
  event: {
    kind: 'state_transition'
    actor: string
    payload: Record<string, unknown>
  }
}

/**
 * Validate and describe a transition. Does not write to a DB —
 * the Supabase RPC `trip_transition` is the atomic write path.
 */
export function transition(
  from: TripState,
  to: TripState,
  actor: string,
  payload: Record<string, unknown> = {},
): TransitionResult {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to)
  }
  return {
    from,
    to,
    actor,
    payload,
    event: {
      kind: 'state_transition',
      actor,
      payload: { ...payload, from, to },
    },
  }
}

export function assertTripState(value: string): asserts value is TripState {
  if (!(TRIP_STATES as readonly string[]).includes(value)) {
    throw new Error(`Invalid trip state: ${value}`)
  }
}
