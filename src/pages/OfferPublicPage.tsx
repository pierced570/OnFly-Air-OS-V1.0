import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTripByOfferToken } from '@/lib/tripStore'
import { submitOperatorQuote } from '@/lib/offerFlow'
import { DateTime } from 'luxon'

export default function OfferPublicPage() {
  const { token } = useParams()
  const found = useMemo(() => (token ? getTripByOfferToken(token) : null), [token])
  const [ttp, setTtp] = useState(90)
  const [live, setLive] = useState(75)
  const [price, setPrice] = useState(4500)
  const [waitOk, setWaitOk] = useState(true)
  const [maxWait, setMaxWait] = useState(2)
  const [done, setDone] = useState(false)

  if (!found) {
    return (
      <div className="min-h-screen bg-ink p-6 text-cream">
        <p>Invalid or expired trip offer link.</p>
      </div>
    )
  }

  const { trip, offer } = found
  const impliedEta = DateTime.utc().plus({ minutes: ttp + live }).toFormat("HH:mm 'Z'")

  return (
    <div className="min-h-screen bg-ink px-4 py-8 text-cream" data-theme="dispatcher">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly trip offer</div>
          <h1 className="mt-2 text-2xl font-semibold">{trip.lane}</h1>
          <p className="mt-1 text-sm text-muted">
            {trip.payload_summary} · ready {trip.ready_label}
          </p>
          <p className="mt-2 text-xs text-muted">
            Operator view for {offer.operator_name} · {offer.tail}
          </p>
        </div>

        {done ? (
          <div className="rounded-lg border border-onplan/40 bg-onplan/10 p-4 text-onplan">
            Quote submitted. Dispatch has been notified.
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submitOperatorQuote(token!, {
                time_to_position_min: ttp,
                live_leg_min: live,
                price_net: price,
                wait_ok: waitOk,
                max_wait_hrs: waitOk ? maxWait : null,
              }).then(() => setDone(true))
            }}
          >
            <label className="block text-sm">
              Time to position (min)
              <input
                type="number"
                value={ttp}
                onChange={(e) => setTtp(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-lg avionic"
              />
            </label>
            <div className="rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
              Implied wheels-up / ETA ≈ <span className="avionic">{impliedEta}</span> (live updates)
            </div>
            <label className="block text-sm">
              Live leg (min)
              <input
                type="number"
                value={live}
                onChange={(e) => setLive(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-lg avionic"
              />
            </label>
            <label className="block text-sm">
              Price to aircraft NET ($)
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-lg avionic"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={waitOk} onChange={(e) => setWaitOk(e.target.checked)} />
              Wait OK
            </label>
            {waitOk && (
              <label className="block text-sm">
                Max wait (hrs)
                <input
                  type="number"
                  value={maxWait}
                  onChange={(e) => setMaxWait(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-lg avionic"
                />
              </label>
            )}
            <button
              type="submit"
              className="w-full rounded-md bg-gold py-3 text-base font-medium text-ink"
            >
              Submit quote
            </button>
          </form>
        )}

        <Link to={`/trips/${trip.id}/offers`} className="block text-center text-xs text-muted">
          Dispatcher compare view
        </Link>
      </div>
    </div>
  )
}
