/**
 * Client tracking — live ETAs / updates / contacts.
 * Never show pricing, vendor cost, invoices, or hard-quote totals.
 */

import { Link, useParams } from 'react-router-dom'
import { useMemo, useSyncExternalStore } from 'react'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'
import {
  computeEtaSheetFromBookedTrip,
  computeEtaSheetLinesFromQuick,
} from '@/lib/etaSheet'
import { getPortalTrackRow } from '@/lib/portalTrackStore'

const CLIENT_SAFE_EVENTS = new Set([
  'offer_ping',
  'offer_reply',
  'create_thread',
  'eta_sheet_sent',
  'leg_check_in',
  'leg_complete',
  'one_tap',
  'pod',
  'wx_brief',
  'state_change',
])

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toISOString().replace('.000Z', 'Z')
  } catch {
    return '—'
  }
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    dispatcher: 'OnFly dispatch',
    operator_ops: 'Operator ops',
    pilot: 'Pilot',
    fbo: 'FBO',
    driver: 'Ground / truck',
    client: 'Client',
    client_supply: 'Supply chain',
    other: 'Contact',
  }
  return map[role] ?? role.replace(/_/g, ' ')
}

function clientSafeTripView(trip: TripStoreRow) {
  const sheet = computeEtaSheetFromBookedTrip(trip)
  const quickLines = trip.quick
    ? computeEtaSheetLinesFromQuick(trip.quick)
    : sheet?.lines ?? []
  const updates = [...trip.events]
    .filter((e) => CLIENT_SAFE_EVENTS.has(e.kind) || e.kind.startsWith('leg_'))
    .filter((e) => {
      // Strip anything that smells like money
      const p = JSON.stringify(e.payload ?? {})
      return !/\$|price|invoice|qb|cost|margin/i.test(p + e.kind)
    })
    .slice(-12)
    .reverse()

  return {
    ref: trip.ref,
    lane: trip.lane,
    state: trip.state,
    ready_label: trip.ready_label,
    payload_summary: trip.payload_summary,
    etaLines: quickLines,
    tail: sheet?.tail ?? trip.quick?.tail ?? null,
    operator_name: sheet?.operator_name ?? trip.quick?.operator_name ?? null,
    aircraft_type: sheet?.aircraft_type ?? trip.quick?.aircraft_type ?? null,
    legs: trip.legs.map((l) => ({
      id: l.id,
      seq: l.seq,
      label: l.label,
      status: l.status,
      origin: l.origin,
      dest: l.dest,
      est_start: l.est_start,
      est_end: l.est_end,
      actual_start: l.actual_start,
      actual_end: l.actual_end,
      party: l.party,
    })),
    contacts: trip.participants.map((p) => ({
      id: p.id,
      role: p.role,
      name: p.name,
      cell: p.cell,
      email: p.email,
    })),
    updates,
  }
}

export default function PortalTrackPage() {
  // Live-subscribe so one-tap / leg updates refresh this view
  useSyncExternalStore(subscribeTrips, listTripsStable, () => [])

  const { token } = useParams()
  const row = useMemo(() => {
    if (!token) return null
    return getPortalTrackRow(token)
  }, [token])

  const view = useMemo(() => {
    if (!row) return null
    const trip = getTrip(row.tripId)
    if (!trip) return null
    return clientSafeTripView(trip)
  }, [row])

  if (!row || !view) {
    return (
      <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
        <div className="mx-auto max-w-xl space-y-3">
          <h1 className="text-2xl font-semibold">Tracking link expired</h1>
          <p className="text-sm text-muted">
            This magic link isn’t recognized in the current session. Ask
            dispatch for a fresh link.
          </p>
          <Link
            to="/portal"
            className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
          >
            Back to portal
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            OnFly Air
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            Tracking · T-{view.ref}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {view.lane}
            {view.tail ? ` · ${view.tail}` : ''}
            {view.aircraft_type ? ` · ${view.aircraft_type}` : ''}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-gold">
            Status · {view.state.replace(/_/g, ' ')}
          </p>
        </header>

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            ETA sheet
          </h2>
          {view.etaLines.length === 0 ? (
            <p className="mt-3 text-sm text-muted">ETA unavailable.</p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {view.etaLines.map((l) => (
                <li
                  key={l.seq}
                  className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{l.leg_label}</div>
                    <div className="text-xs text-muted">
                      {l.pickup_location} → {l.where_going}
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    Pickup {l.pickup_time_zulu} · Arrive {l.arrive_time_zulu}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Trip sections
          </h2>
          {view.legs.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Leg timeline will appear once dispatch builds the execution chain.
            </p>
          ) : (
            <ol className="mt-3 space-y-3 text-sm">
              {view.legs.map((l) => (
                <li
                  key={l.id}
                  className="border-b border-border/40 pb-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium">
                      {l.seq}. {l.label}
                    </div>
                    <span className="text-xs uppercase tracking-wide text-muted">
                      {l.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {(l.origin || '—') + ' → ' + (l.dest || '—')}
                    {l.party ? ` · ${l.party}` : ''}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-muted">Est start</dt>
                      <dd className="avionic">{fmtWhen(l.est_start)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Est end</dt>
                      <dd className="avionic">{fmtWhen(l.est_end)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Actual start</dt>
                      <dd className="avionic">{fmtWhen(l.actual_start)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Actual end</dt>
                      <dd className="avionic">{fmtWhen(l.actual_end)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Contacts by section
          </h2>
          {view.contacts.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No contacts on file yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {view.contacts.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-2 last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{c.name || '—'}</div>
                    <div className="text-xs text-muted">{roleLabel(c.role)}</div>
                  </div>
                  <div className="text-xs text-muted">
                    {c.cell ? <div>{c.cell}</div> : null}
                    {c.email ? <div>{c.email}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Live updates
          </h2>
          {view.updates.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Updates will show here as legs check in and status changes.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {view.updates.map((u, i) => (
                <li
                  key={`${u.at}-${u.kind}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-2 last:border-b-0"
                >
                  <div>
                    <div className="font-medium">
                      {u.kind.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-muted">{u.actor}</div>
                  </div>
                  <div className="avionic text-xs text-muted">{fmtWhen(u.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link
          to="/portal"
          className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
        >
          Back to portal
        </Link>
      </div>
    </div>
  )
}
