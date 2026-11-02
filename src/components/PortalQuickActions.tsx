/**
 * Estimate / Book / Call — frosted glass-gray tiles (Pinterest-style).
 * `stacked` = vertical full-width column for the landing right rail.
 */

import { Link } from 'react-router-dom'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'

const glassTile =
  'flex flex-col justify-center rounded-2xl border border-white/45 bg-white/40 text-ink shadow-[0_8px_32px_rgba(12,12,14,0.08)] backdrop-blur-xl transition hover:border-white/70 hover:bg-white/55'

export function PortalQuickActions(props?: {
  compact?: boolean
  stacked?: boolean
  className?: string
}) {
  const compact = Boolean(props?.compact)
  const stacked = Boolean(props?.stacked)
  // Stacked landing rail: taller tiles so they fill the glass outline.
  const pad = compact
    ? 'px-4 py-3.5 min-h-[4.25rem]'
    : stacked
      ? 'px-5 py-5 min-h-[4.85rem]'
      : 'px-5 py-4 min-h-[4.25rem]'
  const title = stacked
    ? 'text-[1.05rem] font-semibold tracking-tight'
    : 'text-base font-semibold tracking-tight'
  const body = 'mt-0.5 text-sm leading-snug text-ink/55'

  return (
    <div
      className={[
        stacked ? 'grid gap-2.5' : 'grid gap-3 sm:grid-cols-3',
        props?.className ?? '',
      ].join(' ')}
    >
      <Link to="/quote" className={[pad, glassTile].join(' ')}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={title}>Rough estimate</div>
            <p className={body}>
              {compact || stacked
                ? 'One page · ballpark in seconds'
                : 'One fast page — airports in, ballpark out.'}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-ink/45">→</span>
        </div>
      </Link>

      <Link to="/book" className={[pad, glassTile].join(' ')}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={title}>Book a trip</div>
            <p className={body}>
              {compact || stacked
                ? 'Full form · hard quote in 10–15 min'
                : 'Traditional form — dims, timing, contacts.'}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-ink/45">→</span>
        </div>
      </Link>

      <a href={`tel:${BRAND_PHONE_E164}`} className={[pad, glassTile].join(' ')}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={title}>Call ops</div>
            <p className={body}>
              {compact || stacked
                ? `24-hr desk · ${BRAND_PHONE}`
                : 'Dispatchers always on call — talk to a person.'}
            </p>
          </div>
          <span className="avionic shrink-0 text-sm font-semibold text-ink/45">
            →
          </span>
        </div>
      </a>
    </div>
  )
}
