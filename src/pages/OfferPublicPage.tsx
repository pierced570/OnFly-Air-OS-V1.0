import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DateTime } from 'luxon'
import { getTripByOfferToken } from '@/lib/tripStore'
import {
  respondOfferAvailability,
  submitOperatorQuote,
} from '@/lib/offerFlow'

/**
 * Operator trip-offer board — Yes/No availability first, then TTP / live / wait / price.
 * Never say "bid" on this surface.
 */
export default function OfferPublicPage() {
  const { token } = useParams()
  const found = useMemo(
    () => (token ? getTripByOfferToken(token) : null),
    [token],
  )
  const [step, setStep] = useState<'avail' | 'quote' | 'no' | 'done'>(() => {
    if (!found) return 'avail'
    if (found.offer.state === 'quoted') return 'done'
    if (found.offer.state === 'unavailable') return 'no'
    if (found.offer.state === 'available' || found.offer.state === 'pinged')
      return found.offer.state === 'available' ? 'quote' : 'avail'
    return 'avail'
  })
  const [ttp, setTtp] = useState(90)
  const [live, setLive] = useState(75)
  const [price, setPrice] = useState(4500)
  const [waitOk, setWaitOk] = useState(true)
  const [maxWait, setMaxWait] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!found) {
    return (
      <div className="min-h-screen bg-ink p-6 text-cream">
        <p>Invalid or expired trip offer link.</p>
        <Link to="/offer/preview" className="mt-4 inline-block text-sm text-gold">
          See sample operator board
        </Link>
      </div>
    )
  }

  const { trip, offer } = found
  const ready = trip.ready_label || 'scheduled'
  const asap = /asap/i.test(ready)
  const impliedEta = DateTime.utc()
    .plus({ minutes: ttp + live })
    .toFormat("HH:mm 'Z'")

  async function onAvail(yes: boolean) {
    setBusy(true)
    setError(null)
    try {
      const r = await respondOfferAvailability(token!, yes)
      if (!r.ok) {
        setError(r.reason)
        return
      }
      setStep(yes ? 'quote' : 'no')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink px-4 py-8 text-cream" data-theme="dispatcher">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            OnFly trip offer
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{trip.lane}</h1>
          <p className="mt-1 text-sm text-muted">
            {trip.payload_summary} · ready {ready}
          </p>
          <p className="mt-2 text-xs text-muted">
            {offer.operator_name} · <span className="avionic text-gold">{offer.tail}</span>
          </p>
        </div>

        {error && <p className="text-sm text-late">{error}</p>}

        {step === 'avail' && (
          <div className="space-y-4">
            <p className="text-lg font-medium text-cream">
              {asap
                ? 'Can you do this trip ASAP?'
                : `Can you do this trip at ${ready}?`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAvail(true)}
                className="rounded-lg bg-onplan py-4 text-lg font-semibold text-ink disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAvail(false)}
                className="rounded-lg border border-late/50 bg-late/10 py-4 text-lg font-semibold text-late disabled:opacity-50"
              >
                No
              </button>
            </div>
            <p className="text-xs text-muted">
              Yes → enter times and price. No → we stand you down for this one.
            </p>
          </div>
        )}

        {step === 'no' && (
          <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
            Thanks — marked unavailable. You&apos;re still in line for the next
            trip that fits.
          </div>
        )}

        {step === 'done' && (
          <div className="rounded-lg border border-onplan/40 bg-onplan/10 p-4 text-onplan">
            Quote submitted. Dispatch has been notified.
          </div>
        )}

        {step === 'quote' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setBusy(true)
              void submitOperatorQuote(token!, {
                time_to_position_min: ttp,
                live_leg_min: live,
                price_net: price,
                wait_ok: waitOk,
                max_wait_hrs: waitOk ? maxWait : null,
                fee_scope: 'aircraft_only',
              })
                .then(() => setStep('done'))
                .catch((err) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setBusy(false))
            }}
          >
            <p className="text-sm text-onplan">You&apos;re available — quick quote:</p>
            <label className="block text-sm">
              Time to position (min)
              <input
                type="number"
                value={ttp}
                onChange={(e) => setTtp(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-lg avionic"
                required
              />
            </label>
            <div className="rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
              Implied ETA ≈ <span className="avionic">{impliedEta}</span>
            </div>
            <label className="block text-sm">
              Live leg (min)
              <input
                type="number"
                value={live}
                onChange={(e) => setLive(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-lg avionic"
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={waitOk}
                onChange={(e) => setWaitOk(e.target.checked)}
              />
              Can do the wait time
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
              Price to aircraft NET ($)
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-lg avionic"
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-gold py-3 text-base font-medium text-ink disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Submit quote'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
