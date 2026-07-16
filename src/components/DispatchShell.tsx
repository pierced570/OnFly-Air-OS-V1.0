import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const nav = [
  { to: '/', label: 'Board', end: true },
  { to: '/trips/new', label: 'New trip' },
  { to: '/network', label: 'Network' },
  { to: '/admin', label: 'Admin' },
]

export function DispatchShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-screen bg-ink text-cream" data-theme="dispatcher">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-5 py-5">
          <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly</div>
          <div className="mt-1 text-lg font-semibold text-cream">Dispatch OS</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-surface-2 text-gold'
                    : 'text-muted hover:bg-surface-2 hover:text-cream',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border px-4 py-3 text-xs text-muted">
          Chunk 1 · Foundation
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">{children}</main>
    </div>
  )
}
