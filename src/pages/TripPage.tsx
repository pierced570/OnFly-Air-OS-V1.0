import { Link, useParams } from 'react-router-dom'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { clearAwbFlag, tripNeedsAwb } from '@/lib/awbFlagFlow'
import {
  createInvoiceForTrip,
  getTrip,
  listTripsStable,
  safeTransitionTrip,
  subscribeTrips,
} from '@/lib/tripStore'
import { clientRuleChips } from '@/lib/clientStore'
import { canTransition } from '@/domain/stateMachine'
import { PipelineStrip } from '@/components/PipelineStrip'
import { EtaSheetPanel } from '@/components/EtaSheetPanel'
import { ParticipantsPanel } from '@/components/ParticipantsPanel'
import { TripThreadPanel } from '@/components/TripThreadPanel'
import { PortalTripChat } from '@/components/PortalTripChat'
import { SubmittedQuotesHistory } from '@/components/SubmittedQuotesHistory'
import { listSubmittedQuotes } from '@/domain/offerRecipients'
import {
  acknowledgeCheckpoint,
  listCheckpoints,
  scheduleCheckpointsForTrip,
  subscribeCheckpoints,
} from '@/lib/checkpointStore'

export default function TripPage() {
  const { id } = useParams()
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const allChecks = useSyncExternalStore(
    subscribeCheckpoints,
    listCheckpoints,
    listCheckpoints,
  )
  const trip = id ? getTrip(id) : null
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const tripChecks = useMemo(
    () =>
      allChecks.filter(
        (c) =>
          c.trip_id === id &&
          (c.status === 'scheduled' || c.status === 'fired'),
      ),
    [allChecks, id],
  )

  const ruleChips = useMemo(
    () => (trip?.client_id ? clientRuleChips(trip.client_id) : []),
    [trip?.client_id],
  )

  if (!trip) {
    return (
      <div className="p-8">
        <h1 className="text-xl text-cream">Trip not found</h1>
        <p className="mt-2 text-sm text-muted">
          Open a trip from Dispatch center, or create one with{' '}
          <Link className="text-gold" to="/dispatch?tool=quick">
            Quick Dispatch
          </Link>
          .
        </p>
        <Link to="/dispatch" className="mt-4 inline-block text-sm text-gold">
          ← Dispatch center
        </Link>
      </div>
    )
  }

  const q = trip.quick
  const margin = q != null ? q.client_price - q.vendor_cost : null
  const nextStates = (
    ['in_progress', 'delivered', 'invoiced', 'closed', 'cancelled', 'lost'] as const
  ).filter((to) => canTransition(trip.state, to))
  const quoteHistory = listSubmittedQuotes(trip.offers, {
    // After book, only the winning operator stays on the waterfall.
    includeStoodDown: !['booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(
      trip.state,
    ),
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            {q ? 'Quick dispatch · execution' : 'Trip execution'}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            T-<span className="avionic">{trip.ref}</span>
            {q?.po ? (
              <span className="ml-2 text-base font-normal text-muted">PO {q.po}</span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted">
            <span className="avionic">{trip.lane}</span>
            {' · '}
            {trip.payload_summary}
            {' · '}
            {trip.ready_label}
          </p>
          {q && (
            <p className="mt-1 text-sm text-cream">
              {q.client_name}
              {q.operator_name ? ` · ${q.operator_name}` : ''}
              {q.tail ? <span className="avionic"> · {q.tail}</span> : null}
            </p>
          )}
          {ruleChips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {ruleChips.map((c) => (
                <span
                  key={c}
                  className="rounded border border-gold/30 px-2 py-0.5 text-[11px] text-gold"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="w-full space-y-2 sm:w-auto sm:text-right">
          <div className="inline-flex rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
            <span className="avionic font-medium">{trip.state}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {nextStates.map((to) => (
              <button
                key={to}
                type="button"
                className="min-h-10 rounded border border-border px-3 py-2 text-xs text-muted hover:text-cream"
                onClick={() => {
                  try {
                    safeTransitionTrip(trip.id, to, 'dispatcher')
                  } catch {
                    /* illegal */
                  }
                }}
              >
                → {to}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="rounded-lg border border-border bg-surface p-3">
        <PipelineStrip state={trip.state} />
      </div>

      {tripNeedsAwb(trip) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-gold">AWB needed</div>
            <p className="mt-0.5 text-xs text-cream/90">
              International cargo — create a House Air Waybill for this trip.
            </p>
          </div>
          <button
            type="button"
            className="min-h-10 rounded-md bg-gold px-3 py-2 text-xs font-medium text-ink"
            onClick={() => clearAwbFlag(trip.id)}
          >
            Mark AWB created
          </button>
        </div>
      )}

      <EtaSheetPanel trip={trip} />

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">One-tap legs</h2>
        {trip.legs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No execution legs yet — book via Quick Dispatch or accept an offer.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {trip.legs.map((leg) => (
              <li
                key={leg.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 text-sm last:border-0"
              >
                <div>
                  <span className="text-muted">#{leg.seq}</span>{' '}
                  <span className="text-cream">{leg.label}</span>
                  <span className="ml-2 avionic text-xs text-muted">{leg.status}</span>
                  {leg.origin && leg.dest && (
                    <span className="ml-2 avionic text-xs text-muted">
                      {leg.origin}→{leg.dest}
                    </span>
                  )}
                </div>
                <Link
                  to={`/t/${leg.one_tap_token}`}
                  className="text-xs text-gold hover:text-gold-lt"
                  target="_blank"
                >
                  One-tap →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gold/30 bg-gold/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            Check-in timers
          </h2>
          {(trip.state === 'booked' || trip.state === 'in_progress') &&
            tripChecks.length === 0 && (
              <button
                type="button"
                className="text-xs text-gold underline"
                onClick={() => scheduleCheckpointsForTrip(trip.id)}
              >
                Schedule check-ins
              </button>
            )}
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Auto-scheduled on dispatch: aircraft T-60/T-30/arrival, truck T-30/T-5,
          overdue watchdogs → Board exception queue (no auto SMS).
        </p>
        {tripChecks.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No timers yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tripChecks.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-2 border-b border-border/40 pb-2 text-sm last:border-0"
              >
                <div>
                  <span
                    className={
                      c.status === 'fired' ? 'text-late' : 'text-cream'
                    }
                  >
                    {c.title}
                  </span>
                  <div className="avionic text-[11px] text-muted">
                    {c.fire_at.slice(11, 16)}Z · {c.party} · {c.status}
                  </div>
                </div>
                <div className="flex gap-2">
                  {c.one_tap_token && (
                    <Link
                      to={`/t/${c.one_tap_token}`}
                      className="text-xs text-gold"
                    >
                      One-tap
                    </Link>
                  )}
                  {c.status === 'scheduled' && (
                    <button
                      type="button"
                      className="text-xs text-muted"
                      onClick={() => acknowledgeCheckpoint(c.id)}
                    >
                      Skip
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ParticipantsPanel trip={trip} />

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Documents</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {trip.documents.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span className="text-cream">{d.title}</span>
                <span className="avionic text-xs text-muted">{d.kind}</span>
              </li>
            ))}
            {trip.documents.length === 0 && (
              <li className="text-muted">No documents yet.</li>
            )}
          </ul>
          <Link
            to={`/trips/${trip.id}/manifest`}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-xs text-cream hover:border-gold/40"
          >
            Open load manifest
          </Link>
          {trip.state === 'delivered' && !trip.invoice && (
            <button
              type="button"
              disabled={invoiceBusy}
              className="mt-3 min-h-11 rounded-md bg-gold px-3 py-2 text-xs font-medium text-ink"
              onClick={() => {
                setInvoiceBusy(true)
                void createInvoiceForTrip(trip.id, { skipEmail: true }).finally(() =>
                  setInvoiceBusy(false),
                )
              }}
            >
              {invoiceBusy ? 'Creating…' : 'Create invoice'}
            </button>
          )}
          {trip.invoice && (
            <p className="mt-3 text-xs text-onplan">
              Invoice {trip.invoice.qb_invoice_id} · {trip.invoice.status} · $
              {trip.invoice.total.toLocaleString()}
            </p>
          )}
        </section>
      </div>

      {q && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs text-muted">Vendor</div>
            <div className="avionic text-lg text-cream">
              ${q.vendor_cost.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs text-muted">Client</div>
            <div className="avionic text-lg text-cream">
              ${q.client_price.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs text-muted">Margin</div>
            <div className="avionic text-lg text-gold">
              {margin == null ? '—' : `$${margin.toLocaleString()}`}
            </div>
          </div>
        </section>
      )}

      <PortalTripChat tripId={trip.id} variant="desk" />

      <TripThreadPanel trip={trip} />

      {quoteHistory.length > 0 ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <SubmittedQuotesHistory rows={quoteHistory} />
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Event log</h2>
        <ul className="mt-3 space-y-2">
          {trip.events.map((e, i) => (
            <li
              key={i}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/50 pb-2 text-sm last:border-0"
            >
              <span className="avionic text-xs text-muted">
                {new Date(e.at).toISOString().replace('.000Z', 'Z')}
              </span>
              <span className="text-gold">{e.kind}</span>
              <span className="text-muted">{e.actor}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link to="/dispatch" className="text-gold hover:text-gold-lt">
          ← Dispatch center
        </Link>
        {!q && trip.offers.length > 0 && (
          <Link to={`/trips/${trip.id}/offers`} className="text-gold hover:text-gold-lt">
            Offers →
          </Link>
        )}
        <Link to="/dispatch?tool=quick" className="text-muted hover:text-cream">
          Quick Dispatch another
        </Link>
      </div>
    </div>
  )
}
