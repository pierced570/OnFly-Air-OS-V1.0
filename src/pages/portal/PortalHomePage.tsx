import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
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

function useRequests() {
  return useSyncExternalStore(subscribeRequests, listRequests, listRequests)
}

function usePortalClient() {
  useSyncExternalStore(subscribeClients, listClients, listClients)
  return getPortalClient()
}

/** Client-facing portal — request & track. Onboarding lives at /client (shareable). */
export default function PortalHomePage() {
  const requests = useRequests().filter((r) => r.source === 'portal')
  const client = usePortalClient()
  const [session, setSession] = useState<PortalSession | null>(null)
  const [trips, setTrips] = useState<PortalTripCard[]>([])
  const [loadingAuth, setLoadingAuth] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await getPortalAuthSession()
      if (cancelled) return
      setSession(s)
      if (s?.clientId) {
        const rows = await listPortalTripsForSession()
        if (!cancelled) setTrips(rows)
      }
      setLoadingAuth(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <header className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gold">
              OnFly Air
            </div>
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
                      setTrips([])
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

        {session && !session.clientId && (
          <section className="rounded-lg border border-[#C0392B]/40 bg-white p-5">
            <h2 className="font-medium">Email not linked</h2>
            <p className="mt-1 text-sm text-muted">
              {session.email} isn’t on a client contact yet. Ask dispatch to add
              you as a requester / supply-chain contact, then sign in again.
            </p>
          </section>
        )}

        {session?.clientId && (
          <section className="rounded-lg border border-border bg-surface-2 p-5">
            <h2 className="font-medium">Your trips</h2>
            <p className="mt-1 text-sm text-muted">
              Live status for your company only — no pricing or carrier details.
            </p>
            {trips.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted">
                No active trips yet.
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {trips.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-md border border-border bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">T-{t.ref}</span>
                      <span className="text-xs uppercase tracking-wider text-gold">
                        {t.state.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink">{t.lane || '—'}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t.ready_label}
                      {t.payload_summary ? ` · ${t.payload_summary}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {client ? (
          <section className="rounded-lg border border-border bg-surface-2 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium">{client.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  Ops {client.email || '—'} · Invoices {client.invoice_email || '—'}
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
        ) : !session ? (
          <section className="rounded-lg border border-border bg-surface-2 p-5">
            <h2 className="font-medium">Welcome</h2>
            <p className="mt-1 text-sm text-muted">
              Sign in with the email OnFly has on file to see your trips, or
              request a new trip below.
            </p>
            <Link
              to="/portal/login"
              className="mt-3 inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
            >
              Email magic link
            </Link>
          </section>
        ) : null}

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="font-medium">Your requests</h2>
          <p className="mt-1 text-sm text-muted">
            Trip requests you submit appear here. Live tracking unlocks after
            booking.
          </p>
          {requests.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted">
              No requests yet.
            </div>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {requests.map((r) => (
                <li key={r.id} className="rounded-md border border-border px-3 py-2">
                  #{r.ref} · {r.client_name || 'Request'}
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
      </main>
    </div>
  )
}
