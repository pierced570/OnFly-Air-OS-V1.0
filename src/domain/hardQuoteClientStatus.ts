/**
 * Client response status for a hard quote sent from the desk.
 * Mirrors operator Yes/No labels on the Offers board.
 */

export type HardQuoteClientStatus = 'pending' | 'accepted' | 'declined'

export type HardQuoteClientStatusInput = {
  trip_state: string
  /** Explicit decision stamped on hard_quote when client acts. */
  client_decision?: 'accepted' | 'declined' | null
  declined_at?: string | null
  accepted_at?: string | null
}

export function hardQuoteClientStatus(
  input: HardQuoteClientStatusInput,
): HardQuoteClientStatus {
  if (
    input.client_decision === 'declined' ||
    input.declined_at ||
    input.trip_state === 'lost'
  ) {
    return 'declined'
  }
  if (
    input.client_decision === 'accepted' ||
    input.accepted_at ||
    ['booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(
      input.trip_state,
    )
  ) {
    return 'accepted'
  }
  return 'pending'
}

export function hardQuoteClientStatusLabel(
  status: HardQuoteClientStatus,
): string {
  switch (status) {
    case 'accepted':
      return 'Accepted (Yes)'
    case 'declined':
      return 'Declined (No)'
    case 'pending':
    default:
      return 'Pending update'
  }
}
