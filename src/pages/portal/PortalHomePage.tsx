import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalHomeTripCard } from '@/components/PortalHomeTripCard'
import { PortalInstallBanner } from '@/components/PortalInstallBanner'
import { PortalLanding } from '@/components/PortalLanding'
import { PortalShell } from '@/components/PortalShell'
import {
  clearPortalClient,
  getPortalClient,
  setPortalClientId,
} from '@/lib/clientOnboardStore'
import { listClients, sameClientId, subscribeClients } from '@/lib/clientStore'
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
} from '@/lib/tripStore'
import {
  buildPortalTrackingView,
  clientOpsStageLabel,
  summarizePortalShipments,
  tripToTrackingInput,
} from '@/domain/portalTracking'
import { buildPortalOpenRequestCards } from '@/domain/portalClientApp'
import {
  readPortalGuestTrack,
  type PortalGuestTrack,
} from '@/lib/portalGuestTrack'

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
  /** Token only — landing stays black; optional "Continue tracking" CTA. */
  const [guest, setGuest] = useState<PortalGuestTrack | null>(() =>
    readPortalGuestTrack(),
  )

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
      const rows = await listPortalTripsForSession()
      if (!cancelled) setRemoteTrips(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [session?.clientId, session?.email])

  // Keep a light pointer to the last magic-link track (no trip hydrate on home).
  useEffect(() => {
    if (session?.clientId) {
      setGuest(null)
      return
    }
    setGuest(readPortalGuestTrack())
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

  const openRequestCards = useMemo(
    () => buildPortalOpenRequestCards(requests),
    [requests],
  )

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
      const sameCompany = sameClientId(t.client_id, clientKey)
      const onTrip =
        Boolean(session?.email) &&
        t.participants.some(
          (p) =>
            p.email?.trim().toLowerCase() === session!.email.toLowerCase() &&
            ['client', 'client_ap', 'client_supply'].includes(p.role),
        )
      if (!sameCompany && !onTrip) continue
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
  }, [remoteTrips, localTrips, clientKey, signedIn, session?.email])

  const counts = useMemo(
    () => summarizePortalShipments(liveCards.map((c) => c.phase)),
    [liveCards],
  )

  const summaryLine = `${counts.inMotion} in motion · ${counts.onGround} on the ground · ${counts.delivered} delivered`

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
            setGuest(readPortalGuestTrack())
          })
        }}
      >
        Sign out
      </button>
    </>
  ) : (
    <>
      <Link
        to="/portal/request?mode=book"
        className="text-gold hover:text-gold-lt"
      >
        Book
      </Link>
      <Link
        to="/portal/request?mode=quote"
        className="text-gold hover:text-gold-lt"
      >
        Rough quote
      </Link>
    </>
  )

  // Black booking gate is the public home — never skip it for guests just
  // because a tracking token is remembered (that felt like "inside a portal").
  if (!loadingAuth && !signedIn && !(session && !session.clientId)) {
    return (
      <PortalLanding
        continueTrackHref={
          guest?.token ? `/portal/track/${guest.token}` : null
        }
        onSignedIn={(s) => {
          setSession(s)
          setGuest(null)
        }}
      />
    )
  }

  return (
    <PortalShell headerActions={headerActions} appNav={signedIn}>
      {loadingAuth ? (
        <p className="text-sm text-muted">Checking session…</p>
      ) : null}

      {session && !session.clientId ? (
        <section className="rounded-md border border-[#C0392B]/40 bg-white p-5">
          <h2 className="font-medium">Email not verified</h2>
          <p className="mt-1 text-sm text-muted">
            {session.email} isn&apos;t set up for portal access yet. Verified
            emails will be routed to the correct client portal — contact OnFly
            if you need access, then sign in again.
          </p>
        </section>
      ) : null}

      {signedIn ? (
        <section className="space-y-5">
          <PortalInstallBanner variant="cream" defaultOpen />

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
              <p className="mt-1 text-sm text-muted">
                One-tap book a charter or logistics move — or open a live trip.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <span className="avionic text-[11px] text-muted">{nowLabel}</span>
              <Link
                to="/portal/request"
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md bg-gold px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink hover:bg-gold-lt sm:flex-none"
              >
                Book a trip
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
                onClick={() => {
                  void endPortalSession().then(() => {
                    setSession(null)
                    setRemoteTrips([])
                    clearPortalClient()
                  })
                }}
              >
                Switch company
              </button>
            </div>
          ) : null}

          {openRequestCards.length > 0 ? (
            <div className="space-y-3 border-t border-border/60 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                  Open quotes &amp; requests
                </h2>
                <Link to="/portal/request?mode=quote" className="text-xs text-gold">
                  New rough quote
                </Link>
              </div>
              <ul className="space-y-2">
                {openRequestCards.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={r.href}
                      className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-[#E5DFD0] bg-white px-4 py-3 active:bg-[#F7F2E3]"
                    >
                      <div className="min-w-0">
                        <div className="avionic text-sm font-semibold text-ink">
                          R-{r.ref} · {r.lane}
                        </div>
                        <p className="truncate text-xs text-muted">
                          {r.statusLabel} · {r.summary}
                        </p>
                      </div>
                      <span className="shrink-0 text-gold" aria-hidden>
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 border-t border-border/60 pt-4 text-xs">
            <Link to="/portal/history" className="font-semibold text-gold">
              Prior trips, POs &amp; invoices →
            </Link>
            <Link to="/portal/account" className="text-muted hover:text-ink">
              Account
            </Link>
          </div>
        </section>
      ) : null}
    </PortalShell>
  )
}
