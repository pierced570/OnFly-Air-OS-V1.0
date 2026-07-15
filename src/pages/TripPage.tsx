import { Link, useParams } from 'react-router-dom'
import sampleTrip from '@/fixtures/sampleTrip.json'
import { TRIP_STATES, TRANSITIONS, type TripState } from '@/domain/stateMachine'
import type { TripFixture } from '@/lib/types'

const trip = sampleTrip as TripFixture
const spine = TRIP_STATES.filter((s) => s !== 'lost' && s !== 'cancelled')

export default function TripPage() {
  const { id } = useParams()
  const isSample = id === trip.id || id === 'sample'

  if (!isSample) {
    return (
      <div className="p-8">
        <h1 className="text-xl text-cream">Trip not found</h1>
        <p className="mt-2 text-sm text-muted">
          Chunk 1 ships one fixture trip. Open{' '}
          <Link className="text-gold" to={`/trips/${trip.id}`}>
            T-{trip.ref}
          </Link>
          .
        </p>
      </div>
    )
  }

  const state = trip.state as TripState
  const next = TRANSITIONS[state] ?? []
  const stateIndex = spine.findIndex((s) => s === state)

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Trip</div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            T-<span className="avionic">{trip.ref}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            <span className="avionic">{trip.origin.icao ?? trip.origin.text}</span>
            {' → '}
            <span className="avionic">{trip.destination.icao ?? trip.destination.text}</span>
            {' · '}
            {trip.mode.toUpperCase()} · {trip.payload_kind}
          </p>
        </div>
        <div className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
          State: <span className="avionic font-medium">{state}</span>
        </div>
      </header>

      {/* State machine position */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">State machine</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {spine.map((s, i) => {
            const active = s === state
            const past = stateIndex >= 0 && i < stateIndex
            return (
              <div
                key={s}
                className={[
                  'rounded-full px-3 py-1 text-xs avionic',
                  active
                    ? 'bg-gold text-ink'
                    : past
                      ? 'bg-onplan/20 text-onplan'
                      : 'bg-surface-2 text-muted',
                ].join(' ')}
              >
                {s}
              </div>
            )
          })}
        </div>
        {next.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Legal next:{' '}
            <span className="avionic text-cream">{next.join(', ')}</span>
            {' · '}transitions via <span className="avionic">trip_transition</span> RPC only
          </p>
        )}
      </section>

      {/* Empty ETA chain */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">ETA chain</h2>
        {trip.legs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No legs yet — routing engine populates this in Chunk 2.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {trip.legs.map((leg) => (
              <li key={leg.seq} className="flex gap-3 text-sm">
                <span className="avionic text-gold">{leg.seq}</span>
                <span className="text-cream">{leg.type}</span>
                <span className="text-muted">{leg.status}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Event log */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Event log</h2>
        <ul className="mt-3 space-y-2">
          {trip.events.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/50 pb-2 text-sm last:border-0"
            >
              <span className="avionic text-xs text-muted">
                {new Date(e.at).toISOString().replace('.000Z', 'Z')}
              </span>
              <span className="text-gold">{e.kind}</span>
              <span className="text-muted">{e.actor}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
