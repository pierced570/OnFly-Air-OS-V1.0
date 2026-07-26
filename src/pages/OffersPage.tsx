import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'
import {
  sendAvailabilityPings,
  simulateOperatorReply,
  selectOffersAndHardQuote,
  acceptHardQuote,
  simulatorMessagesForTrip,
} from '@/lib/offerFlow'
import { clientTotalForOffer } from '@/lib/offerPricing'
import { FlightChip } from '@/components/FlightChip'
import { getClient, listInvoiceEmails, listRequestAlertEmails } from '@/lib/clientStore'

function useTrip(id: string | undefined): TripStoreRow | null {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  return id ? trips.find((t) => t.id === id) ?? getTrip(id) : null
}

export default function OffersPage() {
  const { id } = useParams()
  const trip = useTrip(id)
  const [msgs, setMsgs] = useState(simulatorMessagesForTrip(id ?? ''))
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [clientEdits, setClientEdits] = useState<Record<string, number>>({})
  const [toList, setToList] = useState('')

  function refresh() {
    if (!id) return
    setMsgs(simulatorMessagesForTrip(id))
  }

  useEffect(() => {
    refresh()
  }, [id, trip?.offers.length, trip?.state, trip?.offers.map((o) => o.state).join()])

  useEffect(() => {
    if (!trip?.client_id) return
    const emails = [
      ...listRequestAlertEmails(trip.client_id),
      ...listInvoiceEmails(trip.client_id),
      getClient(trip.client_id)?.email ?? '',
    ].filter((e) => e.includes('@'))
    setToList([...new Set(emails)].join(', '))
  }, [trip?.client_id])

  const quotedIds = useMemo(
    () => trip?.offers.filter((o) => o.state === 'quoted').map((o) => o.id) ?? [],
    [trip?.offers],
  )

  if (!trip) {
    return (
      <div className="p-8 text-muted">
        Trip not found in session store. Generate a quote first, then open offers.
        <div className="mt-2">
          <Link className="text-gold" to="/trips/new">
            New trip
          </Link>
        </div>
      </div>
    )
  }

  const picked = quotedIds.filter((oid) => selected[oid])

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            Operator queue
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            T-<span className="avionic">{trip.ref}</span> · {trip.lane}
          </h1>
          <p className="mt-1 text-sm text-muted">
            State <span className="avionic text-gold">{trip.state}</span> · {trip.payload_summary}
          </p>
          <p className="mt-1 text-xs text-muted">
            Link goes to each operator&apos;s text + email. Yes = no phone
            follow-up; No = unavailable in this queue.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
          onClick={() =>
            void sendAvailabilityPings(trip.id).then(refresh).catch((e) => setError(String(e)))
          }
        >
          Send offer links (SMS + email)
        </button>
      </header>

      {error && <p className="text-sm text-late">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">Queue</h2>
          {trip.offers.map((o) => {
            const priced =
              o.price_net != null ? clientTotalForOffer(o, trip) : null
            const borderCls =
              o.state === 'available'
                ? 'border-onplan/60 bg-onplan/10'
                : o.state === 'unavailable'
                  ? 'border-border/40 bg-ink/30 opacity-60'
                  : o.state === 'quoted'
                    ? 'border-gold/40 bg-surface'
                    : 'border-border bg-surface'
            const statusLabel =
              o.state === 'available'
                ? 'Available — no call needed'
                : o.state === 'unavailable'
                  ? 'Unavailable'
                  : o.state === 'quoted'
                    ? 'Quoted'
                    : o.state === 'pinged'
                      ? 'Link sent — waiting'
                      : o.state
            return (
              <article key={o.id} className={`rounded-lg border p-4 ${borderCls}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    {o.state === 'quoted' && (
                      <label className="mb-1 flex items-center gap-2 text-xs text-gold">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[o.id])}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [o.id]: e.target.checked }))
                          }
                        />
                        Include in client quote
                      </label>
                    )}
                    <div className="font-medium text-cream">{o.operator_name}</div>
                    <div className="avionic text-sm text-muted">
                      {o.tail || '—'} · {o.type_name || '—'}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      Text {o.contact_cell}
                      {o.contact_email ? ` · ${o.contact_email}` : ' · no email on file'}
                    </div>
                    <div
                      className={`mt-1 text-xs font-medium ${
                        o.state === 'available'
                          ? 'text-onplan'
                          : o.state === 'unavailable'
                            ? 'text-late'
                            : 'text-gold'
                      }`}
                    >
                      {statusLabel}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {o.price_net != null && (
                      <div className="avionic text-cream">NET ${o.price_net}</div>
                    )}
                    {(o.includes_aircraft_tax != null ||
                      o.includes_fees != null ||
                      o.fee_scope) && (
                      <div className="text-[11px] text-muted">
                        {[
                          o.includes_aircraft_tax ? 'tax incl.' : null,
                          o.includes_fees ? 'fees incl.' : null,
                          !o.includes_aircraft_tax &&
                          !o.includes_fees &&
                          o.fee_scope === 'aircraft_only'
                            ? 'Aircraft only'
                            : null,
                          !o.includes_aircraft_tax &&
                          !o.includes_fees &&
                          o.fee_scope === 'aircraft_and_fees'
                            ? 'Aircraft + fees'
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                    {priced && (
                      <div className="mt-1 text-xs text-gold">
                        Client ${priced.client}
                        {priced.fetExempt ? ' · FET exempt' : ''}
                      </div>
                    )}
                    {o.time_to_position_min != null && (
                      <div className="text-xs text-muted">TTP {o.time_to_position_min}m</div>
                    )}
                    {o.live_leg_min != null && (
                      <div className="text-xs text-muted">Live {o.live_leg_min}m</div>
                    )}
                  </div>
                </div>
                {o.bookingGated && (
                  <div className="mt-2 text-xs text-late">Booking gated — insurance/compliance</div>
                )}
                <div className="mt-2">
                  <FlightChip
                    phase={
                      trip.candidates.find((c) => c.aircraft_id === o.aircraft_id)?.phase
                    }
                    inPosition={
                      trip.candidates.find((c) => c.aircraft_id === o.aircraft_id)?.inPosition
                    }
                    laddBlocked={
                      trip.candidates.find((c) => c.aircraft_id === o.aircraft_id)?.laddBlocked
                    }
                  />
                </div>
                {selected[o.id] && priced && (
                  <label className="mt-2 block text-xs text-muted">
                    Client total (edit)
                    <input
                      type="number"
                      className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 avionic text-cream"
                      value={clientEdits[o.id] ?? priced.client}
                      onChange={(e) =>
                        setClientEdits((m) => ({
                          ...m,
                          [o.id]: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={replyDraft[o.id] ?? ''}
                    onChange={(e) => setReplyDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                    placeholder="Simulate reply: 1 or 2"
                    className="flex-1 rounded border border-border bg-ink px-2 py-1 text-sm text-cream"
                  />
                  <button
                    type="button"
                    className="rounded border border-gold/40 px-2 py-1 text-xs text-gold"
                    onClick={() =>
                      void simulateOperatorReply(trip.id, o.id, replyDraft[o.id] ?? '1').then(refresh)
                    }
                  >
                    Reply
                  </button>
                  <Link
                    className="rounded border border-gold/40 px-2 py-1 text-xs text-gold"
                    to={`/offer/${o.magic_token}`}
                  >
                    Open offer link
                  </Link>
                </div>
              </article>
            )
          })}

          {quotedIds.length > 0 && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 p-4 space-y-3">
              <div className="text-sm text-gold">Multi-option client quote</div>
              <label className="block text-xs text-muted">
                To (requesters / AP)
                <input
                  value={toList}
                  onChange={(e) => setToList(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-ink px-2 py-1.5 text-sm text-cream"
                  placeholder="email@client.com, ap@client.com"
                />
              </label>
              <button
                type="button"
                disabled={picked.length === 0}
                className="rounded bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
                onClick={() => {
                  const totals: Record<string, number> = {}
                  for (const oid of picked) {
                    const o = trip.offers.find((x) => x.id === oid)!
                    const p = clientTotalForOffer(o, trip)
                    totals[oid] = clientEdits[oid] ?? p.client
                  }
                  const emails = toList
                    .split(/[,;\s]+/)
                    .map((e) => e.trim())
                    .filter((e) => e.includes('@'))
                  void selectOffersAndHardQuote(trip.id, picked, totals, emails)
                    .then(refresh)
                    .catch((e) => setError(String(e)))
                }}
              >
                Send hard quote ({picked.length || 0} option{picked.length === 1 ? '' : 's'})
              </button>
            </div>
          )}

          {trip.hard_quote && (
            <div className="rounded-lg border border-gold bg-gold/10 p-4">
              <div className="text-sm text-gold">Hard quote ready</div>
              {trip.hard_quote.options?.length ? (
                <ul className="mt-2 space-y-1 text-sm text-cream">
                  {trip.hard_quote.options.map((opt) => (
                    <li key={opt.offer_id} className="avionic">
                      {opt.label}: ${opt.client_total.toFixed(0)}
                      {opt.eta_end ? ` · ${opt.eta_end.slice(0, 16)}Z` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="avionic text-xl text-cream">
                  ${trip.hard_quote.total.toFixed(0)}
                </div>
              )}
              <Link
                className="mt-2 inline-block text-sm text-gold"
                to={`/accept/${trip.hard_quote.accept_token}`}
              >
                Open client accept page →
              </Link>
              <button
                type="button"
                className="ml-3 text-sm text-muted underline"
                onClick={() =>
                  void acceptHardQuote(trip.hard_quote!.accept_token).then(refresh)
                }
              >
                Simulate accept
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Comms simulator
          </h2>
          <p className="mt-1 text-xs text-muted">
            SMS + email (mock until RingCentral / Resend are live)
          </p>
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-auto text-sm">
            {msgs.length === 0 && <li className="text-muted">No messages yet</li>}
            {msgs.map((m, i) => (
              <li key={i} className="rounded border border-border/50 bg-ink/40 px-3 py-2">
                <div className="avionic text-xs text-gold">
                  {m.channel} → {m.to}
                </div>
                <div className="mt-1 text-cream">{m.body}</div>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wider text-muted">Event log</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {trip.events.map((e, i) => (
                <li key={i}>
                  <span className="avionic">{e.at.slice(11, 19)}Z</span> · {e.kind} · {e.actor}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
