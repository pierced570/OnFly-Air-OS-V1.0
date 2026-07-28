/**
 * Compact structured operator quote / ETA / price block for desk cards.
 * Prefer this over a single dense mono line.
 */

import { formatMinutes } from '@/domain/offerQuotePreview'
import type { OfferQuoteFacts } from '@/domain/offerRecipients'

type Props = {
  facts: OfferQuoteFacts
  /** Optional client total already computed for this option. */
  clientTotal?: number | null
  fetExempt?: boolean
  className?: string
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 text-sm leading-snug">
      <div className="text-muted">{label}</div>
      <div className={mono ? 'avionic text-cream' : 'text-cream'}>{value}</div>
    </div>
  )
}

export function OfferQuoteFactsBlock({
  facts,
  clientTotal,
  fetExempt,
  className,
}: Props) {
  return (
    <div
      className={[
        'space-y-1 border-t border-border/40 pt-2',
        className ?? '',
      ].join(' ')}
    >
      {facts.type_name ? (
        <Row label="Aircraft" value={facts.type_name} />
      ) : null}
      {facts.tail ? <Row label="Tail" value={facts.tail} mono /> : null}
      <Row label="NET" value={`$${Math.round(facts.price_net)}`} mono />
      {facts.time_to_position_min != null ? (
        <Row label="TTP" value={formatMinutes(facts.time_to_position_min)} mono />
      ) : null}
      {facts.quick_turn_min != null ? (
        <Row label="Turn" value={formatMinutes(facts.quick_turn_min)} mono />
      ) : null}
      {facts.live_leg_min != null ? (
        <Row label="Live leg" value={formatMinutes(facts.live_leg_min)} mono />
      ) : null}
      {facts.fee_label ? <Row label="Fees" value={facts.fee_label} /> : null}
      {clientTotal != null ? (
        <Row
          label="Client"
          value={`$${Math.round(clientTotal)}${fetExempt ? ' · FET exempt' : ''}`}
          mono
        />
      ) : null}
    </div>
  )
}
