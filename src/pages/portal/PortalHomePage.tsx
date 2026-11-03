import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { PortalLanding } from '@/components/PortalLanding'
import { PortalShell } from '@/components/PortalShell'
import { PortalShipmentsDashboard } from '@/components/PortalShipmentsDashboard'
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
import {
  buildPortalOpenRequestCards,
  portalRequestHelloLabel,
} from '@/domain/portalClientApp'

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

  useEffect(() => {
    const id = window.setInterval(() => setNowLabel(clockLabel()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Load company trips when signed in.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!session?.clientId) {
        if (!cancelled) setRemoteTrips([])
        return
      }
      setPortalClientId(session.clientId)
      const rows = await listPortalTripsForSession()
      if (!cancelled) setRemoteTrips(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [session?.clientId, session?.email])

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
      <button
        type="button"
        className="text-gold hover:text-gold-lt"
        onClick={() => {
          void endPortalSession().then(() => {
            setSession(null)
            setRemoteTrips([])
          })
        }}
      >
        Sign out
      </button>
    </>
  ) : null

  // Public ofaops home = client landing (no “resume last tracking link” CTA).
  if (!loadingAuth && !signedIn && !(session && !session.clientId)) {
    return (
      <PortalLanding
        onSignedIn={(s) => {
          setSession(s)
        }}
      />
    )
  }

  return (
    <PortalShell
      headerActions={headerActions}
      appNav={signedIn}
      wide={signedIn ? 'dashboard' : false}
      command={signedIn}
    >
      {loadingAuth ? (
        <p className="text-sm text-muted">Checking session…</p>
      ) : null}

      {session && !session.clientId ? (
        <section className="portal-glass-strong rounded-2xl border-[#C0392B]/35 p-5">
          <h2 className="font-medium text-ink">Email not verified</h2>
          <p className="mt-1 text-sm text-muted">
            {session.email} isn&apos;t set up for portal access yet. Verified
            emails will be routed to the correct client portal — contact OnFly
            if you need access, then sign in again.
          </p>
        </section>
      ) : null}

      {signedIn ? (
        <section className="space-y-6">
          {client ? (
            <div className="mb-3 flex flex-col items-start gap-1">
              <p className="text-lg font-semibold tracking-tight text-cream sm:text-xl">
                {portalRequestHelloLabel(client.name)}
              </p>
              <button
                type="button"
                className="text-sm text-cream/50 hover:text-gold"
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

          <PortalShipmentsDashboard
            shipments={liveCards.map((t) => {
              const trip = getTrip(t.id)
              return {
                id: t.id,
                ref: t.ref,
                state: t.state,
                lane: t.lane,
                ready_label: t.ready_label,
                payload_summary: t.payload_summary,
                trackHref: t.trackHref,
                nextLabel: t.nextLabel,
                phase: t.phase,
                requestedAt:
                  trip
                    ? [...trip.events]
                        .sort((a, b) => a.at.localeCompare(b.at))[0]?.at ??
                      trip.hard_quote?.sent_at ??
                      trip.invoice?.created_at ??
                      null
                    : null,
                poNumber: trip?.po_number ?? trip?.quick?.po ?? null,
              }
            })}
            pending={openRequestCards.map((r) => ({
              id: r.id,
              ref: r.ref,
              lane: r.lane,
              statusLabel: r.statusLabel,
              summary: r.summary,
              href: r.href,
              at: r.created_at ?? null,
            }))}
            summaryLine={summaryLine}
            nowLabel={nowLabel}
            email={session?.email}
          />
        </section>
      ) : null}
    </PortalShell>
  )
}
