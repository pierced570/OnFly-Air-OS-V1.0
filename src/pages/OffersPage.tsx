import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  formatOfferQuoteSummary,
  formatOfferSentAt,
  offerRecipientStatus,
  offerRecipientStatusLabel,
} from '@/domain/offerRecipients'
import {
  appendOfferToTrip,
  selectOffersAndHardQuote,
  acceptHardQuote,
  simulateOperatorReply,
  updateTripOfferRequest,
  simulatorMessagesForTrip,
} from '@/lib/offerFlow'
import { clientTotalForOffer } from '@/lib/offerPricing'
import {
  candidateFromDeskHit,
  contactOverrideFromHit,
  ensureDeskOperatorsLoaded,
  searchDeskOperators,
  type DeskOperatorHit,
} from '@/lib/deskOperatorSearch'
import { getClient, listInvoiceEmails, listRequestAlertEmails } from '@/lib/clientStore'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'

function useTrip(id: string | undefined): TripStoreRow | null {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  return id ? trips.find((t) => t.id === id) ?? getTrip(id) : null
}

function statusClass(status: string): string {
  if (status === 'yes' || status === 'quote_submitted' || status === 'selected') {
    return 'text-onplan'
  }
  if (status === 'no' || status === 'stood_down' || status === 'expired') {
    return 'text-muted'
  }
  return 'text-gold'
}

export default function OffersPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const trip = useTrip(id)
  const [msgs, setMsgs] = useState(simulatorMessagesForTrip(id ?? ''))
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [clientEdits, setClientEdits] = useState<Record<string, number>>({})
  const [toList, setToList] = useState('')
  const [showUpdate, setShowUpdate] = useState(
    () => searchParams.get('update') === '1',
  )
  const [laneEdit, setLaneEdit] = useState('')
  const [payloadEdit, setPayloadEdit] = useState('')
  const [readyEdit, setReadyEdit] = useState('')
  const [opQuery, setOpQuery] = useState('')
  const [opHits, setOpHits] = useState<DeskOperatorHit[]>([])
  const [addFocus, setAddFocus] = useState(
    () => searchParams.get('add') === '1',
  )

  function refresh() {
    if (!id) return
    setMsgs(simulatorMessagesForTrip(id))
  }

  useEffect(() => {
    refresh()
  }, [id, trip?.offers.length, trip?.state, trip?.offers.map((o) => o.state).join()])

  useEffect(() => {
    if (!trip) return
    setLaneEdit(trip.lane)
    setPayloadEdit(trip.payload_summary)
    setReadyEdit(trip.ready_label)
  }, [trip?.id, trip?.lane, trip?.payload_summary, trip?.ready_label])

  useEffect(() => {
    if (!trip?.client_id) return
    const emails = [
      ...listRequestAlertEmails(trip.client_id),
      ...listInvoiceEmails(trip.client_id),
      getClient(trip.client_id)?.email ?? '',
    ].filter((e) => e.includes('@'))
    setToList([...new Set(emails)].join(', '))
  }, [trip?.client_id])

  useEffect(() => {
    void ensureDeskOperatorsLoaded()
  }, [])

  useEffect(() => {
    if (!opQuery.trim()) {
      setOpHits([])
      return
    }
    const taken = new Set(trip?.offers.map((o) => o.operator_id) ?? [])
    setOpHits(
      searchDeskOperators(opQuery, 8).filter((h) => !taken.has(h.operator_id)),
    )
  }, [opQuery, trip?.offers])

  const quotedIds = useMemo(
    () => trip?.offers.filter((o) => o.state === 'quoted').map((o) => o.id) ?? [],
    [trip?.offers],
  )

  if (!trip) {
    return (
      <div className="p-8 text-muted">
        Trip not found in session store. Open a trip from Dispatch center.
        <div className="mt-2">
          <Link className="text-gold" to="/dispatch">
            Dispatch center
          </Link>
        </div>
      </div>
    )
  }

  const picked = quotedIds.filter((oid) => selected[oid])

  function saveUpdate() {
    void updateTripOfferRequest(trip!.id, {
      lane: laneEdit,
      payload_summary: payloadEdit,
      ready_label: readyEdit,
    })
      .then(() => {
        setShowUpdate(false)
        setError(null)
        refresh()
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  function addOperator(hit: DeskOperatorHit) {
    void appendOfferToTrip(
      trip!.id,
      candidateFromDeskHit(hit),
      contactOverrideFromHit(hit),
    )
      .then(() => {
        setOpQuery('')
        setOpHits([])
        setError(null)
        refresh()
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            Trip offers
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            T-<span className="avionic">{trip.ref}</span> · {trip.lane}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {trip.payload_summary}
            {trip.ready_label ? ` · ready ${trip.ready_label}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted">
            Share offer links — operators are not auto-pinged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/dispatch"
            className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-cream"
          >
            ← Dispatch center
          </Link>
          <button
            type="button"
            className="rounded-md border border-gold/50 px-3 py-2 text-sm font-medium text-gold hover:bg-gold/10"
            onClick={() => setShowUpdate((v) => !v)}
          >
            Update request
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-late">{error}</p>}

      {showUpdate && (
        <section className="space-y-3 rounded-lg border border-gold/40 bg-gold/5 p-4">
          <h2 className="text-sm font-semibold text-cream">Update request</h2>
          <p className="text-xs text-muted">
            Mission changed? Update what operators see on their offer link. No
            re-ping — share the same links again if needed.
          </p>
          <label className="block text-xs text-muted">
            Lane
            <input
              value={laneEdit}
              onChange={(e) => setLaneEdit(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-ink px-2 py-1.5 font-mono text-sm text-cream"
            />
          </label>
          <label className="block text-xs text-muted">
            Mission / payload
            <input
              value={payloadEdit}
              onChange={(e) => setPayloadEdit(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-ink px-2 py-1.5 text-sm text-cream"
            />
          </label>
          <label className="block text-xs text-muted">
            Ready
            <input
              value={readyEdit}
              onChange={(e) => setReadyEdit(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-ink px-2 py-1.5 text-sm text-cream"
              placeholder="ASAP"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
              onClick={saveUpdate}
            >
              Save update
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm text-muted"
              onClick={() => setShowUpdate(false)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section
        className={[
          'space-y-2 rounded-lg border bg-surface p-4',
          addFocus ? 'border-gold/50' : 'border-border',
        ].join(' ')}
      >
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Send same request to new operator
        </h2>
        <input
          value={opQuery}
          onChange={(e) => {
            setOpQuery(e.target.value)
            setAddFocus(false)
          }}
          placeholder="Search operator name, base, email, SMS…"
          className="w-full rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
          autoFocus={addFocus}
        />
        {opHits.length > 0 && (
          <ul className="divide-y divide-border/60 rounded border border-border">
            {opHits.map((h) => (
              <li key={h.operator_id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-ink/60"
                  onClick={() => addOperator(h)}
                >
                  <span>
                    <span className="block text-sm text-cream">{h.name}</span>
                    <span className="text-xs text-muted">
                      {[h.base_icao, h.contact_email, h.contact_cell]
                        .filter(Boolean)
                        .join(' · ') || 'No contact on file'}
                    </span>
                  </span>
                  <span className="text-xs text-gold">Add →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Recipients ({trip.offers.length})
          </h2>
          {trip.offers.length === 0 && (
            <p className="text-sm text-muted">No operators on this request yet.</p>
          )}
          {trip.offers.map((o) => {
            const status = offerRecipientStatus(o.state)
            const statusLabel = offerRecipientStatusLabel(status)
            const quoteSummary = formatOfferQuoteSummary(o)
            const priced =
              o.price_net != null ? clientTotalForOffer(o, trip) : null
            const borderCls =
              status === 'yes'
                ? 'border-onplan/60 bg-onplan/10'
                : status === 'no'
                  ? 'border-border/40 bg-ink/30 opacity-60'
                  : status === 'quote_submitted' || status === 'selected'
                    ? 'border-gold/40 bg-surface'
                    : 'border-border bg-surface'
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
                            setSelected((s) => ({
                              ...s,
                              [o.id]: e.target.checked,
                            }))
                          }
                        />
                        Include in client quote
                      </label>
                    )}
                    <div className="font-medium text-cream">
                      {o.operator_name}
                      {status === 'quote_submitted' ? (
                        <span className="ml-2 text-xs font-normal text-gold">
                          · Quote submitted
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={`mt-1 text-xs font-medium ${statusClass(status)}`}
                    >
                      {statusLabel}
                    </div>
                    {(() => {
                      const sent = formatOfferSentAt(o.ping_sent_at)
                      return sent ? (
                        <div className="mt-1 font-mono text-[11px] text-muted">
                          {sent.display}
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-muted">
                          Link ready — not marked sent yet
                        </div>
                      )
                    })()}
                    {quoteSummary && (
                      <div className="mt-1 font-mono text-xs text-cream/90">
                        {quoteSummary}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    {priced && (
                      <div className="text-xs text-gold">
                        Client ${priced.client}
                        {priced.fetExempt ? ' · FET exempt' : ''}
                      </div>
                    )}
                    <Link
                      className="mt-1 inline-block text-xs text-gold hover:text-gold-lt"
                      to={`/offer/${o.magic_token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Offer link →
                    </Link>
                  </div>
                </div>
                {o.bookingGated && (
                  <div className="mt-2 text-xs text-late">
                    Booking gated — insurance/compliance
                  </div>
                )}
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
                {(status === 'awaiting' || status === 'yes') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={replyDraft[o.id] ?? ''}
                      onChange={(e) =>
                        setReplyDraft((d) => ({
                          ...d,
                          [o.id]: e.target.value,
                        }))
                      }
                      placeholder="Simulate reply: 1 or 2"
                      className="flex-1 rounded border border-border bg-ink px-2 py-1 text-sm text-cream"
                    />
                    <button
                      type="button"
                      className="rounded border border-gold/40 px-2 py-1 text-xs text-gold"
                      onClick={() =>
                        void simulateOperatorReply(
                          trip.id,
                          o.id,
                          replyDraft[o.id] ?? '1',
                        ).then(refresh)
                      }
                    >
                      Reply
                    </button>
                  </div>
                )}
              </article>
            )
          })}

          {quotedIds.length > 0 && (
            <div className="space-y-3 rounded-lg border border-gold/40 bg-gold/10 p-4">
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
                Send hard quote ({picked.length || 0} option
                {picked.length === 1 ? '' : 's'})
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
                  void acceptHardQuote(trip.hard_quote!.accept_token).then(
                    refresh,
                  )
                }
              >
                Simulate accept
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Event log
          </h2>
          <ul className="mt-2 max-h-[20rem] space-y-1 overflow-auto text-xs text-muted">
            {trip.events.map((e, i) => (
              <li key={i}>
                <span className="avionic">{e.at.slice(11, 19)}Z</span> · {e.kind}{' '}
                · {e.actor}
              </li>
            ))}
          </ul>
          {msgs.length > 0 && (
            <>
              <h3 className="mt-4 text-xs uppercase tracking-wider text-muted">
                Comms log
              </h3>
              <ul className="mt-2 max-h-40 space-y-2 overflow-auto text-sm">
                {msgs.map((m, i) => (
                  <li
                    key={i}
                    className="rounded border border-border/50 bg-ink/40 px-3 py-2"
                  >
                    <div className="avionic text-xs text-gold">
                      {m.channel} → {m.to}
                    </div>
                    <div className="mt-1 text-cream">{m.body}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
