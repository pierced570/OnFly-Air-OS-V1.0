import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  createMockInvoiceForTrip,
  getTrip,
  listTripsStable,
  mutateTrip,
  postThreadMessage,
  safeTransitionTrip,
  subscribeTrips,
} from '@/lib/tripStore'
import { clientRuleChips } from '@/lib/clientStore'
import { canTransition } from '@/domain/stateMachine'
import { createWxAdapter, type WxBrief } from '@/adapters/wx'
import { PipelineStrip } from '@/components/PipelineStrip'

export default function TripPage() {
  const { id } = useParams()
  useSyncExternalStore(subscribeTrips, listTripsStable, () => [])
  const trip = id ? getTrip(id) : null
  const [threadBody, setThreadBody] = useState('')
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [wxBriefs, setWxBriefs] = useState<WxBrief[]>([])

  const ruleChips = useMemo(
    () => (trip?.client_id ? clientRuleChips(trip.client_id) : []),
    [trip?.client_id],
  )

  const watchIcaos = useMemo(() => {
    if (!trip) return [] as string[]
    const s = new Set<string>()
    for (const leg of trip.legs) {
      if (leg.origin) s.add(leg.origin.toUpperCase())
      if (leg.dest) s.add(leg.dest.toUpperCase())
    }
    for (const l of trip.quick?.legs ?? []) {
      if (l.origin_icao) s.add(l.origin_icao.toUpperCase())
      if (l.dest_icao) s.add(l.dest_icao.toUpperCase())
    }
    return [...s].slice(0, 4)
  }, [trip])

  useEffect(() => {
    if (!watchIcaos.length) return
    void (async () => {
      const wx = createWxAdapter()
      const rows = await Promise.all(watchIcaos.map((i) => wx.brief(i)))
      setWxBriefs(rows)
      if (trip) {
        mutateTrip(trip.id, (t) => {
          const already = t.events.some((e) => e.kind === 'wx_brief')
          if (already) return
          t.events.push({
            at: new Date().toISOString(),
            actor: 'system',
            kind: 'wx_brief',
            payload: {
              icaos: watchIcaos,
              summaries: rows.map((r) => r.summary),
              hardFlags: rows.flatMap((r) => r.hardFlags),
            },
          })
        })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchIcaos.join(',')])

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
  const margin = q != null ? q.client_price - q.vendor_cost : null
  const nextStates = (
    ['in_progress', 'delivered', 'invoiced', 'closed', 'cancelled', 'lost'] as const
  ).filter((to) => canTransition(trip.state, to))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
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
        <div className="space-y-2 text-right">
          <div className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
            <span className="avionic font-medium">{trip.state}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {nextStates.map((to) => (
              <button
                key={to}
                type="button"
                className="rounded border border-border px-2 py-1 text-[11px] text-muted hover:text-cream"
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

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">ETA chain / legs</h2>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Participants</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {trip.participants.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="text-cream">{p.name}</span>
                <span className="text-xs text-muted">
                  {p.role}
                  {p.email ? ` · ${p.email}` : ''}
                </span>
              </li>
            ))}
            {trip.participants.length === 0 && (
              <li className="text-muted">No participants yet.</li>
            )}
          </ul>
        </section>

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
          {trip.state === 'delivered' && !trip.invoice && (
            <button
              type="button"
              disabled={invoiceBusy}
              className="mt-3 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-ink"
              onClick={() => {
                setInvoiceBusy(true)
                void createMockInvoiceForTrip(trip.id).finally(() =>
                  setInvoiceBusy(false),
                )
              }}
            >
              {invoiceBusy ? 'Creating…' : 'Create mock QB invoice'}
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

      {wxBriefs.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Weather brief
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {wxBriefs.map((b) => (
              <li key={b.icao}>
                <span className="avionic text-gold">{b.icao}</span>
                <span className="ml-2 text-cream">{b.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Trip thread</h2>
        <p className="mt-1 text-xs text-muted">
          Paste field updates — regex parses wheels-up / loaded / POD (mock relay).
        </p>
        <ul className="mt-3 max-h-48 space-y-2 overflow-auto">
          {trip.thread.length === 0 && (
            <li className="text-sm text-muted">No messages yet.</li>
          )}
          {trip.thread.map((m) => (
            <li key={m.id} className="border-b border-border/40 pb-2 text-sm">
              <div className="flex gap-2 text-xs text-muted">
                <span className="avionic">{new Date(m.at).toISOString().slice(11, 19)}Z</span>
                <span>{m.from}</span>
                {m.parsed_kind && (
                  <span className="text-gold">parsed: {m.parsed_kind}</span>
                )}
              </div>
              <p className="text-cream">{m.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
            placeholder="wheels up / arrived / delivered…"
            value={threadBody}
            onChange={(e) => setThreadBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && threadBody.trim()) {
                postThreadMessage(trip.id, {
                  from: 'dispatcher',
                  channel: 'web',
                  body: threadBody,
                })
                setThreadBody('')
              }
            }}
          />
          <button
            type="button"
            className="rounded bg-gold px-3 py-2 text-sm text-ink"
            onClick={() => {
              if (!threadBody.trim()) return
              postThreadMessage(trip.id, {
                from: 'dispatcher',
                channel: 'web',
                body: threadBody,
              })
              setThreadBody('')
            }}
          >
            Post
          </button>
        </div>
      </section>

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
          <Link to={`/trips/${trip.id}/offers`} className="text-gold hover:text-gold-lt">
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
