import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DateTime } from 'luxon'
import {
  OfferBoardChrome,
  offerBtnNo,
  offerBtnPrimary,
  offerBtnYes,
  offerInput,
  offerLabel,
} from '@/components/OfferBoardChrome'

/**
 * Static preview of the operator trip-offer board (no login).
 * Mobile-first; no recommended tail — operators enter their own aircraft.
 */
export default function OfferPreviewPage() {
  const [step, setStep] = useState<'avail' | 'quote' | 'no' | 'done'>('avail')
  const [tail, setTail] = useState('')
  const [ttp, setTtp] = useState(90)
  const [live, setLive] = useState(75)
  const [price, setPrice] = useState(4500)
  const [waitOk, setWaitOk] = useState(true)
  const [maxWait, setMaxWait] = useState(2)
  const impliedEta = DateTime.utc()
    .plus({ minutes: ttp + live })
    .toFormat("HH:mm 'Z'")

  return (
    <OfferBoardChrome
      lane="KCAK→KMDW"
      missionLine="2 skids 48×40×60 @ 800ea · ready ASAP"
      banner={
        <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2.5 text-base text-gold">
          Preview — sample operator board (not a live trip offer)
        </div>
      }
      footer={
        <Link to="/" className="block pt-1 text-center text-base text-muted">
          ← Call pad
        </Link>
      }
    >
      {step === 'avail' && (
        <div className="space-y-4">
          <p className="text-base text-cream">Can you do this trip ASAP?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setStep('quote')}
              className={offerBtnYes}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setStep('no')}
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
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4 text-base text-muted">
            Thanks — marked unavailable for this one.
          </div>
          <button
            type="button"
            className="text-base text-gold"
            onClick={() => setStep('avail')}
          >
            Reset preview
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-onplan/40 bg-onplan/10 p-4 text-base text-onplan">
            Quote submitted (preview only).
          </div>
          <button
            type="button"
            className="text-base text-gold"
            onClick={() => {
              setTail('')
              setStep('avail')
            }}
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
          <button type="submit" className={offerBtnPrimary}>
            Submit quote
          </button>
        </form>
      )}
    </OfferBoardChrome>
  )
}
