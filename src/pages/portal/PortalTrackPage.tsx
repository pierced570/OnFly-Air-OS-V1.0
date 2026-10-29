/**
 * Live client tracking — magic-link token IS access for that trip.
 * Signed-in session unlocks company-wide shipments; it is not required to
 * open a desk/email tracking link or request another trip.
 * Cream client theme. Never shows cost, margin, or operator identity.
 */

import { Link, Navigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { PortalTrackingBody } from '@/components/PortalTrackingBody'
import { PortalOneClickLogin } from '@/components/PortalOneClickLogin'
import { PortalShell } from '@/components/PortalShell'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'
import {
  readPortalGuestTrack,
  rememberPortalGuestTrack,
} from '@/lib/portalGuestTrack'
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
    <PortalShell appNav>
      <p className="text-sm text-muted">Loading live tracking…</p>
    </PortalShell>
  )
}

/** Magic-link tracker `/portal/track/:token` — token unlocks this trip's live body. */
export default function PortalTrackPage() {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const nowIso = useClock()
  const { token } = useParams()
  const { signedIn, loading: authLoading } = usePortalSession()
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
      } else if (id) {
        const local = getTrip(id)
        if (local) setRemoteTrip(local)
      }
      setResolving(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token, signedIn])

  const trip = useMemo(() => {
    if (tripId) {
      const local = getTrip(tripId)
      if (local) return local
    }
    return remoteTrip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, remoteTrip, nowIso, etaReadyTick])

  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail, {
    enabled: adsbPollEnabledForState(trip?.state),
    originIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.from.icao,
    destIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.to.icao,
  })

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
    const live = getTrip(trip.id) ?? trip
    return viewFromTrip(live, adsb, nowIso)
  }, [trip, adsb, nowIso, etaReadyTick])

  if (resolving || authLoading) return <PortalLoading />

  if (!tripId || (!trip && !remoteTrip)) {
    return (
      <PortalShell appNav>
        <h1 className="text-2xl font-semibold">Tracking link expired</h1>
        <p className="mt-2 text-sm text-muted">
          This link isn&apos;t recognized. Ask dispatch for a fresh link, or
          request a new trip below — no account needed.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/portal/request?mode=book"
            className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink"
          >
            Request a trip
          </Link>
          <Link
            to="/portal"
            className="inline-flex rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink"
          >
            Portal home
          </Link>
        </div>
      </PortalShell>
    )
  }

  if (!view) {
    return (
      <PortalShell appNav>
        <h1 className="text-xl font-semibold">Trip not found</h1>
        <p className="mt-2 text-sm text-muted">
          This tracking link couldn&apos;t load the trip. Request another move
          or ask the desk for a fresh link.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/portal/request?mode=book"
            className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink"
          >
            Request a trip
          </Link>
          <Link to="/portal" className="inline-flex px-4 py-2 text-sm text-gold">
            ← Portal home
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
  const { signedIn, loading: authLoading, setSession } = usePortalSession()
  const [remoteTrip, setRemoteTrip] = useState<TripStoreRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [etaReadyTick, setEtaReadyTick] = useState(0)
  const guest = readPortalGuestTrack()

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
    enabled: Boolean(signedIn) && adsbPollEnabledForState(trip?.state),
    originIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.from.icao,
    destIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.to.icao,
  })
  const view = trip ? viewFromTrip(trip, adsb, nowIso) : null

  if (authLoading || (signedIn && loading)) return <PortalLoading />

  // Guest who already has this trip's magic link — send them to track, not login.
  if (!signedIn && id && guest?.tripId === id && guest.token) {
    return <Navigate to={`/portal/track/${guest.token}`} replace />
  }

  if (!signedIn) {
    const nextHref = id ? `/portal/trips/${id}` : '/portal'
    return (
      <PortalShell appNav>
        <h1 className="text-xl font-semibold">Open live tracking</h1>
        <p className="mt-2 text-sm text-muted">
          Use the tracking link from your email, or sign in with a verified desk
          email. You can always request another trip without an account.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            to="/portal/request?mode=book"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-gold px-4 text-sm font-semibold text-ink"
          >
            Request another trip
          </Link>
          <Link
            to="/portal/request?mode=quote"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-ink"
          >
            Get a rough estimate
          </Link>
        </div>
        <div className="mt-8">
          <PortalOneClickLogin
            onSignedIn={setSession}
            nextHref={nextHref}
            title="Sign in for this trip"
            hint="Work email on file at the desk — opens your company portal."
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/portal" className="inline-flex px-4 py-2 text-sm text-gold">
            ← Portal home
          </Link>
        </div>
      </PortalShell>
    )
  }

  if (!view) {
    return (
      <PortalShell appNav>
        <h1 className="text-xl font-semibold">Trip not found</h1>
        <p className="mt-2 text-sm text-muted">
          Open a trip from your shipments list, or use the tracking link from
          email.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/portal/request?mode=book"
            className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink"
          >
            Request another trip
          </Link>
          <Link to="/portal" className="inline-flex px-4 py-2 text-sm text-gold">
            ← All shipments
          </Link>
        </div>
      </PortalShell>
    )
  }

  return <PortalTrackingBody view={view} tripId={trip?.id ?? id} />
}
