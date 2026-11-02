/**
 * Even Estimate / Book / Call strip — high-contrast ink titles (never gold-on-cream).
 */

import { Link } from 'react-router-dom'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'

export function PortalQuickActions(props?: {
  /** Compact height for in-app empty states. */
  compact?: boolean
  className?: string
}) {
  const compact = Boolean(props?.compact)
  const pad = compact ? 'px-4 py-4' : 'px-5 py-5'
  const title = compact ? 'text-base font-semibold' : 'text-lg font-semibold'
  const body = 'mt-1 text-sm leading-snug'

  return (
    <div
      className={[
        'grid gap-3 sm:grid-cols-3',
        props?.className ?? '',
      ].join(' ')}
    >
      <Link
        to="/quote"
        className={[
          pad,
          'flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-ink/15 bg-[#FFFDFA] text-ink shadow-[0_8px_28px_rgba(12,12,14,0.06)] transition hover:border-ink/35',
        ].join(' ')}
      >
        <div>
          <div className={title}>Rough estimate</div>
          <p className={[body, 'text-muted'].join(' ')}>
            {compact
              ? 'One page · ballpark in seconds'
              : 'One fast page — airports in, ballpark out.'}
          </p>
        </div>
        <span className="mt-3 text-sm font-semibold text-ink">
          Get estimate →
        </span>
      </Link>

      <Link
        to="/book"
        className={[
          pad,
          'flex min-h-[5.5rem] flex-col justify-between rounded-2xl bg-gold text-ink shadow-[0_12px_36px_rgba(201,162,39,0.32)] transition hover:bg-gold-lt',
        ].join(' ')}
      >
        <div>
          <div className={title}>Book a trip</div>
          <p className={[body, 'text-ink/75'].join(' ')}>
            {compact
              ? 'Full form · hard quote in 10–15 min'
              : 'Traditional form — dims, timing, contacts.'}
          </p>
        </div>
        <span className="mt-3 text-sm font-semibold">Start booking →</span>
      </Link>

      <a
        href={`tel:${BRAND_PHONE_E164}`}
        className={[
          pad,
          'flex min-h-[5.5rem] flex-col justify-between rounded-2xl bg-[#0C0C0E] text-cream transition hover:bg-[#1a1a1c]',
        ].join(' ')}
      >
        <div>
          <div className={title}>Call ops</div>
          <p className={[body, 'text-cream/65'].join(' ')}>
            {compact
              ? `24-hr desk · ${BRAND_PHONE}`
              : 'Dispatchers always on call — talk to a person.'}
          </p>
        </div>
        <span className="avionic mt-3 text-sm font-semibold text-gold">
          {BRAND_PHONE} →
        </span>
      </a>
    </div>
  )
}
