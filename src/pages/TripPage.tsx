import { Link, useParams } from 'react-router-dom'
import { getTrip } from '@/lib/tripStore'

export default function TripPage() {
  const { id } = useParams()
  const trip = id ? getTrip(id) : null

  if (!trip) {
    return (
      <div className="p-8">
        <h1 className="text-xl text-cream">Trip not found</h1>
        <p className="mt-2 text-sm text-muted">
          Open a trip from the Board, or create one with{' '}
          <Link className="text-gold" to="/quick-dispatch">
            Quick Dispatch
          </Link>
          .
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-gold">
          ← Board
        </Link>
      </div>
    )
  }

  const q = trip.quick
  const margin =
    q != null ? q.client_price - q.vendor_cost : null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            {q ? 'Quick dispatch · tracking' : 'Trip'}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            T-<span className="avionic">{trip.ref}</span>
            {q?.po ? (
              <span className="ml-2 text-base font-normal text-muted">
                PO {q.po}
              </span>
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
              {q.tail ? (
                <span className="avionic"> · {q.tail}</span>
              ) : null}
              {q.aircraft_type ? ` · ${q.aircraft_type}` : ''}
            </p>
          )}
        </div>
        <div className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
          <span className="avionic font-medium">{trip.state}</span>
        </div>
      </header>

      {q && (
        <>
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wider text-muted">Legs</h2>
            <ul className="mt-3 space-y-2">
              {q.legs.map((leg, i) => (
                <li
                  key={i}
                  className="flex flex-wrap gap-x-3 gap-y-1 border-b border-border/40 pb-2 text-sm last:border-0"
                >
                  <span className="text-muted">Leg {i + 1}</span>
                  <span className="avionic text-cream">
                    {leg.origin_icao}→{leg.dest_icao}
                  </span>
                  {leg.date && <span className="text-muted">{leg.date}</span>}
                  {leg.repo_time && (
                    <span className="text-muted">repo {leg.repo_time}</span>
                  )}
                  {leg.live_leg_time && (
                    <span className="text-muted">live {leg.live_leg_time}</span>
                  )}
                  {!q.cargo_only && (
                    <span className="text-muted">{leg.pax} pax</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

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

          <section className="rounded-lg border border-border bg-surface p-4 text-sm">
            <h2 className="text-xs uppercase tracking-wider text-muted">Invoice</h2>
            <p className="mt-2 text-cream">
              {q.send_invoice ? 'Will send' : 'Do not send'} · {q.pay_terms}
            </p>
            {q.invoice_email && (
              <p className="mt-1 text-muted">To: {q.invoice_email}</p>
            )}
            {q.cc_emails.length > 0 && (
              <p className="mt-1 text-muted">CC: {q.cc_emails.join(', ')}</p>
            )}
            {q.notes && <p className="mt-3 text-cream">{q.notes}</p>}
          </section>
        </>
      )}

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
        <Link to="/" className="text-gold hover:text-gold-lt">
          ← Board
        </Link>
        {!q && trip.offers.length > 0 && (
          <Link
            to={`/trips/${trip.id}/offers`}
            className="text-gold hover:text-gold-lt"
          >
            Offers →
          </Link>
        )}
        <Link to="/quick-dispatch" className="text-muted hover:text-cream">
          Quick Dispatch another
        </Link>
      </div>
    </div>
  )
}
