import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  OfferBoardChrome,
  offerBtnNo,
  offerBtnYes,
} from '@/components/OfferBoardChrome'
import { OfferQuoteForm } from '@/components/OfferQuoteForm'
import { haversineNm } from '@/domain/geo'
import { lookupAirport } from '@/domain/airports'
import { isRoundTripLane, parseLaneAirports } from '@/domain/offerMissionDisplay'
import { resolveOfferByToken } from '@/lib/db/hydrateTrips'
import type { OfferRow, TripStoreRow } from '@/lib/tripStore'
import {
  respondOfferAvailability,
  submitOperatorQuote,
} from '@/lib/offerFlow'

/**
 * Operator trip-offer board — Yes/No, then cream quote form matching desk UI.
 * Never recommend a tail; never say "bid".
 * After a quote is in, the magic link is locked (email/SMS reopen = confirmation only).
 */
export default function OfferPublicPage() {
  const { token } = useParams()
  const [found, setFound] = useState<{
    trip: TripStoreRow
    offer: OfferRow
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<
    'avail' | 'quote' | 'no' | 'done' | 'closed' | 'expired'
  >('avail')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void resolveOfferByToken(token ?? '')
      .then((hit) => {
        if (cancelled) return
        setFound(hit)
        if (!hit) {
          setStep('avail')
          return
        }
        const st = hit.offer.state
        if (st === 'quoted' || st === 'selected') setStep('done')
        else if (st === 'unavailable') setStep('no')
        else if (st === 'stood_down') setStep('closed')
        else if (st === 'expired') setStep('expired')
        else if (st === 'available') setStep('quote')
        else setStep('avail')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const liveNm = useMemo(() => {
    if (!found) return null
    const parsed = parseLaneAirports(found.trip.lane)
    if (!parsed) return null
    const o = lookupAirport(parsed.origin)
    const d = lookupAirport(parsed.dest)
    if (!o || !d) return null
    return Math.round(haversineNm(o.lat, o.lon, d.lat, d.lon))
  }, [found])

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#F9F7F2] px-4 py-6 text-base text-ink">
        Loading trip offer…
      </div>
    )
  }

  if (!found) {
    return (
      <div className="min-h-dvh bg-[#F9F7F2] px-4 py-6 text-base text-ink">
        <p className="font-medium">Could not open this trip offer link.</p>
        <p className="mt-2 text-sm text-muted">
          Ask dispatch to send the offer again — the link may not have saved
          to the server when it was first emailed.
        </p>
      </div>
    )
  }

  const { trip } = found
  const ready = trip.ready_label || 'scheduled'
  const asap = /asap/i.test(ready)
  const alreadySelected = found.offer.state === 'selected'

  async function onAvail(yes: boolean) {
    setBusy(true)
    setError(null)
    try {
      const r = await respondOfferAvailability(token!, yes)
      if (!r.ok) {
        setError(r.reason)
        if (/already submitted/i.test(r.reason)) setStep('done')
        else if (/unavailable/i.test(r.reason)) setStep('no')
        else if (/closed/i.test(r.reason)) setStep('closed')
        else if (/expired/i.test(r.reason)) setStep('expired')
        return
      }
      setStep(yes ? 'quote' : 'no')
    } finally {
      setBusy(false)
    }
  }

  // Quote step — full cream mockup (header lives inside the form)
  if (step === 'quote') {
    return (
      <div
        className="min-h-dvh bg-[#F9F7F2] px-4 py-6 sm:py-10"
        data-theme="client"
      >
        <div className="mx-auto w-full max-w-lg">
          {error && (
            <p className="mb-3 text-base text-[#C0392B]">{error}</p>
          )}
          <OfferQuoteForm
            variant="operator"
            lane={trip.lane}
            roundTrip={isRoundTripLane(trip.lane)}
            busy={busy}
            tripCode={trip.code || `T-${trip.ref}`}
            payloadSummary={trip.payload_summary}
            readyLabel={ready}
            liveNm={liveNm}
            initialTypeName={found.offer.type_name || ''}
            initialTail={
              found.offer.tail && !/^TBD/i.test(found.offer.tail)
                ? found.offer.tail
                : ''
            }
            onDecline={() => void onAvail(false)}
            onSubmit={(values) => {
              setBusy(true)
              setError(null)
              void submitOperatorQuote(token!, values)
                .then(() => setStep('done'))
                .catch((err) => {
                  const msg = err instanceof Error ? err.message : String(err)
                  setError(msg)
                  if (/already submitted/i.test(msg)) setStep('done')
                })
                .finally(() => setBusy(false))
            }}
          />
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div
        className="min-h-dvh bg-[#F9F7F2] px-4 py-10 text-ink"
        data-theme="client"
      >
        <div className="mx-auto max-w-lg rounded-2xl border border-[#E4DDD0] bg-white px-5 py-6 shadow-sm">
          <h1 className="text-xl font-semibold">
            {alreadySelected ? "You're selected" : 'Quote submitted'}
          </h1>
          <p className="mt-2 text-sm text-[#6F675C]">
            {alreadySelected
              ? 'Dispatch has this trip with your operation. This link is closed — contact OnFly if anything changes.'
              : "Dispatch has your quote. This link is closed so it can't be submitted again from email or text. Contact OnFly dispatch if you need to change it."}
          </p>
        </div>
      </div>
    )
  }

  if (step === 'no') {
    return (
      <div
        className="min-h-dvh bg-[#F9F7F2] px-4 py-10 text-ink"
        data-theme="client"
      >
        <div className="mx-auto max-w-lg rounded-2xl border border-[#E4DDD0] bg-white px-5 py-6 shadow-sm">
          <h1 className="text-xl font-semibold">Thanks</h1>
          <p className="mt-2 text-sm text-[#6F675C]">
            Marked unavailable. You&apos;re still in line for the next trip that
            fits.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'closed') {
    return (
      <div
        className="min-h-dvh bg-[#F9F7F2] px-4 py-10 text-ink"
        data-theme="client"
      >
        <div className="mx-auto max-w-lg rounded-2xl border border-[#E4DDD0] bg-white px-5 py-6 shadow-sm">
          <h1 className="text-xl font-semibold">Trip offer closed</h1>
          <p className="mt-2 text-sm text-[#6F675C]">
            This offer is no longer open for your operation. Thanks for
            standing by.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'expired') {
    return (
      <div
        className="min-h-dvh bg-[#F9F7F2] px-4 py-10 text-ink"
        data-theme="client"
      >
        <div className="mx-auto max-w-lg rounded-2xl border border-[#E4DDD0] bg-white px-5 py-6 shadow-sm">
          <h1 className="text-xl font-semibold">Link expired</h1>
          <p className="mt-2 text-sm text-[#6F675C]">
            This trip offer link has expired. Ask OnFly dispatch if you still
            want in.
          </p>
        </div>
      </div>
    )
  }

  // Availability Yes/No — keep existing dark chrome for the first tap
  return (
    <OfferBoardChrome
      lane={trip.lane}
      payloadSummary={trip.payload_summary}
      readyLabel={ready}
    >
      {error && <p className="text-base text-late">{error}</p>}

      <div className="space-y-4">
        <p className="text-base text-cream">
          {asap
            ? 'Availability check — can you cover this trip ASAP?'
            : `Availability check — can you cover this trip at ${ready}?`}
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
    </OfferBoardChrome>
  )
}
