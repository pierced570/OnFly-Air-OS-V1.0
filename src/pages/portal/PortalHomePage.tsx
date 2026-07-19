import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  clearPortalClient,
  getPortalClient,
} from '@/lib/clientOnboardStore'
import { listClients, subscribeClients } from '@/lib/clientStore'
import { listRequests, subscribeRequests } from '@/lib/requestStore'

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

  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <header className="border-b border-border px-6 py-4">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly Air</div>
        <h1 className="text-xl font-semibold">Client portal</h1>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 p-6">
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
                {client.profile.frequent_lanes &&
                  client.profile.frequent_lanes.length > 0 && (
                    <p className="avionic mt-2 text-xs text-muted">
                      Frequent:{' '}
                      {client.profile.frequent_lanes
                        .map((l) => `${l.origin}→${l.destination}`)
                        .join(' · ')}
                    </p>
                  )}
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
        ) : (
          <section className="rounded-lg border border-border bg-surface-2 p-5">
            <h2 className="font-medium">Welcome</h2>
            <p className="mt-1 text-sm text-muted">
              Request trips and watch status here. If OnFly sent you a setup link,
              use that first — it is separate from this portal.
            </p>
          </section>
        )}

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="font-medium">Your requests</h2>
          <p className="mt-1 text-sm text-muted">
            Trip requests you submit appear here. Live tracking unlocks after booking.
          </p>
          {requests.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted">
              No requests yet.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="avionic font-medium">R-{r.ref}</span>
                    <span className="ml-2 text-muted">{r.lane}</span>
                    <div className="text-xs text-muted">{r.summary}</div>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/portal/request"
            className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
          >
            Request a trip
          </Link>
        </div>
      </main>
    </div>
  )
}
