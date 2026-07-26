import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  OfferBoardChrome,
  offerBtnNo,
  offerBtnYes,
} from '@/components/OfferBoardChrome'
import { OfferQuoteForm } from '@/components/OfferQuoteForm'

/**
 * Static preview of the operator trip-offer board (no login).
 * Mobile-first; no recommended tail — operators enter their own aircraft.
 */
export default function OfferPreviewPage() {
  const [step, setStep] = useState<'avail' | 'quote' | 'no' | 'done'>('avail')

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
            onClick={() => setStep('avail')}
          >
            Reset preview
          </button>
        </div>
      )}

      {step === 'quote' && (
        <OfferQuoteForm
          lane="KCAK→KMDW"
          submitLabel="Submit quote"
          onSubmit={() => setStep('done')}
        />
      )}
    </OfferBoardChrome>
  )
}
