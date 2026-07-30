/**
 * Live client tracking — magic link + session trip routes.
 * Cream client theme. Never shows cost, margin, or operator identity.
 */

import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { PortalTrackingBody } from '@/components/PortalTrackingBody'
import { PortalShell } from '@/components/PortalShell'
import {
  ensureTripInSession,
  getTrip,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'
import { rememberPortalGuestTrack } from '@/lib/portalGuestTrack'
import {
  getPortalTrackRow,
  resolvePortalTrackTripId,
} from '@/lib/portalTrackStore'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import { createAdsbAdapter, type AdsbPosition } from '@/adapters/adsb'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
  type PortalTrackingView,
} from '@/domain/portalTracking'

const REFRESH_MS = 30_000

function useAdsbForTail(tail: string | null | undefined): AdsbPosition | null {
  const [pos, setPos] = useState<AdsbPosition | null>(null)
  useEffect(() => {
    if (!tail) {
      setPos(null)
      return
    }
    let cancelled = false
    const tick = () => {
      void createAdsbAdapter()
        .positions([tail])
        .then((rows) => {
          if (!cancelled) setPos(rows[0] ?? null)
        })
        .catch(() => {
          if (!cancelled) setPos(null)
        })
    }
    tick()
    const id = window.setInterval(tick, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [tail])
  return pos
}

function useClock(ms = REFRESH_MS): string {
  const [now, setNow] = useState(() => new Date().toISOString())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date().toISOString()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

function viewFromTrip(
  trip: TripStoreRow,
  adsb: AdsbPosition | null,
  nowIso: string,
): PortalTrackingView {
  return buildPortalTrackingView(tripToTrackingInput(trip), { adsb, nowIso })
}

function mapPortalLegs(
  legRows: Record<string, unknown>[] | null | undefined,
): TripStoreRow['legs'] {
  if (!Array.isArray(legRows)) return []
  return legRows.map((l, i) => ({
    id: String(l.id),
    seq: Number(l.seq ?? i + 1),
    label: String(l.label || l.type || `Leg ${i + 1}`),
    status: String(l.status || 'pending') as TripStoreRow['legs'][0]['status'],
    origin: (l.from_ref as { icao?: string } | null)?.icao,
    dest: (l.to_ref as { icao?: string } | null)?.icao,
    est_start: l.est_start ? String(l.est_start) : null,
    est_end: l.est_end ? String(l.est_end) : null,
    actual_start: l.actual_start ? String(l.actual_start) : null,
    actual_end: l.actual_end ? String(l.actual_end) : null,
    party: 'dispatcher',
    type: String(l.type || ''),
    one_tap_token: '',
  }))
}

function stubTripFromPortalRow(
  tripRow: Record<string, unknown>,
  legs: TripStoreRow['legs'],
): TripStoreRow {
  return {
    id: String(tripRow.id),
    ref: Number(tripRow.ref ?? 0),
    code: tripRow.code ? String(tripRow.code) : '',
    state: tripRow.state as TripStoreRow['state'],
    lane: String(tripRow.lane_label || tripRow.lane || ''),
    payload_summary: String(tripRow.payload_summary || ''),
    ready_label: String(tripRow.ready_label || ''),
    candidates: [],
    offers: [],
    events: [],
    eta_chain: [],
    service_pattern:
      (tripRow.service_pattern as TripStoreRow['service_pattern']) ?? null,
    promised_delivery: tripRow.promised_delivery
      ? String(tripRow.promised_delivery)
      : null,
    eta_defaults_snapshot: null,
    thread_number: null,
    thread_disbanded_at: null,
    legs,
    participants: [],
    thread: [],
    documents: [],
    invoice: null,
    po_number: tripRow.po_number ? String(tripRow.po_number) : null,
  }
}

function PortalLoading() {
  return (
    <PortalShell>
      <p className="text-sm text-muted">Loading live tracking…</p>
    </PortalShell>
  )
}

/** Magic-link tracker `/portal/track/:token` */
export default function PortalTrackPage() {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const nowIso = useClock()
  const { token } = useParams()
  const [tripId, setTripId] = useState<string | null>(() =>
    token ? getPortalTrackRow(token)?.tripId ?? null : null,
  )
  const [resolving, setResolving] = useState(Boolean(token && !tripId))
  const [remoteTrip, setRemoteTrip] = useState<TripStoreRow | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setResolving(true)
    void (async () => {
      const id = await resolvePortalTrackTripId(token)
      if (cancelled) return
      setTripId(id)
      if (id) rememberPortalGuestTrack({ token, tripId: id })
      if (id && !getTrip(id) && canPersist()) {
        const [tripRows, legRows] = await Promise.all([
          safeQuery<Record<string, unknown>[]>('portal_trip_by_token', () =>
            db().rpc('portal_trip_by_token', { p_token: token }),
          ),
          safeQuery<Record<string, unknown>[]>('portal_legs_by_token', () =>
            db().rpc('portal_legs_by_token', { p_token: token }),
          ),
        ])
        const tripRow = Array.isArray(tripRows) ? tripRows[0] : null
        if (cancelled || !tripRow) {
          setResolving(false)
          return
        }
        setRemoteTrip(
          stubTripFromPortalRow(tripRow, mapPortalLegs(legRows as never)),
        )
      }
      setResolving(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (remoteTrip && !getTrip(remoteTrip.id)) {
      ensureTripInSession(remoteTrip)
    }
  }, [remoteTrip])

  const trip = useMemo(() => {
    if (tripId) {
      const local = getTrip(tripId)
      if (local) return local
    }
    return remoteTrip
  }, [tripId, remoteTrip, nowIso])

  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail)
  const view = useMemo(() => {
    if (!trip) return null
    return viewFromTrip(trip, adsb, nowIso)
  }, [trip, adsb, nowIso])

  if (resolving) return <PortalLoading />

  if (!view) {
    return (
      <PortalShell>
        <h1 className="text-2xl font-semibold">Tracking link expired</h1>
        <p className="mt-2 text-sm text-muted">
          This magic link isn&apos;t recognized. Ask dispatch for a fresh link.
        </p>
        <Link
          to="/portal"
          className="mt-4 inline-flex rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink"
        >
          Back to shipments
        </Link>
      </PortalShell>
    )
  }

  return (
    <PortalTrackingBody
      view={view}
      backHref="/portal"
      tripId={trip?.id ?? tripId}
    />
  )
}

/** Session tracker `/portal/trips/:id` — same live view for signed-in clients. */
export function PortalTripTrackPage() {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const nowIso = useClock()
  const { id } = useParams()
  const [remoteTrip, setRemoteTrip] = useState<TripStoreRow | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    if (getTrip(id)) {
      setRemoteTrip(null)
      return
    }
    if (!canPersist()) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const [tripRows, legRows] = await Promise.all([
        safeQuery<Record<string, unknown>[]>('portal_trips.by_id', () =>
          db()
            .from('portal_trips')
            .select(
              'id,ref,code,state,lane_label,payload_summary,ready_label,promised_delivery,service_pattern,po_number',
            )
            .eq('id', id)
            .limit(1),
        ),
        safeQuery<Record<string, unknown>[]>('portal_legs.by_trip', () =>
          db().from('portal_legs').select('*').eq('trip_id', id).order('seq'),
        ),
      ])
      if (cancelled) return
      const tripRow = Array.isArray(tripRows) ? tripRows[0] : null
      if (!tripRow) {
        setLoading(false)
        return
      }
      setRemoteTrip(
        stubTripFromPortalRow(tripRow, mapPortalLegs(legRows as never)),
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (remoteTrip && !getTrip(remoteTrip.id)) {
      ensureTripInSession(remoteTrip)
    }
  }, [remoteTrip])

  const trip = (id ? getTrip(id) : null) ?? remoteTrip
  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail)
  const view = trip ? viewFromTrip(trip, adsb, nowIso) : null

  if (loading) return <PortalLoading />

  if (!view) {
    return (
      <PortalShell>
        <h1 className="text-xl font-semibold">Trip not found</h1>
        <p className="mt-2 text-sm text-muted">
          Open a trip from your shipments list, or use the magic tracking link
          from email.
        </p>
        <Link to="/portal" className="mt-4 inline-block text-gold">
          ← All shipments
        </Link>
      </PortalShell>
    )
  }

  return <PortalTrackingBody view={view} tripId={trip?.id ?? id} />
}
