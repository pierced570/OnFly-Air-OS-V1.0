import { useState, useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import {
  getTripByAcceptToken,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'
import { acceptHardQuote } from '@/lib/offerFlow'

export default function AcceptPage() {
  const { token } = useParams()
  // Subscribe so hydrate / concurrent updates re-resolve the token.
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = token ? getTripByAcceptToken(token) : null
  const [accepted, setAccepted] = useState(false)
  const [etaCount, setEtaCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  if (!trip || !trip.hard_quote) {
    return (
      <div className="min-h-screen bg-cream p-8 text-ink" data-theme="client">
        <p>This accept link is invalid or expired.</p>
      </div>
    )
  }

  const hq = trip.hard_quote
  const isPax = hq.payload_kind === 'pax' || hq.payload_kind === 'both'
  const alreadyBooked = ['booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(
    trip.state,
  )

  return (
    <div className="min-h-screen bg-cream px-4 py-10 text-ink" data-theme="client">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly Air</div>
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

        {accepted || alreadyBooked ? (
          <div className="space-y-2 rounded-md border border-onplan/40 bg-onplan/10 p-4 text-onplan">
            <p>
              Accepted{hq.disclosure_at ? ` · disclosure logged ${hq.disclosure_at}` : ''}.
            </p>
            <p className="text-sm text-muted">
              Mission is a go — selected operator confirmed; other offers stood down.
              {etaCount > 0
                ? ` ETA sheet + track link sent to ${etaCount} ops / supply-chain contact${etaCount === 1 ? '' : 's'}.`
                : alreadyBooked && !accepted
                  ? ' This trip is already booked.'
                  : ' No tracker emails on file — ETA sheet skipped.'}{' '}
              Invoice drafted for AP (QuickBooks when configured).
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="w-full rounded-md bg-gold py-3 font-medium text-ink"
            onClick={() => {
              setError(null)
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
            }}
          >
            Accept quote
          </button>
        )}
      </div>
    </div>
  )
}
