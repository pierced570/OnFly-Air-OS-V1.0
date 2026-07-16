import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TripRequestForm } from '@/components/TripRequestForm'
import { submitTripRequest } from '@/lib/requestStore'
import type { TripRequestRecord } from '@/domain/tripRequest'

export default function PortalRequestPage() {
  const [done, setDone] = useState<TripRequestRecord | null>(null)

  if (done) {
    return (
      <div className="min-h-screen bg-cream text-ink" data-theme="client">
        <div className="mx-auto max-w-lg space-y-4 p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly Air</div>
          <h1 className="text-2xl font-semibold">Request received</h1>
          <p className="text-sm text-muted">
            Ref <span className="avionic text-ink">R-{done.ref}</span> · {done.lane}
          </p>
          <p className="text-sm text-muted">
            Dispatch has your request ({done.summary}). An estimate typically follows after
            review — watch {done.email} for updates.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/portal"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
            >
              Back to portal
            </Link>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm"
              onClick={() => setDone(null)}
            >
              Submit another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Link to="/portal" className="text-sm text-muted hover:text-ink">
          ← Portal
        </Link>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-sm">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <h1 className="text-lg font-semibold">New Trip Request</h1>
            <Link to="/portal" className="text-muted hover:text-ink" aria-label="Close">
              ✕
            </Link>
          </header>
          <div className="px-5 py-5">
            <TripRequestForm
              variant="portal"
              submitLabel="Submit request"
              onSubmit={(draft) => {
                const row = submitTripRequest(draft, 'portal')
                setDone(row)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
