import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalShell } from '@/components/PortalShell'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
} from '@/domain/portalTracking'
import {
  getPortalAuthSession,
  listPortalTripsForSession,
} from '@/lib/portalAuth'
import type { PortalSession, PortalTripCard } from '@/domain/portalAuth'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

function useLocalTrips() {
  return useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
}

type DocRow = {
  id: string
  title: string
  kind: string
  at: string
  url: string
  tripRef: number
  po: string
  trackHref: string
}

/** Client portal documents — POD / airway bills from shipments. */
export default function PortalDocumentsPage() {
  const localTrips = useLocalTrips()
  const [session, setSession] = useState<PortalSession | null>(null)
  const [remoteTrips, setRemoteTrips] = useState<PortalTripCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await getPortalAuthSession()
      if (cancelled) return
      setSession(s)
      if (s?.clientId) {
        const rows = await listPortalTripsForSession()
        if (!cancelled) setRemoteTrips(rows)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const docs: DocRow[] = useMemo(() => {
    if (!session?.clientId) return []
    const clientKey = session.clientId
    const ids = new Set<string>()
    const out: DocRow[] = []

    const pushFromTripId = (id: string, href: string) => {
      if (ids.has(id)) return
      ids.add(id)
      const trip = getTrip(id)
      if (!trip) return
      const view = buildPortalTrackingView(tripToTrackingInput(trip))
      const po =
        view.poNumber?.replace(/^PO\s*#?\s*/i, '') || `T-${view.ref}`
      for (const d of view.documents) {
        out.push({
          id: d.id,
          title: d.title,
          kind: d.kind,
          at: d.at,
          url: d.url,
          tripRef: view.ref,
          po,
          trackHref: href,
        })
      }
    }

    for (const t of remoteTrips) {
      pushFromTripId(t.id, `/portal/trips/${t.id}`)
    }
    for (const t of localTrips) {
      if (t.client_id !== clientKey) continue
      pushFromTripId(t.id, `/portal/trips/${t.id}`)
    }

    return out.sort((a, b) => b.at.localeCompare(a.at))
  }, [session, remoteTrips, localTrips])

  return (
    <PortalShell>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        Documents
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Trip documents &amp; POD
      </h1>
      <p className="mt-2 text-sm text-muted">
        Airway bills and proof of delivery from your shipments. Invoice PDFs
        arrive by email from QuickBooks when dispatch sends them.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : !session?.clientId ? (
        <div className="mt-6 rounded-md border border-border bg-white p-5 text-sm text-muted">
          <Link to="/portal/login" className="font-semibold text-gold">
            Sign in
          </Link>{' '}
          to see documents for your company&apos;s trips.
        </div>
      ) : docs.length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed border-border bg-white/60 p-6 text-sm text-muted">
          No documents yet. They appear here after booking (ETA sheet / airway
          bill) and after delivery (POD).
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-md border border-border bg-white">
          {docs.map((d) => (
            <li
              key={`${d.id}-${d.tripRef}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-ink">{d.title}</div>
                <div className="avionic mt-0.5 text-[11px] text-muted">
                  PO #{d.po} · T-{d.tripRef}
                  {d.kind === 'pod' ? ' · POD' : ''}
                </div>
              </div>
              <div className="flex gap-3 text-xs font-semibold uppercase tracking-[0.12em]">
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gold hover:text-gold-lt"
                  >
                    Open
                  </a>
                ) : null}
                <Link to={d.trackHref} className="text-muted hover:text-ink">
                  Trip
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/portal"
        className="mt-6 inline-flex text-sm font-semibold text-gold hover:text-gold-lt"
      >
        ← Back to shipments
      </Link>
    </PortalShell>
  )
}
