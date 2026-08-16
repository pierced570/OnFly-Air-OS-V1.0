/**
 * Read-only ledger of operator quotes on a trip.
 * After approve, callers pass only the winning row(s) — stood-down drop off.
 * Desk-only; never client-facing.
 */

import { OfferQuoteFactsBlock } from '@/components/OfferQuoteFactsBlock'
import type { SubmittedQuoteRow } from '@/domain/offerRecipients'

type Props = {
  rows: SubmittedQuoteRow[]
  /** Compact when nested under booking facts. */
  className?: string
}

export function SubmittedQuotesHistory({ rows, className }: Props) {
  if (!rows.length) return null
  const stoodDown = rows.filter((r) => r.status === 'stood_down').length
  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Submitted quotes
        </div>
        <div className="text-[11px] text-muted">
          {rows.length} total
          {stoodDown > 0
            ? ` · ${stoodDown} stood down`
            : ''}
        </div>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li
            key={r.offer_id}
            className={[
              'rounded-lg border px-3 py-2.5',
              r.status === 'selected'
                ? 'border-gold/45 bg-gold/5'
                : 'border-border/50 bg-ink/30',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div
                className={[
                  'font-semibold',
                  r.status === 'selected' ? 'text-gold' : 'text-cream',
                ].join(' ')}
              >
                {r.operator_name}
              </div>
              <span
                className={[
                  'text-[10px] font-semibold uppercase tracking-wide',
                  r.status === 'selected'
                    ? 'text-gold'
                    : r.status === 'stood_down'
                      ? 'text-muted'
                      : 'text-cream/70',
                ].join(' ')}
              >
                {r.status_label}
              </span>
            </div>
            <OfferQuoteFactsBlock facts={r.quote_facts} bare className="mt-1.5" />
          </li>
        ))}
      </ul>
    </div>
  )
}
