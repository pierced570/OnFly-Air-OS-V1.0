import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { BrandLockup } from '@/components/BrandLockup'
import { PortalHomeTripCard } from '@/components/PortalHomeTripCard'
import {
  clearPortalClient,
  getPortalClient,
} from '@/lib/clientOnboardStore'
import { listClients, subscribeClients } from '@/lib/clientStore'
import { listRequests, subscribeRequests } from '@/lib/requestStore'
import {
  getPortalAuthSession,
  listPortalTripsForSession,
  signOutPortal,
} from '@/lib/portalAuth'
import type { PortalSession, PortalTripCard } from '@/domain/portalAuth'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
} from '@/domain/portalTracking'

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
}

/** Client-facing portal — request & track. Onboarding lives at /client (shareable). */
export default function PortalHomePage() {
  const allRequests = useRequests().filter((r) => r.source === 'portal')
  const client = usePortalClient()
  const localTrips = useLocalTrips()
  const [session, setSession] = useState<PortalSession | null>(null)
  const [remoteTrips, setRemoteTrips] = useState<PortalTripCard[]>([])
  const [loadingAuth, setLoadingAuth] = useState(true)

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
      setLoadingAuth(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signedIn = Boolean(session?.clientId)
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
        }
      }
      const view = buildPortalTrackingView(tripToTrackingInput(trip))
      return {
        ...card,
        trackHref: href,
        etaHint: view.projectedDisplay,
        nextLabel: view.nextMilestoneLabel,
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

  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <header className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <BrandLockup showTagline={false} />
            <h1 className="text-xl font-semibold">Client portal</h1>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {session ? (
              <>
                <span className="text-muted">{session.email}</span>
                <button
                  type="button"
                  className="text-gold"
                  onClick={() => {
                    void signOutPortal().then(() => {
                      setSession(null)
                      setRemoteTrips([])
                    })
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/portal/login" className="text-gold">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        {loadingAuth ? (
          <p className="text-sm text-muted">Checking session…</p>
        ) : null}

        {!session ? (
          <section className="rounded-lg border border-border bg-surface-2 p-5">
            <h2 className="font-medium">Welcome</h2>
            <p className="mt-1 text-sm text-muted">
              Sign in with the email OnFly has on file to see your company&apos;s
              trips in motion and your requests. Tracking links from ETA emails
              still work without signing in.
            </p>
            <Link
              to="/portal/login"
              className="mt-3 inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
            >
              Email magic link
            </Link>
          </section>
        ) : null}

        {session && !session.clientId && (
          <section className="rounded-lg border border-[#C0392B]/40 bg-white p-5">
            <h2 className="font-medium">Email not linked</h2>
            <p className="mt-1 text-sm text-muted">
              {session.email} isn&apos;t granted portal access yet. Ask OnFly to
              add your email under Portal access for your company, then sign in
              again.
            </p>
          </section>
        )}

        {signedIn && (
          <section className="rounded-lg border border-border bg-white p-5">
            <h2 className="font-medium">Trips in motion</h2>
            <p className="mt-1 text-sm text-muted">
              Date, routing, live map, and cargo for your company — no pricing or
              carrier names.
            </p>
            {liveCards.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted">
                No active trips yet. After booking you&apos;ll see them here and
                get a magic tracking link by email.
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
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
          </section>
        )}

        {signedIn && client ? (
          <section className="rounded-lg border border-border bg-surface-2 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium">{client.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  Ops {client.email || '—'} · Invoices{' '}
                  {client.invoice_email || '—'}
                  {client.profile.front_desk_phone
                    ? ` · Desk ${client.profile.front_desk_phone}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted hover:text-ink"
                onClick={() => clearPortalClient()}
              >
                Switch company
              </button>
            </div>
          </section>
        ) : null}

        {signedIn ? (
          <section className="rounded-lg border border-border bg-surface-2 p-5">
            <h2 className="font-medium">Your requests</h2>
            <p className="mt-1 text-sm text-muted">
              Trip requests for your company. Live tracking unlocks after booking.
            </p>
            {requests.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted">
                No requests yet.
              </div>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {requests.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-md border border-border px-3 py-2"
                  >
                    #{r.ref} · {r.client_name || 'Request'} · {r.lane}
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/portal/request"
              className="mt-4 inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
            >
              Request a trip
            </Link>
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-surface-2 p-5">
            <h2 className="font-medium">Need a trip?</h2>
            <p className="mt-1 text-sm text-muted">
              You can submit a new request without signing in. Sign in above to
              see trips already moving for your company.
            </p>
            <Link
              to="/portal/request"
              className="mt-4 inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
            >
              Request a trip
            </Link>
          </section>
        )}
      </main>
    </div>
  )
}
