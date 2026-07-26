import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DateTime } from 'luxon'

/**
 * Static preview of the operator trip-offer board (no login).
 * Shows Yes/No → quote steps so dispatch can share the link.
 */
export default function OfferPreviewPage() {
  const [step, setStep] = useState<'avail' | 'quote' | 'no' | 'done'>('avail')
  const [ttp, setTtp] = useState(90)
  const [live, setLive] = useState(75)
  const [price, setPrice] = useState(4500)
  const [waitOk, setWaitOk] = useState(true)
  const [maxWait, setMaxWait] = useState(2)
  const impliedEta = DateTime.utc()
    .plus({ minutes: ttp + live })
    .toFormat("HH:mm 'Z'")

  return (
    <div className="min-h-screen bg-ink px-4 py-8 text-cream" data-theme="dispatcher">
      <div className="mx-auto max-w-md space-y-6">
        <div className="rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
          Preview — sample operator board (not a live trip offer)
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            OnFly trip offer
          </div>
          <h1 className="mt-2 text-2xl font-semibold">KCAK→KMDW</h1>
          <p className="mt-1 text-sm text-muted">
            2 skids 48×40×60 @ 800ea · ready ASAP
          </p>
          <p className="mt-2 text-xs text-muted">
            Sample Air · <span className="avionic text-gold">N123XX</span>
          </p>
        </div>

        {step === 'avail' && (
          <div className="space-y-4">
            <p className="text-lg font-medium text-cream">
              Can you do this trip ASAP?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStep('quote')}
                className="rounded-lg bg-onplan py-4 text-lg font-semibold text-ink"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setStep('no')}
                className="rounded-lg border border-late/50 bg-late/10 py-4 text-lg font-semibold text-late"
              >
                No
              </button>
            </div>
          </div>
        )}

        {step === 'no' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
              Thanks — marked unavailable for this one.
            </div>
            <button
              type="button"
              className="text-sm text-gold"
              onClick={() => setStep('avail')}
            >
              Reset preview
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-onplan/40 bg-onplan/10 p-4 text-onplan">
              Quote submitted (preview only).
            </div>
            <button
              type="button"
              className="text-sm text-gold"
              onClick={() => setStep('avail')}
            >
              Reset preview
            </button>
          </div>
        )}

        {step === 'quote' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setStep('done')
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
              Implied ETA ≈ <span className="avionic">{impliedEta}</span>
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

        <Link to="/" className="block text-center text-xs text-muted">
          ← Call pad
        </Link>
      </div>
    </div>
  )
}
