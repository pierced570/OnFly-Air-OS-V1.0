/**
 * Live client tracking — magic link + session trip routes.
 * Cream client theme. Never shows cost, margin, or operator identity.
 */

import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { PortalTrackingBody } from '@/components/PortalTrackingBody'
import { PortalShell } from '@/components/PortalShell'
import {
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
import { canPersist } from '@/lib/db/client'
import { createAdsbAdapter, type AdsbPosition } from '@/adapters/adsb'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
  type PortalTrackingView,
} from '@/domain/portalTracking'
import { ensurePortalTripTrackingReady } from '@/lib/portalTripHydrate'

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
  const [etaReadyTick, setEtaReadyTick] = useState(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setResolving(true)
    void (async () => {
      const id = await resolvePortalTrackTripId(token)
      if (cancelled) return
      setTripId(id)
      if (id) rememberPortalGuestTrack({ token, tripId: id })
      if (id && canPersist()) {
        const ready = await ensurePortalTripTrackingReady({
          tripId: id,
          token,
        })
        if (cancelled) return
        if (ready) {
          setRemoteTrip(ready)
          setEtaReadyTick((n) => n + 1)
        }
      }
      setResolving(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const trip = useMemo(() => {
    if (tripId) {
      const local = getTrip(tripId)
      if (local) return local
    }
    return remoteTrip
    // etaReadyTick forces re-read after async ETA hydrate merges into session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, remoteTrip, nowIso, etaReadyTick])

  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail)

  // Commit FlightAware actual_off / actual_on into the trip spine when present.
  useEffect(() => {
    if (!trip?.id || !adsb) return
    if (adsb.takeoffIsActual !== true && adsb.landingIsActual !== true) return
    void import('@/lib/applyAdsbActuals').then((m) => {
      m.applyAdsbActualsToTrip(trip.id, adsb, { nowIso })
    })
  }, [
    trip?.id,
    adsb?.tail,
    adsb?.lastTakeoffAt,
    adsb?.lastLandingAt,
    adsb?.takeoffIsActual,
    adsb?.landingIsActual,
    nowIso,
  ])

  const view = useMemo(() => {
    if (!trip) return null
    // Re-read after ADS-B apply so Actual vs Forecast picks up chain stamps.
    const live = getTrip(trip.id) ?? trip
    return viewFromTrip(live, adsb, nowIso)
  }, [trip, adsb, nowIso, etaReadyTick])

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
  const [etaReadyTick, setEtaReadyTick] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const ready = await ensurePortalTripTrackingReady({ tripId: id })
      if (cancelled) return
      if (ready) {
        setRemoteTrip(ready)
        setEtaReadyTick((n) => n + 1)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const trip = useMemo(() => {
    return (id ? getTrip(id) : null) ?? remoteTrip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, remoteTrip, nowIso, etaReadyTick])

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
