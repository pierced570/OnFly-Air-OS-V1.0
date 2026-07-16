import { Link, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { getTrip } from '@/lib/tripStore'
import { computeEtaSheetLinesFromQuick } from '@/lib/etaSheet'
import { getPortalTrackRow } from '@/lib/portalTrackStore'

export default function PortalTrackPage() {
  const { token } = useParams()
  const row = useMemo(() => {
    if (!token) return null
    return getPortalTrackRow(token) // in-memory session store
  }, [token])

  const trip = useMemo(() => {
    if (!row) return null
    return getTrip(row.tripId)
  }, [row])

  const lines = useMemo(() => {
    if (!trip?.quick) return []
    return computeEtaSheetLinesFromQuick(trip.quick)
  }, [trip])

  if (!row || !trip || !trip.quick) {
    return (
      <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
        <div className="mx-auto max-w-xl space-y-3">
          <h1 className="text-2xl font-semibold">Tracking link expired</h1>
          <p className="text-sm text-muted">
            This magic link isn’t recognized in the current session.
            Ask dispatch for a fresh link.
          </p>
          <Link to="/portal" className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink">
            Back to portal
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            OnFly Air
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            Tracking · T-{trip.ref}
          </h1>
          <p className="mt-1 text-sm text-muted">{trip.lane}</p>
        </header>

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Current ETA sheet
          </h2>
          {lines.length === 0 ? (
            <p className="mt-3 text-sm text-muted">ETA unavailable.</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {lines.map((l) => (
                <li
                  key={l.seq}
                  className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{l.leg_label}</div>
                    <div className="text-xs text-muted">
                      {l.pickup_location} → {l.where_going}
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    Pickup {l.pickup_time_zulu} · Arrive {l.arrive_time_zulu}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Next updates
          </h2>
          <p className="mt-2 text-sm text-muted">
            This is a demo/session-only tracking view. Live movement + real
            magic-link auth are wired in later chunks.
          </p>
        </section>

        <Link
          to="/portal"
          className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
        >
          Back to portal
        </Link>
      </div>
    </div>
  )
}

