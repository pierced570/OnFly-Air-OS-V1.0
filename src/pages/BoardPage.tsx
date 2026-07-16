import { useState } from 'react'
import { Link } from 'react-router-dom'
import { parseThreadActual } from '@/domain/threadParse'
import { listTrips } from '@/lib/tripStore'

type ExceptionCard = {
  id: string
  title: string
  detail: string
  severity: 'late' | 'attn'
}

export default function BoardPage() {
  const trips = listTrips()
  const [exceptions, setExceptions] = useState<ExceptionCard[]>([
    {
      id: 'ex1',
      title: 'Demo slip watch',
      detail: 'Manufactured 30-min slip on air leg — ack when reviewed',
      severity: 'late',
    },
  ])
  const [threadIn, setThreadIn] = useState('wheels up')
  const [parseOut, setParseOut] = useState(() => parseThreadActual('wheels up'))
  const [onShift, setOnShift] = useState('Pierce')

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
            className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 text-sm text-cream"
          />
          <p className="mt-2 text-xs text-muted">
            Briefing: {trips.length} session trips · route-to-role = {onShift}
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-cream">Dispatch Board</h1>
            <p className="mt-1 text-sm text-muted">Chunk 4 — exceptions first, trips self-track</p>
          </div>
          <Link
            to="/trips/new"
            className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
          >
            New trip
          </Link>
        </header>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Thread parse simulator</h2>
          <div className="mt-2 flex gap-2">
            <input
              value={threadIn}
              onChange={(e) => {
                setThreadIn(e.target.value)
                setParseOut(parseThreadActual(e.target.value))
              }}
              className="flex-1 rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
            />
          </div>
          <pre className="mt-2 overflow-auto rounded bg-ink/50 p-2 text-xs text-gold">
            {JSON.stringify(parseOut, null, 2)}
          </pre>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted">Active / session trips</h2>
          {trips.length === 0 && (
            <p className="text-sm text-muted">
              No session trips yet — run intake → quote → offers to populate.
            </p>
          )}
          {trips.map((t) => (
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
          ))}
        </section>
      </div>
    </div>
  )
}
