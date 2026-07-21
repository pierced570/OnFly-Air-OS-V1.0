import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getTripByOfferToken,
  listTripsStable,
  subscribeTrips,
  type FeeScope,
} from '@/lib/tripStore'
import { submitOperatorQuote } from '@/lib/offerFlow'
import { applyQuotedTtp, projectedDeliveryUtc } from '@/domain/etaChain'
import { formatZuluLocal } from '@/domain/timeFmt'

export default function OfferPublicPage() {
  const { token } = useParams()
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const found = token ? getTripByOfferToken(token) : null
  const [ttp, setTtp] = useState(90)
  const [live, setLive] = useState(75)
  const [price, setPrice] = useState(4500)
  const [waitOk, setWaitOk] = useState(true)
  const [maxWait, setMaxWait] = useState(2)
  const [feeScope, setFeeScope] = useState<FeeScope>('aircraft_and_fees')
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const implied = useMemo(() => {
    if (!found) return null
    const cand =
      found.trip.candidates.find((c) => c.aircraft_id === found.offer.aircraft_id) ??
      found.trip.candidates.find((c) => c.chain?.length)
    const base = found.trip.eta_chain.length
      ? found.trip.eta_chain
      : cand?.chain
    if (!base?.length) return null
    const { chain } = applyQuotedTtp(base, ttp)
    const air = chain.find((l) => l.type === 'air_leg')
    const delivery = projectedDeliveryUtc(chain)
    const wuTz = air?.from.tz || 'UTC'
    const delTz = chain[chain.length - 1]?.to.tz || wuTz
    return {
      wheelsUp: air
        ? formatZuluLocal(air.est_start, wuTz).display
        : null,
      delivery: delivery
        ? formatZuluLocal(delivery, delTz).display
        : null,
    }
  }, [found, ttp])

  if (!found) {
    return (
      <div className="min-h-screen bg-ink p-6 text-cream">
        <p>Invalid or expired trip offer link.</p>
      </div>
    )
  }

  const { trip, offer } = found

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
              setError(null)
              void submitOperatorQuote(token!, {
                time_to_position_min: ttp,
                live_leg_min: live,
                price_net: price,
                wait_ok: waitOk,
                max_wait_hrs: waitOk ? maxWait : null,
                fee_scope: feeScope,
                notes,
              })
                .then(() => setDone(true))
                .catch((err) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
            }}
          >
            {error && <p className="text-sm text-late">{error}</p>}
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
              {implied?.wheelsUp ? (
                <>
                  Implied wheels-up{' '}
                  <span className="avionic">{implied.wheelsUp}</span>
                  {implied.delivery ? (
                    <>
                      {' '}
                      · delivery <span className="avionic">{implied.delivery}</span>
                    </>
                  ) : null}
                  <span className="block text-[11px] text-gold/80">
                    Same chain the dispatcher sees — TTP replaces the 2:00 assumption.
                  </span>
                </>
              ) : (
                <>Enter TTP to preview ETA from the trip chain.</>
              )}
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
              Price NET NET ($)
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-lg avionic"
              />
              <span className="mt-1 block text-[11px] text-muted">
                Your NET NET to OnFly. OnFly adds FET (unless MTOW ≤ 6000 §4281 exempt) and margin for the client quote.
              </span>
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm">Fee scope</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="fee_scope"
                  checked={feeScope === 'aircraft_only'}
                  onChange={() => setFeeScope('aircraft_only')}
                />
                Aircraft only
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="fee_scope"
                  checked={feeScope === 'aircraft_and_fees'}
                  onChange={() => setFeeScope('aircraft_and_fees')}
                />
                Aircraft + all fees
              </label>
            </fieldset>
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
            <label className="block text-sm">
              Notes (optional)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
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
