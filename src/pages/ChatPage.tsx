/**
 * Chat workspace — pick a trip, join its ops thread, message crew / ground / FBO.
 * Same trip_events + thread spine as TripPage (not a parallel inbox).
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ParticipantsPanel } from '@/components/ParticipantsPanel'
import { TripThreadPanel } from '@/components/TripThreadPanel'
import {
  ensureTripThread,
  getTrip,
  listChatTrips,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'

function lastActivity(t: TripStoreRow): string {
  return (
    t.thread.at(-1)?.at ??
    t.events.at(-1)?.at ??
    t.hard_quote?.disclosure_at ??
    ''
  )
}

function threadStatus(t: TripStoreRow): 'live' | 'closed' | 'none' {
  if (t.thread_disbanded_at) return 'closed'
  if (t.thread_number) return 'live'
  return 'none'
}

export default function ChatPage() {
  const { tripId: paramId } = useParams()
  const nav = useNavigate()
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const chatTrips = useMemo(() => listChatTrips(), [trips])
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const selectedId = paramId ?? chatTrips[0]?.id ?? null
  const selected = selectedId ? getTrip(selectedId) : null

  useEffect(() => {
    if (paramId) return
    if (chatTrips[0]?.id) {
      nav(`/chat/${chatTrips[0].id}`, { replace: true })
    }
  }, [paramId, chatTrips, nav])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return chatTrips
    return chatTrips.filter((t) =>
      [
        t.ref,
        t.lane,
        t.state,
        t.thread_number,
        t.payload_summary,
        ...t.participants.map((p) => p.name),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [chatTrips, q])

  async function joinThread(trip: TripStoreRow) {
    setBusyId(trip.id)
    setStatus(null)
    try {
      const n = await ensureTripThread(trip.id)
      setStatus(
        n
          ? `Joined thread ${n}`
          : 'No free thread number — check Admin pool / seed DIDs',
      )
      nav(`/chat/${trip.id}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:gap-6 lg:p-8">
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        <header>
          <h1 className="text-2xl font-semibold text-cream">Chat</h1>
          <p className="mt-1 text-sm text-muted">
            Trip ops threads — select a trip to join crew, ground, and FBO
            messages.
          </p>
        </header>

        <label className="block text-xs text-muted">
          Search trips
          <input
            className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="T-ref, lane, pilot…"
          />
        </label>

        {status && <p className="text-xs text-gold">{status}</p>}

        <ul className="max-h-[min(70vh,32rem)] space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-1">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              No trips to chat on yet — book a trip or open a thread from the
              trip page.
            </li>
          )}
          {filtered.map((t) => {
            const st = threadStatus(t)
            const active = t.id === selectedId
            const last = t.thread.at(-1)
            const onThread = t.participants.filter(
              (p) => p.in_thread && !p.released_at,
            ).length
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => nav(`/chat/${t.id}`)}
                  className={[
                    'w-full rounded-md px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'bg-gold/15 ring-1 ring-gold/40'
                      : 'hover:bg-ink/50',
                  ].join(' ')}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="avionic text-sm text-cream">
                      T-{t.ref}
                    </span>
                    <span
                      className={[
                        'text-[10px] uppercase tracking-wider',
                        st === 'live'
                          ? 'text-onplan'
                          : st === 'closed'
                            ? 'text-muted'
                            : 'text-gold',
                      ].join(' ')}
                    >
                      {st === 'live'
                        ? 'live'
                        : st === 'closed'
                          ? 'closed'
                          : 'join'}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {t.lane}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted">
                    <span className="avionic text-gold/80">{t.state}</span>
                    {t.thread_number && (
                      <span className="avionic">{t.thread_number}</span>
                    )}
                    <span>{onThread} on thread</span>
                  </div>
                  {last && (
                    <p className="mt-1 truncate text-[11px] text-cream/70">
                      <span className="text-muted">{last.from}:</span>{' '}
                      {last.body}
                    </p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <main className="min-w-0 flex-1 space-y-4">
        {!selected ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
            Select a trip on the left to open its ops chat.
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-gold">
                  Ops thread
                </div>
                <h2 className="mt-1 text-xl font-semibold text-cream">
                  T-<span className="avionic">{selected.ref}</span> ·{' '}
                  {selected.lane}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  <span className="avionic text-gold">{selected.state}</span>
                  {selected.payload_summary
                    ? ` · ${selected.payload_summary}`
                    : ''}
                  {lastActivity(selected)
                    ? ` · last ${new Date(lastActivity(selected)).toISOString().slice(11, 16)}Z`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {threadStatus(selected) !== 'live' &&
                  !selected.thread_disbanded_at && (
                    <button
                      type="button"
                      className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
                      disabled={busyId === selected.id}
                      onClick={() => void joinThread(selected)}
                    >
                      {busyId === selected.id ? 'Opening…' : 'Join / open thread'}
                    </button>
                  )}
                <Link
                  to={`/trips/${selected.id}`}
                  className="rounded-md border border-border px-3 py-2 text-sm text-cream hover:border-gold"
                >
                  Open trip →
                </Link>
              </div>
            </header>

            <TripThreadPanel trip={selected} tall title="Messages" />
            <ParticipantsPanel trip={selected} />
          </>
        )}
      </main>
    </div>
  )
}
