/**
 * Mobile-first bottom tabs for the client portal app — glass chrome.
 */

import { Link, useLocation } from 'react-router-dom'
import {
  portalAppTabFromPath,
  portalAppTabPath,
  type PortalAppTab,
} from '@/domain/portalClientApp'

const TABS: Array<{ id: PortalAppTab; label: string; hint: string }> = [
  { id: 'home', label: 'Trips', hint: 'Live & booked' },
  { id: 'book', label: 'Book', hint: 'Estimate or book' },
  { id: 'history', label: 'History', hint: 'POs & invoices' },
  { id: 'account', label: 'Account', hint: 'Company & sign out' },
]

function TabIcon({ id, active }: { id: PortalAppTab; active: boolean }) {
  const stroke = active ? '#C9A227' : '#6B6560'
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (id === 'home') {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    )
  }
  if (id === 'book') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    )
  }
  if (id === 'history') {
    return (
      <svg {...common}>
        <path d="M8 7h11v13H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
        <path d="M10 7V5a2 2 0 0 1 2-2h5" />
        <path d="M11 12h5M11 16h3" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </svg>
  )
}

export function PortalAppNav() {
  const { pathname, search } = useLocation()
  const active = portalAppTabFromPath(pathname, search)

  return (
    <nav
      aria-label="Client app"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <ul className="portal-glass-strong mx-auto grid max-w-lg grid-cols-4 rounded-2xl">
        {TABS.map((tab) => {
          const isActive = active === tab.id
          return (
            <li key={tab.id}>
              <Link
                to={portalAppTabPath(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold uppercase tracking-[0.08em]',
                  isActive ? 'text-[#C9A227]' : 'text-[#6B6560]',
                ].join(' ')}
              >
                <TabIcon id={tab.id} active={isActive} />
                <span>{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Desktop / tablet secondary nav — glass pills. */
export function PortalAppDesktopNav() {
  const { pathname, search } = useLocation()
  const active = portalAppTabFromPath(pathname, search)
  return (
    <nav
      aria-label="Client app sections"
      className="portal-glass mb-6 hidden rounded-2xl px-2 py-2 md:block"
    >
      <ul className="flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const isActive = active === tab.id
          return (
            <li key={tab.id}>
              <Link
                to={portalAppTabPath(tab.id)}
                className={[
                  'inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold uppercase tracking-[0.12em]',
                  isActive
                    ? 'bg-gold/20 text-gold'
                    : 'text-muted hover:bg-white/40 hover:text-ink',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
