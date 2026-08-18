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
import { getPortalAuthSession } from '@/lib/portalAuth'
import { usePortalSession } from '@/hooks/usePortalSession'
import { useAdsbForTail, adsbPollEnabledForState } from '@/hooks/useAdsbForTail'
import {
  getPortalTrackRow,
  resolvePortalTrackTripId,
} from '@/lib/portalTrackStore'
import { canPersist } from '@/lib/db/client'
import type { AdsbPosition } from '@/adapters/adsb'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
  type PortalTrackingView,
} from '@/domain/portalTracking'
import { ensurePortalTripTrackingReady } from '@/lib/portalTripHydrate'

const REFRESH_MS = 30_000

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
      if (id) {
        // Only remember for guests — signed-in clients use /portal/trips/:id.
        const session = await getPortalAuthSession()
        if (!session?.clientId) {
          rememberPortalGuestTrack({ token, tripId: id })
        }
      }
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
  const adsb = useAdsbForTail(input?.tail, {
    enabled: adsbPollEnabledForState(trip?.state),
    originIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.from.icao,
    destIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.to.icao,
  })

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
          This magic link isn&apos;t recognized. Ask dispatch for a fresh link,
          or sign in to see your company&apos;s shipments.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/portal/login"
            className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink"
          >
            Sign in
          </Link>
          <Link
            to="/portal"
            className="inline-flex rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to shipments
          </Link>
        </div>
      </PortalShell>
    )
  }

  return (
    <PortalTrackingBody
      view={view}
      backHref="/portal"
      tripId={trip?.id ?? tripId}
      trackToken={token}
    />
  )
}

/** Session tracker `/portal/trips/:id` — same live view for signed-in clients. */
export function PortalTripTrackPage() {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const nowIso = useClock()
  const { id } = useParams()
  const { signedIn, loading: authLoading } = usePortalSession()
  const [remoteTrip, setRemoteTrip] = useState<TripStoreRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [etaReadyTick, setEtaReadyTick] = useState(0)

  useEffect(() => {
    if (!id || !signedIn) return
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
  }, [id, signedIn])

  const trip = useMemo(() => {
    return (id ? getTrip(id) : null) ?? remoteTrip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, remoteTrip, nowIso, etaReadyTick])

  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail, {
    enabled: adsbPollEnabledForState(trip?.state),
    originIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.from.icao,
    destIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.to.icao,
  })
  const view = trip ? viewFromTrip(trip, adsb, nowIso) : null

  if (authLoading || (signedIn && loading)) return <PortalLoading />

  if (!signedIn) {
    return (
      <PortalShell>
        <h1 className="text-xl font-semibold">Sign in to track</h1>
        <p className="mt-2 text-sm text-muted">
          Company shipment links need a portal sign-in. Use the tracking link
          from your ETA email to watch as a guest, or sign in for every
          shipment.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/portal/login"
            className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink"
          >
            Sign in
          </Link>
          <Link to="/portal" className="inline-flex px-4 py-2 text-sm text-gold">
            ← All shipments
          </Link>
        </div>
      </PortalShell>
    )
  }

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
