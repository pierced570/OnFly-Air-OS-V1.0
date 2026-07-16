import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTripByAcceptToken } from '@/lib/tripStore'
import { acceptHardQuote } from '@/lib/offerFlow'

export default function AcceptPage() {
  const { token } = useParams()
  const trip = useMemo(() => (token ? getTripByAcceptToken(token) : null), [token])
  const [accepted, setAccepted] = useState(false)

  if (!trip || !trip.hard_quote) {
    return (
      <div className="min-h-screen bg-cream p-8 text-ink" data-theme="client">
        <p>This accept link is invalid or expired.</p>
      </div>
    )
  }

  const hq = trip.hard_quote
  const isPax = hq.payload_kind === 'pax' || hq.payload_kind === 'both'

  return (
    <div className="min-h-screen bg-cream px-4 py-10 text-ink" data-theme="client">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly Air</div>
        <h1 className="text-2xl font-semibold">Hard quote</h1>
        <p className="text-sm text-muted">
          {trip.lane} · via a vetted Part 135 carrier
        </p>
        <p className="avionic text-3xl">${hq.total.toFixed(2)}</p>

        {isPax && hq.disclosure_text && (
          <div className="rounded-md border border-border bg-surface-2 p-4 text-sm">
            <div className="font-medium">Part 295.24 disclosure</div>
            <p className="mt-2 text-muted">{hq.disclosure_text}</p>
          </div>
        )}

        {accepted ? (
          <div className="rounded-md border border-onplan/40 bg-onplan/10 p-4 text-onplan">
            Accepted{hq.disclosure_at ? ` · disclosure logged ${hq.disclosure_at}` : ''}.
            Confirmations are going out.
          </div>
        ) : (
          <button
            type="button"
            className="w-full rounded-md bg-gold py-3 font-medium text-ink"
            onClick={() =>
              void acceptHardQuote(token!).then(() => setAccepted(true))
            }
          >
            Accept quote
          </button>
        )}
      </div>
    </div>
  )
}
