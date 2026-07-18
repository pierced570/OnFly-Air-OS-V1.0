import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { listTrips, listTripsStable, subscribeTrips } from '@/lib/tripStore'
import { listRequests, subscribeRequests } from '@/lib/requestStore'
import {
  acknowledgeException,
  listExceptions,
  subscribeExceptions,
  syncExceptionsFromTrips,
} from '@/lib/exceptionStore'
import {
  endShift,
  getOnShift,
  startShift,
  subscribeShift,
} from '@/lib/shiftStore'
import { listPendingIntake, subscribeIntake } from '@/lib/intakeStore'
import { listOpenNeedsInfo, subscribeNeedsInfo } from '@/lib/needsInfoStore'

export default function BoardPage() {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTrips)
  const requests = useSyncExternalStore(subscribeRequests, listRequests, () => [])
  const exceptions = useSyncExternalStore(subscribeExceptions, listExceptions, () => [])
  const onShift = useSyncExternalStore(subscribeShift, getOnShift, () => null)
  const intake = useSyncExternalStore(subscribeIntake, listPendingIntake, () => [])
  const openTasks = useSyncExternalStore(subscribeNeedsInfo, listOpenNeedsInfo, () => [])

  const pendingRequests = requests.filter((r) => r.status === 'submitted')
  const [shiftName, setShiftName] = useState('')
  const [shiftPhone, setShiftPhone] = useState('+15555550100')

  useEffect(() => {
    syncExceptionsFromTrips(trips)
  }, [trips])

  return (
    <div className="flex min-h-full flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:p-8">
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
            <div className="mt-2 flex gap-3">
              {ex.trip_id && (
                <Link to={`/trips/${ex.trip_id}`} className="text-xs text-gold">
                  Open trip
                </Link>
              )}
              <button
                type="button"
                className="text-xs text-muted"
                onClick={() => acknowledgeException(ex.id)}
              >
                Acknowledge
              </button>
            </div>
          </div>
        ))}

        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-xs uppercase tracking-wider text-muted">On shift</div>
          {onShift ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-cream">{onShift.person_name}</p>
              <p className="avionic text-xs text-muted">{onShift.phone}</p>
              <button
                type="button"
                className="text-xs text-late"
                onClick={() => endShift()}
              >
                End shift
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="Dispatcher name"
                className="w-full rounded border border-border bg-ink px-2 py-1 text-sm text-cream placeholder:text-muted"
              />
              <input
                value={shiftPhone}
                onChange={(e) => setShiftPhone(e.target.value)}
                placeholder="Ring phone"
                className="avionic w-full rounded border border-border bg-ink px-2 py-1 text-sm text-cream"
              />
              <button
                type="button"
                className="text-xs text-gold"
                onClick={() => {
                  if (!shiftName.trim()) return
                  startShift(shiftName, shiftPhone)
                }}
              >
                Start shift
              </button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted">Queues</div>
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              <Link to="/intake" className="text-gold">
                Intake
              </Link>
              <span className="ml-2 avionic text-muted">{intake.length}</span>
            </li>
            <li>
              <Link to="/admin/tasks" className="text-gold">
                NEEDS-INFO
              </Link>
              <span className="ml-2 avionic text-muted">{openTasks.length}</span>
            </li>
            <li>
              <Link to="/portal" className="text-gold">
                Client portal
              </Link>
            </li>
          </ul>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-cream">Dispatch Board</h1>
            <p className="mt-1 text-sm text-muted">
              Incoming requests, intake review, active trips, exceptions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/quick-dispatch"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
            >
              Quick Dispatch
            </Link>
            <Link
              to="/intake"
              className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold/40"
            >
              Intake
            </Link>
            <Link
              to="/trips/new"
              className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold/40"
            >
              New trip
            </Link>
          </div>
        </header>

        {intake.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-late">
              Email / SMS intake ({intake.length})
            </h2>
            {intake.map((d) => (
              <Link
                key={d.id}
                to={`/intake/${d.id}`}
                className="block rounded-lg border border-late/40 bg-late/10 px-4 py-3 hover:border-late"
              >
                <div className="font-medium text-cream">
                  {d.channel.toUpperCase()} · {d.from}
                </div>
                <div className="text-xs text-muted">
                  {d.extracted
                    ? `${String(d.extracted.origin_text ?? '?')} → ${String(d.extracted.destination_text ?? '?')}`
                    : d.subject}
                </div>
              </Link>
            ))}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            Incoming requests
            {pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
          </h2>
          {pendingRequests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
              No portal requests yet. Clients submit at{' '}
              <Link to="/portal/request" className="text-gold hover:text-gold-lt">
                /portal/request
              </Link>
              , or simulate email under Intake.
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
              No active trips yet. Use Quick Dispatch for instant book+track, or New
              trip for the full quote path.
            </p>
          ) : (
            trips.map((t) => (
              <Link
                key={t.id}
                to={`/trips/${t.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-gold/40"
              >
                <div>
                  <div className="font-medium text-cream">
                    T-{t.ref} · {t.lane}
                    {t.quick?.po ? (
                      <span className="ml-2 text-xs text-muted">PO {t.quick.po}</span>
                    ) : null}
                  </div>
                  <div className="avionic text-xs text-muted">
                    {t.state}
                    {t.quick ? ' · quick dispatch' : ''}
                    {t.legs.length ? ` · ${t.legs.filter((l) => l.status === 'done').length}/${t.legs.length} legs` : ''}
                  </div>
                </div>
                <span className="text-xs text-gold">
                  {t.offers.length && !t.quick ? 'Offers / exec →' : 'Track →'}
                </span>
              </Link>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
