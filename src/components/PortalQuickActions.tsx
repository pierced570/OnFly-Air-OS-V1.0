/**
 * Even Estimate / Book / Call strip — shared across landing, guest continue,
 * empty dashboard, and account so the portal rhythm stays consistent.
 */

import { Link } from 'react-router-dom'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'

export function PortalQuickActions(props?: {
  /** Compact height for in-app empty states. */
  compact?: boolean
  className?: string
}) {
  const compact = Boolean(props?.compact)
  const tile = compact
    ? 'flex min-h-[4.5rem] flex-col justify-between rounded-2xl px-4 py-3'
    : 'flex min-h-[7rem] flex-col justify-between rounded-2xl px-5 py-5'

  return (
    <div
      className={['grid gap-3 sm:grid-cols-3', props?.className ?? ''].join(
        ' ',
      )}
    >
      <Link
        to="/quote"
        className={[
          tile,
          'portal-glass text-ink transition hover:border-gold/55',
        ].join(' ')}
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
            Rough estimate
          </div>
          <div className={compact ? 'mt-1 text-sm font-semibold' : 'mt-2 text-lg font-semibold'}>
            One fast page
          </div>
          {!compact ? (
            <p className="mt-1 text-sm text-muted">
              Airports in, ballpark out — then call or book.
            </p>
          ) : null}
        </div>
        <span className="mt-2 text-sm font-semibold text-gold">
          Get estimate →
        </span>
      </Link>

      <Link
        to="/book"
        className={[
          tile,
          'bg-gold text-ink shadow-[0_12px_40px_rgba(201,162,39,0.35)] transition hover:bg-gold-lt',
        ].join(' ')}
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/70">
            Book a trip
          </div>
          <div className={compact ? 'mt-1 text-sm font-semibold' : 'mt-2 text-lg font-semibold'}>
            Traditional form
          </div>
          {!compact ? (
            <p className="mt-1 text-sm text-ink/75">
              Dims, timing, contacts — hard quote in 10–15 min.
            </p>
          ) : null}
        </div>
        <span className="mt-2 text-sm font-semibold">Start booking →</span>
      </Link>

      <a
        href={`tel:${BRAND_PHONE_E164}`}
        className={[
          tile,
          'portal-glass-ink text-cream transition hover:border-gold/40',
        ].join(' ')}
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
            Call ops
          </div>
          <div
            className={[
              compact ? 'mt-1 text-sm font-semibold' : 'mt-2 text-lg font-semibold',
              'text-cream',
            ].join(' ')}
          >
            Talk to a person
          </div>
          {!compact ? (
            <p className="mt-1 text-sm text-cream/55">
              Dispatchers always on call.
            </p>
          ) : null}
        </div>
        <span className="avionic mt-2 text-sm font-semibold text-gold">
          {BRAND_PHONE} →
        </span>
      </a>
    </div>
  )
}
