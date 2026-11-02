/**
 * Estimate / Book / Call — high-contrast ink titles (never gold-on-cream).
 * `stacked` = vertical full-width buttons (landing right column).
 */

import { Link } from 'react-router-dom'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'

export function PortalQuickActions(props?: {
  /** Compact height for in-app empty states. */
  compact?: boolean
  /** Vertical stack instead of 3-up grid. */
  stacked?: boolean
  className?: string
}) {
  const compact = Boolean(props?.compact)
  const stacked = Boolean(props?.stacked)
  const pad = compact ? 'px-4 py-3.5' : 'px-5 py-4'
  const title = 'text-base font-semibold'
  const body = 'mt-0.5 text-sm leading-snug'

  return (
    <div
      className={[
        stacked ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-3',
        props?.className ?? '',
      ].join(' ')}
    >
      <Link
        to="/quote"
        className={[
          pad,
          'flex min-h-14 flex-col justify-center rounded-2xl border border-ink/15 bg-[#FFFDFA] text-ink shadow-[0_8px_28px_rgba(12,12,14,0.06)] transition hover:border-ink/35',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={title}>Rough estimate</div>
            <p className={[body, 'text-muted'].join(' ')}>
              {compact || stacked
                ? 'One page · ballpark in seconds'
                : 'One fast page — airports in, ballpark out.'}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-ink">→</span>
        </div>
      </Link>

      <Link
        to="/book"
        className={[
          pad,
          'flex min-h-14 flex-col justify-center rounded-2xl bg-gold text-ink shadow-[0_12px_36px_rgba(201,162,39,0.32)] transition hover:bg-gold-lt',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={title}>Book a trip</div>
            <p className={[body, 'text-ink/75'].join(' ')}>
              {compact || stacked
                ? 'Full form · hard quote in 10–15 min'
                : 'Traditional form — dims, timing, contacts.'}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold">→</span>
        </div>
      </Link>

      <a
        href={`tel:${BRAND_PHONE_E164}`}
        className={[
          pad,
          'flex min-h-14 flex-col justify-center rounded-2xl bg-[#0C0C0E] text-cream transition hover:bg-[#1a1a1c]',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={title}>Call ops</div>
            <p className={[body, 'text-cream/65'].join(' ')}>
              {compact || stacked
                ? `24-hr desk · ${BRAND_PHONE}`
                : 'Dispatchers always on call — talk to a person.'}
            </p>
          </div>
          <span className="avionic shrink-0 text-sm font-semibold text-gold">
            →
          </span>
        </div>
      </a>
    </div>
  )
}
