/**
 * Client portal chrome — cream body, mobile-first app shell.
 * Desk DispatchShell is never used here — separate login surface.
 */

import { Link } from 'react-router-dom'
import {
  BRAND_EMAIL,
  BRAND_LOGO_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
} from '@/domain/brand'
import {
  PortalAppDesktopNav,
  PortalAppNav,
} from '@/components/PortalAppNav'

export function PortalShell(props: {
  children: React.ReactNode
  /** Optional right-side header actions (sign out, etc.). */
  headerActions?: React.ReactNode
  /** Constrain main width (default max-w-3xl). */
  wide?: boolean
  /**
   * Show bottom tabs (mobile) + section nav (desktop).
   * Use on signed-in client app pages — not on the dark landing gate.
   */
  appNav?: boolean
}) {
  const showNav = Boolean(props.appNav)
  return (
    <div className="min-h-screen bg-[#F7F2E3] text-ink" data-theme="client">
      <header className="sticky top-0 z-30 border-b border-ink/20 bg-ink pt-[max(0.75rem,env(safe-area-inset-top))] text-cream">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/portal" className="shrink-0">
            <img
              src={BRAND_LOGO_PATH}
              alt="OnFly Air"
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a
              href={`tel:${BRAND_PHONE_E164}`}
              className="inline-flex min-h-11 items-center text-cream/80"
            >
              24-HR OPS{' '}
              <span className="font-semibold text-gold">{BRAND_PHONE}</span>
            </a>
            {props.headerActions}
          </div>
        </div>
      </header>

      <main
        className={[
          'mx-auto px-4 py-6 sm:px-6 sm:py-8',
          props.wide ? 'max-w-5xl' : 'max-w-3xl',
          showNav ? 'pb-28 md:pb-8' : '',
        ].join(' ')}
      >
        {showNav ? <PortalAppDesktopNav /> : null}
        {props.children}
      </main>

      {showNav ? <PortalAppNav /> : null}

      {!showNav ? (
        <footer className="safe-bottom border-t border-border/60 px-4 py-6 text-center text-xs text-ink/70">
          <a href="https://onflyair.com" className="hover:text-ink">
            onflyair.com
          </a>
          <span className="mx-2">·</span>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="text-gold hover:text-gold-lt"
          >
            {BRAND_PHONE}
          </a>
          <span className="mx-2">·</span>
          <a href={`mailto:${BRAND_EMAIL}`} className="hover:text-ink">
            {BRAND_EMAIL}
          </a>
        </footer>
      ) : (
        <footer className="hidden border-t border-border/60 px-4 py-6 text-center text-xs text-ink/70 md:block">
          <a href="https://onflyair.com" className="hover:text-ink">
            onflyair.com
          </a>
          <span className="mx-2">·</span>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="text-gold hover:text-gold-lt"
          >
            {BRAND_PHONE}
          </a>
          <span className="mx-2">·</span>
          <a href={`mailto:${BRAND_EMAIL}`} className="hover:text-ink">
            {BRAND_EMAIL}
          </a>
        </footer>
      )}
    </div>
  )
}

export function PortalDeltaPill(props: {
  deltaMin: number | null | undefined
  live?: boolean
}) {
  if (props.live) {
    return (
      <span className="inline-block rounded border border-gold/60 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
        Live
      </span>
    )
  }
  const d = props.deltaMin
  if (d == null || !Number.isFinite(d)) return null
  const rounded = Math.round(d)
  if (rounded === 0) {
    return (
      <span className="inline-block rounded border border-[#2E7D32]/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#2E7D32]">
        On plan
      </span>
    )
  }
  if (rounded > 0) {
    return (
      <span className="inline-block rounded border border-[#C0392B]/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#C0392B]">
        +{rounded} MIN
      </span>
    )
  }
  return (
    <span className="inline-block rounded border border-[#2E7D32]/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#2E7D32]">
      {rounded} MIN
    </span>
  )
}
