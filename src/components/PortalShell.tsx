/**
 * Client portal chrome — near-black header, cream body, gold accents.
 * Shared across shipments / track / documents / support.
 */

import { Link, useLocation } from 'react-router-dom'
import { BRAND_EMAIL, BRAND_LOGO_PATH, BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'

const NAV = [
  { id: 'shipments', label: 'Shipments', to: '/portal' },
  { id: 'documents', label: 'Documents', to: '/portal/documents' },
  { id: 'support', label: 'Support', to: '/portal/support' },
] as const

function activeNav(pathname: string): (typeof NAV)[number]['id'] {
  if (pathname.startsWith('/portal/documents')) return 'documents'
  if (pathname.startsWith('/portal/support')) return 'support'
  return 'shipments'
}

export function PortalShell(props: {
  children: React.ReactNode
  /** Optional right-side header actions (sign out, etc.). */
  headerActions?: React.ReactNode
  /** Constrain main width (default max-w-3xl). */
  wide?: boolean
}) {
  const loc = useLocation()
  const active = activeNav(loc.pathname)

  return (
    <div className="min-h-screen bg-[#F7F2E3] text-ink">
      <header className="border-b border-ink/20 bg-ink text-cream">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-6">
            <Link to="/portal" className="shrink-0">
              <img
                src={BRAND_LOGO_PATH}
                alt="OnFly Air"
                className="h-8 w-auto max-w-[160px] object-contain"
              />
            </Link>
            <nav className="flex flex-wrap items-center gap-1 sm:gap-4">
              {NAV.map((item) => {
                const on = active === item.id
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={[
                      'px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                      on
                        ? 'border-b-2 border-gold text-cream'
                        : 'text-cream/70 hover:text-cream',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a
              href={`tel:${BRAND_PHONE_E164}`}
              className="hidden text-cream/80 sm:inline"
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
        ].join(' ')}
      >
        {props.children}
      </main>

      <footer className="border-t border-border/60 px-4 py-6 text-center text-xs text-ink/70">
        <a href="https://onflyair.com" className="hover:text-ink">
          onflyair.com
        </a>
        <span className="mx-2">·</span>
        <a href={`tel:${BRAND_PHONE_E164}`} className="text-gold hover:text-gold-lt">
          {BRAND_PHONE}
        </a>
        <span className="mx-2">·</span>
        <a href={`mailto:${BRAND_EMAIL}`} className="hover:text-ink">
          {BRAND_EMAIL}
        </a>
      </footer>
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
