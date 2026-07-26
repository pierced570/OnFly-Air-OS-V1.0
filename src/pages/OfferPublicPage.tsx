import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  OfferBoardChrome,
  offerBtnNo,
  offerBtnYes,
} from '@/components/OfferBoardChrome'
import { OfferQuoteForm } from '@/components/OfferQuoteForm'
import { getTripByOfferToken } from '@/lib/tripStore'
import {
  respondOfferAvailability,
  submitOperatorQuote,
} from '@/lib/offerFlow'

/**
 * Operator trip-offer board — Yes/No, then aircraft + timing chain + NET NET.
 * Never recommend a tail; never say "bid".
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
        <OfferQuoteForm
          lane={trip.lane}
          busy={busy}
          onSubmit={(values) => {
            setBusy(true)
            setError(null)
            void submitOperatorQuote(token!, values)
              .then(() => setStep('done'))
              .catch((err) =>
                setError(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setBusy(false))
          }}
        />
      )}
    </OfferBoardChrome>
  )
}
