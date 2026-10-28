/**
 * Live client tracking — track token identifies the trip; live updates need
 * a signed-in portal session (or magic link with next=/portal/trips/:id).
 * Cream client theme. Never shows cost, margin, or operator identity.
 */

import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { PortalTrackingBody } from '@/components/PortalTrackingBody'
import { PortalMagicLinkLogin } from '@/components/PortalMagicLinkLogin'
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

function TrackSignInGate(props: {
  trip: TripStoreRow
  tripId: string
  trackToken?: string
}) {
  const nextHref = `/portal/trips/${props.tripId}`
  const lane = props.trip.lane_label || props.trip.lane || 'Your shipment'
  const ref = props.trip.ref
  return (
    <PortalShell>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        Tracking link
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">
        Sign in for live updates
      </h1>
      <p className="mt-2 text-sm text-muted">
        We found{' '}
        <span className="avionic font-medium text-ink">
          {ref ? `T-${ref}` : 'your trip'}
        </span>
        {lane ? (
          <>
            {' '}
            · <span className="text-ink">{lane}</span>
          </>
        ) : null}
        . Live ETAs, stage progress, and status pushes need a portal account —
        soft and hard quotes stay open without one.
      </p>
      <div className="mt-6">
        <PortalMagicLinkLogin
          nextHref={nextHref}
          title="Email me a link to track"
          hint="We'll send a one-time sign-in link to open live tracking for this trip."
          submitLabel="Email me a link to track"
          compact
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          to={`/portal/login?next=${encodeURIComponent(nextHref)}`}
          className="inline-flex rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink"
        >
          Other sign-in options
        </Link>
        <Link to="/portal" className="inline-flex px-4 py-2 text-sm text-gold">
          ← Book or quote (no account)
        </Link>
      </div>
      {props.trackToken ? (
        <p className="mt-6 text-xs text-muted">
          Keep this link — after you sign in, it opens the same trip.
        </p>
      ) : null}
    </PortalShell>
  )
}

/** Magic-link tracker `/portal/track/:token` — soft-gate: identify trip, require session for live body. */
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
        // Remember identity for home "your shipment" — live body still needs session.
        const session = await getPortalAuthSession()
        if (!session?.clientId) {
          rememberPortalGuestTrack({ token, tripId: id })
        }
      }
      if (id && canPersist()) {
        // Hydrate portal-safe shell for identity even when gated; live ADS-B
        // + PortalTrackingBody stay behind signed-in below.
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

  const input = trip && signedIn ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail, {
    enabled: Boolean(signedIn) && adsbPollEnabledForState(trip?.state),
    originIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.from.icao,
    destIcao: input?.eta_chain.find((l) => l.type === 'air_leg')?.to.icao,
  })

  useEffect(() => {
    if (!signedIn || !trip?.id || !adsb) return
    if (adsb.takeoffIsActual !== true && adsb.landingIsActual !== true) return
    void import('@/lib/applyAdsbActuals').then((m) => {
      m.applyAdsbActualsToTrip(trip.id, adsb, { nowIso })
    })
  }, [
    signedIn,
    trip?.id,
    adsb?.tail,
    adsb?.lastTakeoffAt,
    adsb?.lastLandingAt,
    adsb?.takeoffIsActual,
    adsb?.landingIsActual,
    nowIso,
  ])

  const view = useMemo(() => {
    if (!signedIn || !trip) return null
    const live = getTrip(trip.id) ?? trip
    return viewFromTrip(live, adsb, nowIso)
  }, [signedIn, trip, adsb, nowIso, etaReadyTick])

  if (resolving || authLoading) return <PortalLoading />

  if (!tripId || (!trip && !remoteTrip)) {
    return (
      <PortalShell>
        <h1 className="text-2xl font-semibold">Tracking link expired</h1>
        <p className="mt-2 text-sm text-muted">
          This link isn&apos;t recognized. Ask dispatch for a fresh link, or
          sign in to see your company&apos;s shipments.
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
            Book or quote
          </Link>
        </div>
      </PortalShell>
    )
  }

  if (!signedIn) {
    const identified = trip ?? remoteTrip
    if (!identified || !tripId) return <PortalLoading />
    return (
      <TrackSignInGate
        trip={identified}
        tripId={tripId}
        trackToken={token}
      />
    )
  }

  if (!view) {
    return (
      <PortalShell>
        <h1 className="text-xl font-semibold">Trip not found</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in worked, but this trip isn&apos;t available on your account.
          Open shipments from your list or ask the desk for a fresh link.
        </p>
        <Link to="/portal" className="mt-4 inline-block text-gold">
          ← All shipments
        </Link>
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
    const nextHref = id ? `/portal/trips/${id}` : '/portal'
    return (
      <PortalShell>
        <h1 className="text-xl font-semibold">Sign in to track</h1>
        <p className="mt-2 text-sm text-muted">
          Live tracking needs a portal sign-in. Soft and hard quotes still work
          without an account.
        </p>
        <div className="mt-6">
          <PortalMagicLinkLogin
            nextHref={nextHref}
            title="Email me a link to track"
            hint="We'll send a one-time sign-in link for live updates on this trip."
            submitLabel="Email me a link to track"
            compact
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to={`/portal/login?next=${encodeURIComponent(nextHref)}`}
            className="inline-flex rounded-md border border-border px-4 py-2 text-sm font-semibold text-ink"
          >
            Other sign-in options
          </Link>
          <Link to="/portal" className="inline-flex px-4 py-2 text-sm text-gold">
            ← Book or quote
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
          Open a trip from your shipments list, or use the tracking link from
          email after you sign in.
        </p>
        <Link to="/portal" className="mt-4 inline-block text-gold">
          ← All shipments
        </Link>
      </PortalShell>
    )
  }

  return <PortalTrackingBody view={view} tripId={trip?.id ?? id} />
}
