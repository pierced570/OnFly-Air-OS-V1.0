import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DateTime } from 'luxon'
import {
  OfferBoardChrome,
  offerBtnNo,
  offerBtnPrimary,
  offerBtnYes,
  offerInput,
  offerLabel,
} from '@/components/OfferBoardChrome'
import { getTripByOfferToken } from '@/lib/tripStore'
import {
  respondOfferAvailability,
  submitOperatorQuote,
} from '@/lib/offerFlow'

/**
 * Operator trip-offer board — Yes/No availability first, then their aircraft +
 * TTP / live / wait / price. Never recommend a tail; never say "bid".
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
  const [tail, setTail] = useState('')
  const [ttp, setTtp] = useState(90)
  const [live, setLive] = useState(75)
  const [price, setPrice] = useState(4500)
  const [waitOk, setWaitOk] = useState(true)
  const [maxWait, setMaxWait] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!found) {
    return (
      <div className="min-h-dvh bg-ink px-4 py-6 text-base text-cream">
        <p>Invalid or expired trip offer link.</p>
        <Link
          to="/offer/preview"
          className="mt-4 inline-block text-base text-gold"
        >
          See sample operator board
        </Link>
      </div>
    )
  }

  const { trip } = found
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
    <OfferBoardChrome
      lane={trip.lane}
      missionLine={`${trip.payload_summary} · ready ${ready}`}
    >
      {error && <p className="text-base text-late">{error}</p>}

      {step === 'avail' && (
        <div className="space-y-4">
          <p className="text-base text-cream">
            {asap
              ? 'Can you do this trip ASAP?'
              : `Can you do this trip at ${ready}?`}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAvail(true)}
              className={offerBtnYes}
            >
              Yes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAvail(false)}
              className={offerBtnNo}
            >
              No
            </button>
          </div>
          <p className="text-base text-muted">
            Yes → enter your aircraft, times, and price. No → we stand you down
            for this one.
          </p>
        </div>
      )}

      {step === 'no' && (
        <div className="rounded-lg border border-border bg-surface p-4 text-base text-muted">
          Thanks — marked unavailable. You&apos;re still in line for the next
          trip that fits.
        </div>
      )}

      {step === 'done' && (
        <div className="rounded-lg border border-onplan/40 bg-onplan/10 p-4 text-base text-onplan">
          Quote submitted. Dispatch has been notified.
        </div>
      )}

      {step === 'quote' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            const t = tail.trim().toUpperCase()
            if (!t) {
              setError('Enter the tail you will fly')
              return
            }
            setBusy(true)
            setError(null)
            void submitOperatorQuote(token!, {
              tail: t,
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
          <p className="text-base text-onplan">
            You&apos;re available — enter your aircraft and quote:
          </p>
          <label className={offerLabel}>
            Tail
            <input
              className={offerInput}
              value={tail}
              onChange={(e) => setTail(e.target.value.toUpperCase())}
              placeholder="N123AB"
              required
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          <label className={offerLabel}>
            Time to position (min)
            <input
              type="number"
              inputMode="numeric"
              value={ttp}
              onChange={(e) => setTtp(Number(e.target.value))}
              className={offerInput}
              required
            />
          </label>
          <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2.5 text-base text-gold">
            Implied ETA ≈ <span className="avionic">{impliedEta}</span>
          </div>
          <label className={offerLabel}>
            Live leg (min)
            <input
              type="number"
              inputMode="numeric"
              value={live}
              onChange={(e) => setLive(Number(e.target.value))}
              className={offerInput}
              required
            />
          </label>
          <label className="flex min-h-12 items-center gap-3 text-base">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={waitOk}
              onChange={(e) => setWaitOk(e.target.checked)}
            />
            Can do the wait time
          </label>
          {waitOk && (
            <label className={offerLabel}>
              Max wait (hrs)
              <input
                type="number"
                inputMode="numeric"
                value={maxWait}
                onChange={(e) => setMaxWait(Number(e.target.value))}
                className={offerInput}
              />
            </label>
          )}
          <label className={offerLabel}>
            Price to aircraft NET ($)
            <input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className={offerInput}
              required
            />
          </label>
          <button type="submit" disabled={busy} className={offerBtnPrimary}>
            {busy ? 'Sending…' : 'Submit quote'}
          </button>
        </form>
      )}
    </OfferBoardChrome>
  )
}
