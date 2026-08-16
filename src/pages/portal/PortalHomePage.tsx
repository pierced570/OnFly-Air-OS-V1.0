import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalHomeTripCard } from '@/components/PortalHomeTripCard'
import { PortalLanding } from '@/components/PortalLanding'
import { PortalShell } from '@/components/PortalShell'
import {
  clearPortalClient,
  getPortalClient,
  setPortalClientId,
} from '@/lib/clientOnboardStore'
import { listClients, subscribeClients } from '@/lib/clientStore'
import { listRequests, subscribeRequests } from '@/lib/requestStore'
import {
  endPortalSession,
  listPortalTripsForSession,
} from '@/lib/portalAuth'
import type { PortalTripCard } from '@/domain/portalAuth'
import { usePortalSession } from '@/hooks/usePortalSession'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'
import {
  buildPortalTrackingView,
  clientOpsStageLabel,
  summarizePortalShipments,
  tripToTrackingInput,
} from '@/domain/portalTracking'
import {
  clearPortalGuestTrack,
  readPortalGuestTrack,
  type PortalGuestTrack,
} from '@/lib/portalGuestTrack'
import {
  getPortalTrackRow,
  resolvePortalTrackTripId,
} from '@/lib/portalTrackStore'
import { ensurePortalTripTrackingReady } from '@/lib/portalTripHydrate'

function useRequests() {
  return useSyncExternalStore(subscribeRequests, listRequests, listRequests)
}

function usePortalClient() {
  useSyncExternalStore(subscribeClients, listClients, listClients)
  return getPortalClient()
}

function useLocalTrips() {
  return useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
}

type LiveCard = PortalTripCard & {
  trackHref: string
  etaHint: string | null
  nextLabel: string | null
  phase: ReturnType<typeof buildPortalTrackingView>['phase']
}

function clockLabel(now = new Date()): string {
  try {
    return now
      .toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
      .toUpperCase()
  } catch {
    return now.toISOString()
  }
}

/** Client-facing portal — shipments list matching branded mockups. */
export default function PortalHomePage() {
  const allRequests = useRequests().filter((r) => r.source === 'portal')
  const client = usePortalClient()
  const localTrips = useLocalTrips()
  const {
    session,
    loading: loadingAuth,
    signedIn,
    setSession,
  } = usePortalSession()
  const [remoteTrips, setRemoteTrips] = useState<PortalTripCard[]>([])
  const [nowLabel, setNowLabel] = useState(() => clockLabel())
  const [guest, setGuest] = useState<PortalGuestTrack | null>(() =>
    readPortalGuestTrack(),
  )
  const [guestTrip, setGuestTrip] = useState<TripStoreRow | null>(null)
  /** False while resolving a remembered track token (avoids empty-state flash). */
  const [guestReady, setGuestReady] = useState(() => !readPortalGuestTrack())

  useEffect(() => {
    const id = window.setInterval(() => setNowLabel(clockLabel()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Load company trips when signed in; clear guest memory (session hook also clears storage).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!session?.clientId) {
        if (!cancelled) setRemoteTrips([])
        return
      }
      setPortalClientId(session.clientId)
      setGuest(null)
      setGuestTrip(null)
      setGuestReady(true)
      const rows = await listPortalTripsForSession()
      if (!cancelled) setRemoteTrips(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [session?.clientId])

  // Magic-link guests: hydrate the trip they were tracking for "Your shipments".
  useEffect(() => {
    const g = readPortalGuestTrack()
    setGuest(g)
    if (!g || session?.clientId) {
      setGuestTrip(null)
      setGuestReady(true)
      return
    }
    setGuestReady(false)
    let cancelled = false
    void (async () => {
      const id =
        getPortalTrackRow(g.token)?.tripId ??
        g.tripId ??
        (await resolvePortalTrackTripId(g.token))
      if (cancelled) return
      if (!id) {
        clearPortalGuestTrack()
        setGuest(null)
        setGuestTrip(null)
        setGuestReady(true)
        return
      }
      const ready = await ensurePortalTripTrackingReady({
        tripId: id,
        token: g.token,
      })
      if (cancelled) return
      const trip = ready ?? getTrip(id)
      if (!trip) {
        // Stale sessionStorage token — drop it so Sign in / landing work.
        clearPortalGuestTrack()
        setGuest(null)
        setGuestTrip(null)
      } else {
        setGuestTrip(trip)
      }
      setGuestReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [session?.clientId, localTrips])

  const clientKey = session?.clientId || null

  const requests = useMemo(() => {
    if (!signedIn || !session) return []
    return allRequests.filter((r) => {
      if (clientKey && r.client_id === clientKey) return true
      if (
        session.email &&
        r.email?.trim().toLowerCase() === session.email.toLowerCase()
      ) {
        return true
      }
      return false
    })
  }, [allRequests, signedIn, session, clientKey])

  const liveCards: LiveCard[] = useMemo(() => {
    if (!signedIn || !clientKey) return []
    const byId = new Map<string, LiveCard>()

    const enrich = (card: PortalTripCard, href: string): LiveCard => {
      const trip = getTrip(card.id)
      if (!trip) {
        return {
          ...card,
          trackHref: href,
          etaHint: null,
          nextLabel: null,
          phase: 'other',
        }
      }
      const view = buildPortalTrackingView(tripToTrackingInput(trip))
      const activeOps = view.opsForecastRows.find((r) => r.status === 'active')
      return {
        ...card,
        trackHref: href,
        etaHint: null,
        nextLabel: activeOps
          ? clientOpsStageLabel(activeOps)
          : view.nextMilestoneLabel,
        phase: view.phase,
      }
    }

    for (const t of remoteTrips) {
      byId.set(t.id, enrich(t, `/portal/trips/${t.id}`))
    }

    for (const t of localTrips) {
      if (t.client_id !== clientKey) continue
      if (['closed', 'lost', 'cancelled'].includes(t.state)) continue
      if (byId.has(t.id)) continue
      byId.set(
        t.id,
        enrich(
          {
            id: t.id,
            ref: t.ref,
            state: t.state,
            lane: t.lane,
            ready_label: t.ready_label,
            payload_summary: t.payload_summary,
          },
          `/portal/trips/${t.id}`,
        ),
      )
    }

    return [...byId.values()].sort((a, b) => b.ref - a.ref)
  }, [remoteTrips, localTrips, clientKey, signedIn])

  const counts = useMemo(
    () => summarizePortalShipments(liveCards.map((c) => c.phase)),
    [liveCards],
  )

  const summaryLine = `${counts.inMotion} in motion · ${counts.onGround} on the ground · ${counts.delivered} delivered`

  const guestView = guestTrip
    ? buildPortalTrackingView(tripToTrackingInput(guestTrip))
    : null
  const guestCounts = guestView
    ? summarizePortalShipments([guestView.phase])
    : { inMotion: 0, onGround: 0, delivered: 0 }
  const guestSummary = guestView
    ? `${guestCounts.inMotion} in motion · ${guestCounts.onGround} on the ground · ${guestCounts.delivered} delivered`
    : 'Open your tracking link from email'

  const headerActions = session ? (
    <>
      <span className="hidden text-cream/60 md:inline">{session.email}</span>
      <Link to="/portal/request" className="text-gold hover:text-gold-lt">
        Request a trip
      </Link>
      <button
        type="button"
        className="text-gold hover:text-gold-lt"
        onClick={() => {
          void endPortalSession().then(() => {
            setSession(null)
            setRemoteTrips([])
            setGuest(null)
            setGuestTrip(null)
            setGuestReady(true)
          })
        }}
      >
        Sign out
      </button>
    </>
  ) : (
    <>
      <Link to="/portal/login" className="text-gold hover:text-gold-lt">
        Sign in
      </Link>
      <Link to="/portal/request" className="text-gold hover:text-gold-lt">
        Request a trip
      </Link>
    </>
  )

  // Dark gate from PDF — magic link + request CTA (no empty Welcome wall).
  if (
    !loadingAuth &&
    guestReady &&
    !signedIn &&
    !guest &&
    !(session && !session.clientId)
  ) {
    return <PortalLanding />
  }

  return (
    <PortalShell headerActions={headerActions}>
      {loadingAuth || (!signedIn && !guestReady) ? (
        <p className="text-sm text-muted">Checking session…</p>
      ) : null}

      {session && !session.clientId ? (
        <section className="rounded-md border border-[#C0392B]/40 bg-white p-5">
          <h2 className="font-medium">Email not linked</h2>
          <p className="mt-1 text-sm text-muted">
            {session.email} isn&apos;t linked to a company yet. Only approved
            work emails can sign in — ask OnFly to add your corporate domain
            (or this exact address) under Clients → Portal email domains, then
            sign in again.
          </p>
        </section>
      ) : null}

      {signedIn ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                Your shipments
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {liveCards.length === 0
                  ? 'No shipments yet'
                  : summaryLine}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="avionic text-[11px] text-muted">{nowLabel}</span>
              <Link
                to="/portal/request"
                className="rounded-md bg-gold px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink hover:bg-gold-lt"
              >
                Request a trip
              </Link>
            </div>
          </div>

          {liveCards.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-white/60 p-6 text-sm text-muted">
              After booking you&apos;ll see live cards here — in flight, on the
              truck, and delivered with POD.
            </div>
          ) : (
            <ul className="space-y-4">
              {liveCards.map((t) => (
                <PortalHomeTripCard
                  key={t.id}
                  id={t.id}
                  tripRef={t.ref}
                  state={t.state}
                  lane={t.lane}
                  ready_label={t.ready_label}
                  payload_summary={t.payload_summary}
                  trackHref={t.trackHref}
                  etaHint={t.etaHint}
                  nextLabel={t.nextLabel}
                />
              ))}
            </ul>
          )}

          {client ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted">
              <span>
                {client.name}
                {client.profile.front_desk_phone
                  ? ` · Desk ${client.profile.front_desk_phone}`
                  : ''}
              </span>
              <button
                type="button"
                className="text-muted hover:text-ink"
                onClick={() => clearPortalClient()}
              >
                Switch company
              </button>
            </div>
          ) : null}

          {requests.length > 0 ? (
            <div className="text-xs text-muted">
              {requests.length} open request
              {requests.length === 1 ? '' : 's'} ·{' '}
              <Link to="/portal/request" className="text-gold">
                New request
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Magic-link guest (not signed in) — same chrome, trip from last track token */}
      {!signedIn &&
      guestReady &&
      guest &&
      !loadingAuth &&
      !(session && !session.clientId) ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                Your shipments
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {guestView ? guestSummary : 'Track your shipment'}
              </h1>
              <p className="mt-1 text-sm text-muted">
                Showing the trip from your tracking link. Sign in to see every
                shipment for your company.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="avionic text-[11px] text-muted">{nowLabel}</span>
              <Link
                to="/portal/login"
                className="rounded-md bg-gold px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink hover:bg-gold-lt"
              >
                Sign in
              </Link>
            </div>
          </div>

          {guestTrip && guest ? (
            <ul className="space-y-4">
              <PortalHomeTripCard
                id={guestTrip.id}
                tripRef={guestTrip.ref}
                state={guestTrip.state}
                lane={guestTrip.lane}
                ready_label={guestTrip.ready_label}
                payload_summary={guestTrip.payload_summary}
                trackHref={`/portal/track/${guest.token}`}
                etaHint={null}
                nextLabel={(() => {
                  const active = guestView?.opsForecastRows.find(
                    (r) => r.status === 'active',
                  )
                  return active
                    ? clientOpsStageLabel(active)
                    : guestView?.nextMilestoneLabel ?? null
                })()}
              />
            </ul>
          ) : null}

          <div className="text-xs text-muted">
            Need a new move?{' '}
            <Link to="/portal/request" className="text-gold">
              Request a trip
            </Link>
          </div>
        </section>
      ) : null}
    </PortalShell>
  )
}
