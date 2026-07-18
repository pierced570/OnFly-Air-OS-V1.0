import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Board', end: true },
  { to: '/quick-dispatch', label: 'Quick Dispatch' },
  { to: '/intake', label: 'Intake' },
  { to: '/financials', label: 'Financials' },
  { to: '/clients', label: 'Clients' },
  { to: '/fbos', label: 'FBOs' },
  { to: '/trips/new', label: 'New trip' },
  { to: '/network', label: 'Network' },
  { to: '/radar', label: 'Radar' },
  { to: '/briefing', label: 'Briefing' },
  { to: '/admin', label: 'Admin' },
  { to: '/admin/tasks', label: 'Tasks' },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'rounded-md px-3 py-2.5 text-sm transition-colors',
              isActive
                ? 'bg-surface-2 text-gold'
                : 'text-muted hover:bg-surface-2 hover:text-cream',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </>
  )
}

export function DispatchShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [loc.pathname])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <div
      className="flex h-full min-h-screen flex-col bg-ink text-cream md:flex-row"
      data-theme="dispatcher"
    >
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-cream"
        >
          <span className="sr-only">Menu</span>
          <span aria-hidden className="flex flex-col gap-1.5">
            <span
              className={[
                'block h-0.5 w-5 bg-cream transition-transform',
                open ? 'translate-y-2 rotate-45' : '',
              ].join(' ')}
            />
            <span
              className={[
                'block h-0.5 w-5 bg-cream transition-opacity',
                open ? 'opacity-0' : '',
              ].join(' ')}
            />
            <span
              className={[
                'block h-0.5 w-5 bg-cream transition-transform',
                open ? '-translate-y-2 -rotate-45' : '',
              ].join(' ')}
            />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold">
            OnFly
          </div>
          <div className="truncate text-sm font-semibold text-cream">
            Dispatch OS
          </div>
        </div>
        <Link to="/portal" className="shrink-0 text-xs text-gold">
          Portal
        </Link>
      </header>

      {/* Backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-ink/70 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, static on md+ */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-border bg-surface transition-transform duration-200 md:static md:z-0 md:w-56 md:translate-x-0 md:shrink-0',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        <div className="hidden border-b border-border px-5 py-5 md:block">
          <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly</div>
          <div className="mt-1 text-lg font-semibold text-cream">Dispatch OS</div>
        </div>
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <div className="text-sm font-semibold text-cream">Menu</div>
          <button
            type="button"
            className="text-xs text-muted"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
        <div className="space-y-2 border-t border-border px-4 py-3">
          <Link
            to="/portal"
            onClick={() => setOpen(false)}
            className="block text-xs text-gold hover:text-gold-lt"
          >
            Client portal →
          </Link>
          <p className="text-[11px] text-muted">Share /portal with clients</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-auto">{children}</main>
    </div>
  )
}
