import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  describeOfferDestination,
  formatOfferDestinationConfirm,
  formatOfferQuoteSummary,
  formatOfferSentAt,
  offerRecipientStatus,
  offerRecipientStatusLabel,
} from '@/domain/offerRecipients'
import type { QuoteLinkChannel } from '@/domain/quoteLinkChannel'
import {
  acknowledgeDeclinedOffer,
  appendOfferToTrip,
  selectOffersAndHardQuote,
  sendAvailabilityPings,
  updateOfferContacts,
  updateTripOfferRequest,
} from '@/lib/offerFlow'
import { clientTotalForOffer } from '@/lib/offerPricing'
import {
  candidateFromDeskHit,
  contactOverrideFromHit,
  ensureDeskOperatorsLoaded,
  searchDeskOperators,
  type DeskOperatorHit,
} from '@/lib/deskOperatorSearch'
import {
  getClient,
  listInvoiceEmails,
  listRequestAlertEmails,
} from '@/lib/clientStore'
import { startLiveTripRefresh } from '@/lib/liveTripRefresh'
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
  const [contactDrafts, setContactDrafts] = useState<
    Record<
      string,
      {
        contact_email: string
        contact_cell: string
        quote_link_channel: QuoteLinkChannel
      }
    >
  >({})
  const [notifying, setNotifying] = useState(false)

  useEffect(() => {
    if (!trip) return
    setLaneEdit(trip.lane)
    setPayloadEdit(trip.payload_summary)
    setReadyEdit(trip.ready_label)
  }, [trip?.id, trip?.lane, trip?.payload_summary, trip?.ready_label])

  // Yes/No / quotes from the public offer page land here without a full reload.
  useEffect(() => startLiveTripRefresh(4000), [])

  useEffect(() => {
    if (!trip) return
    const next: typeof contactDrafts = {}
    for (const o of trip.offers) {
      next[o.id] = {
        contact_email: o.contact_email,
        contact_cell: o.contact_cell,
        quote_link_channel: o.quote_link_channel,
      }
    }
    setContactDrafts(next)
  }, [
    trip?.id,
    trip?.offers
      .map(
        (o) =>
          `${o.id}:${o.contact_email}:${o.contact_cell}:${o.quote_link_channel}:${o.notified_at ?? ''}`,
      )
      .join('|'),
  ])

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
  const clientName =
    trip.quick?.client_name?.trim() ||
    (trip.client_id ? getClient(trip.client_id)?.name?.trim() : '') ||
    ''

  function saveUpdate() {
    void updateTripOfferRequest(trip!.id, {
      lane: laneEdit,
      payload_summary: payloadEdit,
      ready_label: readyEdit,
    })
      .then(() => {
        setShowUpdate(false)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  function addOperator(hit: DeskOperatorHit) {
    const ov = contactOverrideFromHit(hit)
    if (!ov.contact_email.includes('@')) {
      setError(
        `Add an email on file for ${hit.name} before sending (SMS not connected yet).`,
      )
      return
    }
    const ok = window.confirm(
      formatOfferDestinationConfirm(
        [
          {
            operator_name: hit.name,
            contact_email: ov.contact_email,
            contact_cell: ov.contact_cell,
            quote_link_channel: ov.quote_link_channel,
          },
        ],
        'notify',
      ),
    )
    if (!ok) return
    void appendOfferToTrip(trip!.id, candidateFromDeskHit(hit), ov)
      .then(() => {
        setOpQuery('')
        setOpHits([])
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  function saveContacts(offerId: string) {
    const draft = contactDrafts[offerId]
    if (!draft || !trip) return
    void updateOfferContacts(trip.id, offerId, draft)
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  function notifyOffers(offerIds?: string[]) {
    if (!trip) return
    const fresh = getTrip(trip.id) ?? trip
    const targets = fresh.offers.filter((o) =>
      offerIds ? offerIds.includes(o.id) : true,
    )
    if (!targets.length) return
    const ok = window.confirm(
      formatOfferDestinationConfirm(
        targets.map((o) => ({
          operator_name: o.operator_name,
          contact_email: o.contact_email,
          contact_cell: o.contact_cell,
          contact_cell_is_mock: o.contact_cell_is_mock,
          quote_link_channel: o.quote_link_channel,
        })),
        'notify',
      ),
    )
    if (!ok) return
    setNotifying(true)
    void sendAvailabilityPings(fresh.id, {
      offerIds: targets.map((o) => o.id),
    })
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setNotifying(false))
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            Trip offers
            {trip.ref ? (
              <span className="ml-2 font-normal text-muted">
                T-<span className="avionic">{trip.ref}</span>
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            {clientName ? `${clientName} · ${trip.lane}` : trip.lane}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {trip.payload_summary}
            {trip.ready_label ? ` · ready ${trip.ready_label}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted">
            Offer links are emailed when you send. Re-notify below if a
            destination changed — SMS is not connected yet.
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
          <button
            type="button"
            disabled={notifying || trip.offers.length === 0}
            className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
            onClick={() => notifyOffers()}
          >
            {notifying ? 'Notifying…' : 'Notify all via email/SMS'}
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
            const notified = Boolean(o.notified_at)
            const declinedAcked =
              status === 'no' && Boolean(o.declined_acked_at)
            const statusLabel = declinedAcked
              ? 'unavailable'
              : offerRecipientStatusLabel(status, { notified })
            const dest = describeOfferDestination(o)
            const quoteSummary = formatOfferQuoteSummary(o)
            const priced =
              o.price_net != null ? clientTotalForOffer(o, trip) : null
            const draft = contactDrafts[o.id] ?? {
              contact_email: o.contact_email,
              contact_cell: o.contact_cell,
              quote_link_channel: o.quote_link_channel,
            }
            const atIso = notified ? o.notified_at : o.ping_sent_at
            const sent = formatOfferSentAt(
              atIso,
              Date.now(),
              notified ? 'notified' : 'link',
            )
            if (declinedAcked) {
              return (
                <article
                  key={o.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border/30 bg-ink/20 px-3 py-2"
                >
                  <span className="text-sm text-cream/80">{o.operator_name}</span>
                  <span className="text-sm text-muted">unavailable</span>
                </article>
              )
            }
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
                    <div className="mt-1 font-mono text-[11px] text-cream/85">
                      {dest.summary}
                    </div>
                    {dest.gaps.length > 0 ? (
                      <div className="mt-0.5 text-[11px] text-late">
                        {dest.gaps.join(' · ')}
                      </div>
                    ) : null}
                    {sent ? (
                      <div className="mt-1 font-mono text-[11px] text-muted">
                        {sent.display}
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] text-muted">
                        Link not created yet
                      </div>
                    )}
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
                    <div className="mt-1 flex flex-col items-end gap-1">
                      {status === 'no' ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-gold hover:text-gold-lt"
                          onClick={() => {
                            void acknowledgeDeclinedOffer(trip.id, o.id).catch(
                              (e) =>
                                setError(
                                  e instanceof Error ? e.message : String(e),
                                ),
                            )
                          }}
                        >
                          Acknowledge
                        </button>
                      ) : null}
                      <Link
                        className="inline-block text-xs text-gold hover:text-gold-lt"
                        to={`/offer/${o.magic_token}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Offer link →
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-2 rounded border border-border/50 bg-ink/40 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted">
                    Destination on file
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-xs text-muted">
                      Email
                      <input
                        type="email"
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 font-mono text-sm text-cream"
                        value={draft.contact_email}
                        placeholder="ops@operator.com"
                        onChange={(e) =>
                          setContactDrafts((m) => ({
                            ...m,
                            [o.id]: {
                              ...draft,
                              contact_email: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      SMS
                      <input
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 font-mono text-sm text-cream"
                        value={draft.contact_cell}
                        placeholder="+1…"
                        onChange={(e) =>
                          setContactDrafts((m) => ({
                            ...m,
                            [o.id]: {
                              ...draft,
                              contact_cell: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div
                    className="flex rounded-lg border border-border bg-surface p-0.5"
                    role="group"
                    aria-label="Notify channel"
                  >
                    {(
                      [
                        ['both', 'Both'],
                        ['email', 'Email'],
                        ['sms', 'SMS'],
                      ] as const
                    ).map(([val, lab]) => (
                      <button
                        key={val}
                        type="button"
                        className={[
                          'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold',
                          draft.quote_link_channel === val
                            ? 'bg-gold text-ink'
                            : 'text-muted hover:text-cream',
                        ].join(' ')}
                        onClick={() =>
                          setContactDrafts((m) => ({
                            ...m,
                            [o.id]: {
                              ...draft,
                              quote_link_channel: val,
                            },
                          }))
                        }
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-cream"
                      onClick={() => saveContacts(o.id)}
                    >
                      Save destination
                    </button>
                    <button
                      type="button"
                      disabled={notifying}
                      className="rounded border border-gold/50 px-2 py-1 text-xs text-gold hover:bg-gold/10 disabled:opacity-40"
                      onClick={() => {
                        void updateOfferContacts(trip.id, o.id, draft)
                          .then(() => notifyOffers([o.id]))
                          .catch((e) =>
                            setError(
                              e instanceof Error ? e.message : String(e),
                            ),
                          )
                      }}
                    >
                      Notify this operator
                    </button>
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
        </section>
      </div>
    </div>
  )
}
