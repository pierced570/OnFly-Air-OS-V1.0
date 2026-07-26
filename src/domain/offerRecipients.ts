/**
 * Operator trip-offer recipient status — UI labels (never "bid").
 * Pure TypeScript.
 */

export type OfferRecipientStatus =
  | 'awaiting'
  | 'yes'
  | 'no'
  | 'quote_submitted'
  | 'selected'
  | 'stood_down'
  | 'expired'

export type OfferStateLike =
  | 'pinged'
  | 'available'
  | 'unavailable'
  | 'quoted'
  | 'selected'
  | 'stood_down'
  | 'expired'
  | string

/** Map offer row state → dispatcher-facing status. */
export function offerRecipientStatus(state: OfferStateLike): OfferRecipientStatus {
  switch (state) {
    case 'available':
      return 'yes'
    case 'unavailable':
      return 'no'
    case 'quoted':
      return 'quote_submitted'
    case 'selected':
      return 'selected'
    case 'stood_down':
      return 'stood_down'
    case 'expired':
      return 'expired'
    case 'pinged':
    default:
      return 'awaiting'
  }
}

export function offerRecipientStatusLabel(
  status: OfferRecipientStatus,
): string {
  switch (status) {
    case 'awaiting':
      return 'Awaiting'
    case 'yes':
      return 'Yes'
    case 'no':
      return 'No'
    case 'quote_submitted':
      return 'Quote submitted'
    case 'selected':
      return 'Selected'
    case 'stood_down':
      return 'Stood down'
    case 'expired':
      return 'Expired'
  }
}

export function formatOfferQuoteSummary(o: {
  price_net?: number | null
  time_to_position_min?: number | null
  live_leg_min?: number | null
  fee_scope?: string | null
  tail?: string | null
}): string | null {
  if (o.price_net == null) return null
  const bits = [`NET $${Math.round(o.price_net)}`]
  if (o.time_to_position_min != null) bits.push(`TTP ${o.time_to_position_min}m`)
  if (o.live_leg_min != null) bits.push(`live ${o.live_leg_min}m`)
  if (o.fee_scope === 'aircraft_only') bits.push('aircraft only')
  else if (o.fee_scope === 'aircraft_and_fees') bits.push('fees included')
  if (o.tail && o.tail !== 'TBD') bits.push(o.tail)
  return bits.join(' · ')
}
