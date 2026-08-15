/**
 * Operator-facing read-only view of a quote they already submitted.
 * Pure TypeScript — never says "bid".
 */

import { formatMinutes } from '@/domain/offerQuotePreview'
import { offerQuoteFacts } from '@/domain/offerRecipients'

export type OperatorSubmittedQuoteSnapshot = {
  headline: string
  blurb: string
  type_name: string | null
  tail: string | null
  price_net: number
  price_label: string
  time_to_position_min: number | null
  quick_turn_min: number | null
  live_leg_min: number | null
  ttp_label: string | null
  turn_label: string | null
  live_label: string | null
  fee_label: string | null
  notes: string | null
}

type OfferLike = {
  state: string
  price_net?: number | null
  time_to_position_min?: number | null
  quick_turn_min?: number | null
  live_leg_min?: number | null
  fee_scope?: string | null
  type_name?: string | null
  tail?: string | null
  notes?: string | null
}

/**
 * Build a snapshot when the offer has a submitted NET. Returns null when
 * there is nothing to show (e.g. declined without quoting).
 */
export function operatorSubmittedQuoteSnapshot(
  offer: OfferLike,
): OperatorSubmittedQuoteSnapshot | null {
  const facts = offerQuoteFacts(offer)
  if (!facts) return null

  const { headline, blurb } = copyForState(offer.state)
  return {
    headline,
    blurb,
    type_name: facts.type_name,
    tail: facts.tail,
    price_net: facts.price_net,
    price_label: `$${Math.round(facts.price_net).toLocaleString('en-US')} NET`,
    time_to_position_min: facts.time_to_position_min,
    quick_turn_min: facts.quick_turn_min,
    live_leg_min: facts.live_leg_min,
    ttp_label:
      facts.time_to_position_min != null
        ? formatMinutes(facts.time_to_position_min)
        : null,
    turn_label:
      facts.quick_turn_min != null ? formatMinutes(facts.quick_turn_min) : null,
    live_label:
      facts.live_leg_min != null ? formatMinutes(facts.live_leg_min) : null,
    fee_label: facts.fee_label,
    notes: offer.notes?.trim() || null,
  }
}

function copyForState(state: string): { headline: string; blurb: string } {
  switch (state) {
    case 'selected':
      return {
        headline: "You're on this trip",
        blurb:
          'Dispatch has this trip with your operation. Below is the quote you submitted. Contact OnFly if anything changes.',
      }
    case 'stood_down':
      return {
        headline: 'Your submitted quote',
        blurb:
          'This trip is covered by another carrier this time. Your quote is below for your records — thanks for the fast turnaround.',
      }
    case 'quoted':
    default:
      return {
        headline: 'Your submitted quote',
        blurb:
          'Dispatch has your quote. This link stays open for review only — it cannot be re-submitted. Contact OnFly dispatch if you need to change it.',
      }
  }
}
