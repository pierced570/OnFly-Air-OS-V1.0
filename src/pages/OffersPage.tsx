import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'
import {
  sendAvailabilityPings,
  simulateOperatorReply,
  selectOfferAndHardQuote,
  acceptHardQuote,
  simulatorMessagesForTrip,
} from '@/lib/offerFlow'
import { FlightChip } from '@/components/FlightChip'

function useTrip(id: string | undefined): TripStoreRow | null {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  return id ? trips.find((t) => t.id === id) ?? getTrip(id) : null
}

export default function OffersPage() {
  const { id } = useParams()
  const trip = useTrip(id)
  const [msgs, setMsgs] = useState(simulatorMessagesForTrip(id ?? ''))
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    if (!id) return
    setMsgs(simulatorMessagesForTrip(id))
  }

  useEffect(() => {
    refresh()
  }, [id, trip?.offers.length, trip?.state])

  if (!trip) {
    return (
      <div className="p-8 text-muted">
        Trip not found in session store. Generate a quote first, then open offers.
        <div className="mt-2">
          <Link className="text-gold" to="/trips/new">
            New trip
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Offers</div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            T-<span className="avionic">{trip.ref}</span> · {trip.lane}
          </h1>
          <p className="mt-1 text-sm text-muted">
            State <span className="avionic text-gold">{trip.state}</span> · {trip.payload_summary}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
          onClick={() =>
            void sendAvailabilityPings(trip.id).then(refresh).catch((e) => setError(String(e)))
          }
        >
          Send availability pings
        </button>
      </header>

      {error && <p className="text-sm text-late">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">Compare</h2>
          {trip.offers.map((o) => (
            <article key={o.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-cream">{o.operator_name}</div>
                  <div className="avionic text-sm text-muted">
                    {o.tail} · {o.type_name}
                  </div>
                  <div className="mt-1 text-xs text-gold avionic">{o.state}</div>
                </div>
                <div className="text-right text-sm">
                  {o.price_net != null && (
                    <div className="avionic text-cream">NET ${o.price_net}</div>
                  )}
                  {o.time_to_position_min != null && (
                    <div className="text-xs text-muted">TTP {o.time_to_position_min}m</div>
                  )}
                </div>
              </div>
              {o.bookingGated && (
                <div className="mt-2 text-xs text-late">Booking gated — insurance/compliance</div>
              )}
              <div className="mt-2">
                <FlightChip
                  phase={
                    trip.candidates.find((c) => c.aircraft_id === o.aircraft_id)?.phase
                  }
                  inPosition={
                    trip.candidates.find((c) => c.aircraft_id === o.aircraft_id)?.inPosition
                  }
                  laddBlocked={
                    trip.candidates.find((c) => c.aircraft_id === o.aircraft_id)?.laddBlocked
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={replyDraft[o.id] ?? ''}
                  onChange={(e) => setReplyDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                  placeholder="Simulate reply: 1 or 2"
                  className="flex-1 rounded border border-border bg-ink px-2 py-1 text-sm text-cream"
                />
                <button
                  type="button"
                  className="rounded border border-gold/40 px-2 py-1 text-xs text-gold"
                  onClick={() =>
                    void simulateOperatorReply(trip.id, o.id, replyDraft[o.id] ?? '1').then(refresh)
                  }
                >
                  Reply
                </button>
                {o.state === 'available' && (
                  <Link className="rounded border border-border px-2 py-1 text-xs text-muted" to={`/offer/${o.magic_token}`}>
                    Open offer link
                  </Link>
                )}
                {o.state === 'quoted' && (
                  <button
                    type="button"
                    disabled={o.bookingGated}
                    className="rounded bg-gold px-2 py-1 text-xs font-medium text-ink disabled:opacity-40"
                    onClick={() =>
                      void selectOfferAndHardQuote(trip.id, o.id)
                        .then(refresh)
                        .catch((e) => setError(String(e)))
                    }
                  >
                    Select → hard quote
                  </button>
                )}
              </div>
            </article>
          ))}

          {trip.hard_quote && (
            <div className="rounded-lg border border-gold bg-gold/10 p-4">
              <div className="text-sm text-gold">Hard quote ready</div>
              <div className="avionic text-xl text-cream">${trip.hard_quote.total.toFixed(0)}</div>
              <Link className="mt-2 inline-block text-sm text-gold" to={`/accept/${trip.hard_quote.accept_token}`}>
                Open client accept page →
              </Link>
              <button
                type="button"
                className="ml-3 text-sm text-muted underline"
                onClick={() =>
                  void acceptHardQuote(trip.hard_quote!.accept_token).then(refresh)
                }
              >
                Simulate accept
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Phone simulator</h2>
          <p className="mt-1 text-xs text-muted">
            SMS via mock until RingCentral is wired
          </p>
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-auto text-sm">
            {msgs.length === 0 && <li className="text-muted">No messages yet</li>}
            {msgs.map((m, i) => (
              <li key={i} className="rounded border border-border/50 bg-ink/40 px-3 py-2">
                <div className="avionic text-xs text-gold">
                  {m.channel} → {m.to}
                </div>
                <div className="mt-1 text-cream">{m.body}</div>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wider text-muted">Event log</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {trip.events.map((e, i) => (
                <li key={i}>
                  <span className="avionic">{e.at.slice(11, 19)}Z</span> · {e.kind} · {e.actor}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
