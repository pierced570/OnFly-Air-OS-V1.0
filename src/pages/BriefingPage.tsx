import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listTrips } from '@/lib/tripStore'

export default function BriefingPage() {
  const trips = listTrips()
  const active = trips.filter((t) =>
    ['offers_out', 'quoted_hard', 'booked', 'in_progress'].includes(t.state),
  )
  const pendingQuotes = trips.filter((t) =>
    ['quoted_estimated', 'offers_out'].includes(t.state),
  )
  const [notes, setNotes] = useState('')

  return (
    <div className="flex flex-col gap-6 p-8">
      <header>
        <div className="text-xs uppercase tracking-[0.2em] text-gold">Shift ops</div>
        <h1 className="mt-1 text-2xl font-semibold text-cream">Shift briefing</h1>
        <p className="mt-1 text-sm text-muted">
          Cold-load for the on-shift dispatcher — handoff is a login + this page.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Active trips</h2>
          {active.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None yet</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {active.map((t) => (
                <li key={t.id}>
                  <Link
                    className="text-sm text-cream hover:text-gold"
                    to={`/trips/${t.id}/offers`}
                  >
                    T-{t.ref} · {t.lane}{' '}
                    <span className="avionic text-muted">{t.state}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Pending offers / quotes
          </h2>
          <p className="mt-2 avionic text-cream">{pendingQuotes.length}</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {pendingQuotes.map((t) => (
              <li key={t.id}>
                T-{t.ref} · {t.state}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">WX / NOTAMs</h2>
          <p className="mt-2 text-sm text-muted">
            Live weather and NOTAMs will land here when the WX adapter is wired.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Network</h2>
          <p className="mt-2 text-sm text-muted">
            Operator response stats fill in as you run trips.
          </p>
          <Link to="/radar" className="mt-3 inline-block text-xs text-gold">
            Open Fleet Radar →
          </Link>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Handoff notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for the next dispatcher…"
          className="mt-2 w-full rounded border border-border bg-ink px-3 py-2 text-sm text-cream placeholder:text-muted"
          rows={3}
        />
      </section>
    </div>
  )
}
