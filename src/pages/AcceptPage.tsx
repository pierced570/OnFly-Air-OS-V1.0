import { useState, useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import {
  getTripByAcceptToken,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'
import { acceptHardQuote, declineHardQuote } from '@/lib/offerFlow'
import { BrandLockup } from '@/components/BrandLockup'
import {
  hardQuoteClientStatus,
  hardQuoteClientStatusLabel,
} from '@/domain/hardQuoteClientStatus'

export default function AcceptPage() {
  const { token } = useParams()
  // Subscribe so hydrate / concurrent updates re-resolve the token.
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = token ? getTripByAcceptToken(token) : null
  const [accepted, setAccepted] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [etaCount, setEtaCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!trip || !trip.hard_quote) {
    return (
      <div className="min-h-screen bg-cream p-8 text-ink" data-theme="client">
        <p>This accept link is invalid or expired.</p>
      </div>
    )
  }

  const hq = trip.hard_quote
  const isPax = hq.payload_kind === 'pax' || hq.payload_kind === 'both'
  const status = hardQuoteClientStatus({
    trip_state: trip.state,
    client_decision: hq.client_decision,
    accepted_at: hq.accepted_at,
    declined_at: hq.declined_at,
  })
  const alreadyAccepted = accepted || status === 'accepted'
  const alreadyDeclined = declined || status === 'declined'

  return (
    <div className="min-h-screen bg-cream px-4 py-10 text-ink" data-theme="client">
      <div className="mx-auto max-w-lg space-y-6">
        <BrandLockup showTagline={false} />
        <h1 className="text-2xl font-semibold">Hard quote</h1>
        <p className="text-sm text-muted">
          {trip.lane} · via a vetted Part 135 carrier
        </p>
        {hq.options && hq.options.length > 1 ? (
          <ul className="space-y-2">
            {hq.options.map((opt) => (
              <li
                key={opt.offer_id}
                className="rounded-md border border-border bg-surface-2 px-4 py-3"
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="avionic text-2xl">${opt.client_total.toFixed(2)}</div>
                {opt.eta_end && (
                  <div className="mt-1 text-xs text-muted avionic">
                    ETA {opt.eta_end.slice(0, 16)}Z
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="avionic text-3xl">${hq.total.toFixed(2)}</p>
        )}

        {isPax && hq.disclosure_text && (
          <div className="rounded-md border border-border bg-surface-2 p-4 text-sm">
            <div className="font-medium">Part 295.24 disclosure</div>
            <p className="mt-2 text-muted">{hq.disclosure_text}</p>
          </div>
        )}

        {error && <p className="text-sm text-[#C0392B]">{error}</p>}

        {alreadyAccepted ? (
          <div className="space-y-2 rounded-md border border-onplan/40 bg-onplan/10 p-4 text-onplan">
            <p>
              {hardQuoteClientStatusLabel('accepted')}
              {hq.disclosure_at ? ` · disclosure logged ${hq.disclosure_at}` : ''}.
            </p>
            <p className="text-sm text-muted">
              Mission is a go — a vetted Part 135 carrier is confirmed.
              {etaCount > 0
                ? ` ETA sheet + track link sent to ${etaCount} ops / supply-chain contact${etaCount === 1 ? '' : 's'}.`
                : accepted
                  ? ' No tracker emails on file — ETA sheet skipped.'
                  : ' This trip is already booked.'}{' '}
              Invoice drafted for AP (QuickBooks when configured).
            </p>
          </div>
        ) : alreadyDeclined ? (
          <div className="space-y-2 rounded-md border border-border bg-surface-2 p-4">
            <p className="font-medium text-ink">
              {hardQuoteClientStatusLabel('declined')}
            </p>
            <p className="text-sm text-muted">
              Thanks — we won’t hold this aircraft. Your OnFly contact can send a
              revised quote if you still need the trip.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-md bg-gold py-3 font-medium text-ink disabled:opacity-50"
              onClick={() => {
                setError(null)
                setBusy(true)
                void acceptHardQuote(token!)
                  .then((t) => {
                    const sent = t.events.filter((e) => e.kind === 'eta_sheet_sent').at(-1)
                    const n = Array.isArray(sent?.payload?.recipients)
                      ? (sent!.payload.recipients as string[]).length
                      : 0
                    setEtaCount(n)
                    setAccepted(true)
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                  .finally(() => setBusy(false))
              }}
            >
              Accept quote
            </button>
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-md border border-border bg-white py-3 font-medium text-ink disabled:opacity-50"
              onClick={() => {
                if (
                  !window.confirm(
                    'Decline this quote? We will release the aircraft hold.',
                  )
                ) {
                  return
                }
                setError(null)
                setBusy(true)
                void declineHardQuote(token!)
                  .then(() => setDeclined(true))
                  .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                  .finally(() => setBusy(false))
              }}
            >
              Decline quote
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
