import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { listTrips } from '@/lib/tripStore'
import { listRequests, subscribeRequests } from '@/lib/requestStore'

type ExceptionCard = {
  id: string
  title: string
  detail: string
  severity: 'late' | 'attn'
}

export default function BoardPage() {
  const trips = listTrips()
  const requests = useSyncExternalStore(subscribeRequests, listRequests, () => [])
  const pendingRequests = requests.filter((r) => r.status === 'submitted')
  const [exceptions, setExceptions] = useState<ExceptionCard[]>([])
  const [onShift, setOnShift] = useState('')

  return (
    <div className="flex min-h-full flex-col gap-6 p-8 lg:flex-row">
      <aside className="w-full shrink-0 space-y-3 lg:w-80">
        <h2 className="text-xs uppercase tracking-wider text-gold">Exception queue</h2>
        {exceptions.length === 0 && (
          <p className="text-sm text-muted">Quiet — no exceptions</p>
        )}
        {exceptions.map((ex) => (
          <div
            key={ex.id}
            className={[
              'rounded-lg border p-3',
              ex.severity === 'late' ? 'border-late/50 bg-late/10' : 'border-gold/40 bg-gold/10',
            ].join(' ')}
          >
            <div className="text-sm font-medium text-cream">{ex.title}</div>
            <p className="mt-1 text-xs text-muted">{ex.detail}</p>
            <button
              type="button"
              className="mt-2 text-xs text-gold"
              onClick={() => setExceptions((xs) => xs.filter((x) => x.id !== ex.id))}
            >
              Acknowledge
            </button>
          </div>
        ))}

        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-xs uppercase tracking-wider text-muted">On shift</div>
          <input
            value={onShift}
            onChange={(e) => setOnShift(e.target.value)}
            placeholder="Dispatcher name"
            className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 text-sm text-cream placeholder:text-muted"
          />
        </div>

        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted">Client portal</div>
          <p className="mt-2 text-xs text-muted">
            Share this link with clients so they can submit trip requests. New
            requests show under Incoming below.
          </p>
          <Link
            to="/portal"
            className="mt-3 inline-flex rounded-md border border-gold/40 px-3 py-1.5 text-xs text-gold hover:bg-gold/10"
          >
            Open client portal →
          </Link>
          <p className="mt-2 avionic text-[11px] text-muted">/portal</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-cream">Dispatch Board</h1>
            <p className="mt-1 text-sm text-muted">
              Home base: incoming portal requests, active trips, and exceptions.
            </p>
          </div>
          <Link
            to="/trips/new"
            className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
          >
            New trip
          </Link>
        </header>

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            Incoming requests
            {pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
          </h2>
          {pendingRequests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
              No requests yet. Clients submit at{' '}
              <Link to="/portal/request" className="text-gold hover:text-gold-lt">
                /portal/request
              </Link>
              , or you create one under New trip.
            </p>
          ) : (
            pendingRequests.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-cream">
                      R-{r.ref} · {r.lane}
                    </div>
                    <div className="text-xs text-muted">
                      {r.source === 'portal' ? 'Portal' : 'Dispatch'} · {r.summary}
                      {r.email ? ` · ${r.email}` : ''}
                    </div>
                  </div>
                  <Link to="/trips/new" className="text-xs text-gold hover:text-gold-lt">
                    Open intake →
                  </Link>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted">Active trips</h2>
          {trips.length === 0 ? (
            <p className="text-sm text-muted">
              No active trips in this session. After you quote and send offers, they
              appear here.
            </p>
          ) : (
            trips.map((t) => (
              <Link
                key={t.id}
                to={`/trips/${t.id}/offers`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-gold/40"
              >
                <div>
                  <div className="font-medium text-cream">
                    T-{t.ref} · {t.lane}
                  </div>
                  <div className="avionic text-xs text-muted">{t.state}</div>
                </div>
                <span className="text-xs text-gold">Offers →</span>
              </Link>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
