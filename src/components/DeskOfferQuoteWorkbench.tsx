/**
 * Desk quote workbench — manual operator quotes, hard-quote send,
 * client margin/tax edit. Meant to stay inside Dispatch center.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  ClientEmailRecipientsBubble,
  defaultClientEmailSelection,
  emptyClientEmailSelection,
  type ClientEmailSelection,
} from '@/components/ClientEmailRecipientsBubble'
import { OfferQuoteForm } from '@/components/OfferQuoteForm'
import {
  hardQuoteClientStatus,
  hardQuoteClientStatusLabel,
} from '@/domain/hardQuoteClientStatus'
import {
  DEFAULT_OFFER_MARGIN_PCT,
  formatMinutes,
} from '@/domain/offerQuotePreview'
import {
  formatOfferQuoteSummary,
  offerRecipientStatus,
} from '@/domain/offerRecipients'
import { rememberEmailsOnClient } from '@/lib/clientStore'
import {
  selectOffersAndHardQuote,
  submitDeskManualQuote,
  updateHardQuoteClientPricing,
} from '@/lib/offerFlow'
import {
  clientTotalForOffer,
  offerQuotePreviewFor,
} from '@/lib/offerPricing'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

type Props = {
  tripId: string
  onClose?: () => void
}

export function DeskOfferQuoteWorkbench({ tripId, onClose }: Props) {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = trips.find((t) => t.id === tripId) ?? getTrip(tripId)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [clientEdits, setClientEdits] = useState<Record<string, number>>({})
  const [marginPct, setMarginPct] = useState(DEFAULT_OFFER_MARGIN_PCT)
  const [pricingOfferId, setPricingOfferId] = useState<string | null>(null)
  const [emailSel, setEmailSel] = useState<ClientEmailSelection>(
    emptyClientEmailSelection,
  )
  const [composeAnotherQuote, setComposeAnotherQuote] = useState(false)
  const [manualQuoteOfferId, setManualQuoteOfferId] = useState<string | null>(
    null,
  )
  const [manualQuoteBusy, setManualQuoteBusy] = useState(false)
  const [pricingBusy, setPricingBusy] = useState(false)

  useEffect(() => {
    setEmailSel(defaultClientEmailSelection(trip?.client_id))
  }, [trip?.client_id])

  useEffect(() => {
    if (trip?.offer_margin_pct != null && Number.isFinite(trip.offer_margin_pct)) {
      setMarginPct(trip.offer_margin_pct)
    }
  }, [trip?.id, trip?.offer_margin_pct])

  const quoteableIds = useMemo(
    () =>
      trip?.offers
        .filter((o) => o.state === 'quoted' || o.state === 'selected')
        .map((o) => o.id) ?? [],
    [trip?.offers],
  )

  const hardQuoteStatus = trip?.hard_quote
    ? hardQuoteClientStatus({
        trip_state: trip.state,
        client_decision: trip.hard_quote.client_decision,
        accepted_at: trip.hard_quote.accepted_at,
        declined_at: trip.hard_quote.declined_at,
      })
    : null

  const canSendAnotherQuote =
    Boolean(trip?.hard_quote) &&
    hardQuoteStatus !== 'accepted' &&
    quoteableIds.length > 0

  const showQuoteComposer =
    quoteableIds.length > 0 &&
    (!trip?.hard_quote || composeAnotherQuote || hardQuoteStatus === 'declined')

  if (!trip) {
    return (
      <div className="mt-3 rounded-md border border-border bg-ink/40 p-3 text-sm text-muted">
        Trip not loaded.
      </div>
    )
  }

  const picked = quoteableIds.filter((oid) => selected[oid])

  return (
    <div className="mt-3 space-y-3 rounded-md border border-gold/40 bg-ink/50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gold">
            Quotes & pricing
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Operator NET, then margin / tax / client total — send hard quotes
            without leaving Dispatch.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="text-xs text-muted hover:text-cream"
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-late">{error}</p> : null}

      <label className="flex flex-wrap items-end gap-3 text-xs text-muted">
        <span>
          Desk margin %
          <input
            type="number"
            min={0}
            step={0.5}
            className="mt-1 block w-24 rounded border border-border bg-ink px-2 py-1 avionic text-sm text-cream"
            value={marginPct}
            onChange={(e) => {
              const n = Number(e.target.value)
              setMarginPct(Number.isFinite(n) ? n : DEFAULT_OFFER_MARGIN_PCT)
              setClientEdits({})
            }}
          />
        </span>
        <span className="pb-1 text-[11px] text-muted">
          Applied when computing client totals from operator NET (tax
          table-driven).
        </span>
      </label>

      <ul className="space-y-2">
        {trip.offers.map((o) => {
          const status = offerRecipientStatus(o.state)
          if (status === 'no' && o.declined_acked_at) return null
          if (status === 'stood_down' || status === 'expired') return null
          const summary = formatOfferQuoteSummary(o)
          const preview =
            o.price_net != null
              ? offerQuotePreviewFor(
                  o,
                  trip,
                  0,
                  clientEdits[o.id] ?? null,
                  marginPct,
                )
              : null
          const priced =
            o.price_net != null ? clientTotalForOffer(o, { ...trip, offer_margin_pct: marginPct }) : null
          const canManual =
            status !== 'no' && hardQuoteStatus !== 'accepted'
          const showPricing =
            preview &&
            (selected[o.id] ||
              pricingOfferId === o.id ||
              (trip.hard_quote?.options?.some((opt) => opt.offer_id === o.id) ??
                false))
          return (
            <li
              key={o.id}
              className="rounded-md border border-border/50 bg-surface/40 px-2.5 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {(o.state === 'quoted' || o.state === 'selected') &&
                  (showQuoteComposer || !trip.hard_quote) ? (
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
                  ) : null}
                  <div className="text-sm font-medium text-cream">
                    {o.operator_name}
                    {o.type_name ? (
                      <span className="font-normal text-cream/75">
                        {' '}
                        · {o.type_name}
                      </span>
                    ) : null}
                    {o.tail ? (
                      <span className="avionic ml-1 text-xs text-cream/70">
                        {o.tail}
                      </span>
                    ) : null}
                  </div>
                  {summary ? (
                    <div className="mt-0.5 font-mono text-[11px] text-cream/85">
                      {summary}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-[11px] text-muted">
                      No quote yet
                    </div>
                  )}
                  {priced ? (
                    <div className="mt-0.5 text-xs text-gold">
                      Client ${clientEdits[o.id] ?? priced.client}
                      {priced.fetExempt ? ' · FET exempt' : ''}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {canManual ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-gold hover:text-gold-lt"
                      onClick={() =>
                        setManualQuoteOfferId((id) =>
                          id === o.id ? null : o.id,
                        )
                      }
                    >
                      {manualQuoteOfferId === o.id
                        ? 'Cancel'
                        : o.price_net != null
                          ? 'Edit operator quote'
                          : 'Enter quote'}
                    </button>
                  ) : null}
                  {preview && hardQuoteStatus !== 'accepted' ? (
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-cream"
                      onClick={() =>
                        setPricingOfferId((id) => (id === o.id ? null : o.id))
                      }
                    >
                      {pricingOfferId === o.id || selected[o.id]
                        ? 'Hide client pricing'
                        : 'Edit client pricing'}
                    </button>
                  ) : null}
                </div>
              </div>

              {showPricing && preview ? (
                <div className="mt-2 space-y-2 rounded border border-gold/25 bg-ink/60 p-2.5">
                  <div className="text-[11px] uppercase tracking-wider text-gold/90">
                    Client pricing (internal)
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="font-mono text-[11px] text-muted space-y-0.5">
                      <div>Vendor NET ${preview.vendor_price.toFixed(0)}</div>
                      <div>
                        Margin {preview.margin_pct}% → air $
                        {preview.client_air.toFixed(0)} (+$
                        {preview.margin_dollars.toFixed(0)})
                      </div>
                      {preview.tax_lines.map((line) => (
                        <div key={line.code}>
                          {line.code}
                          {line.note ? ` (${line.note})` : ''}: $
                          {line.amount.toFixed(0)}
                        </div>
                      ))}
                      <div>Tax total ${preview.tax_total.toFixed(0)}</div>
                      {preview.fet_exempt ? (
                        <div className="text-onplan">FET exempt (MTOW)</div>
                      ) : null}
                    </div>
                    <label className="block text-xs text-muted">
                      Client total $
                      <input
                        type="number"
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 avionic text-sm text-cream"
                        value={clientEdits[o.id] ?? preview.client_total}
                        onChange={(e) =>
                          setClientEdits((m) => ({
                            ...m,
                            [o.id]: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="font-mono text-[11px] text-cream/80">
                    TTP {formatMinutes(preview.ttp_min)} · turn{' '}
                    {formatMinutes(preview.turn_load_min)} · live{' '}
                    {formatMinutes(preview.live_leg_min)}
                  </div>
                  {trip.hard_quote?.options?.some(
                    (opt) => opt.offer_id === o.id,
                  ) && hardQuoteStatus !== 'accepted' ? (
                    <button
                      type="button"
                      disabled={pricingBusy}
                      className="rounded border border-gold/50 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold disabled:opacity-40"
                      onClick={() => {
                        setPricingBusy(true)
                        try {
                          const opts = (trip.hard_quote?.options ?? []).map(
                            (opt) => ({
                              offer_id: opt.offer_id,
                              client_total:
                                opt.offer_id === o.id
                                  ? (clientEdits[o.id] ?? preview.client_total)
                                  : opt.client_total,
                            }),
                          )
                          updateHardQuoteClientPricing(trip.id, {
                            margin_pct: marginPct,
                            options: opts,
                          })
                          setError(null)
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : String(e),
                          )
                        } finally {
                          setPricingBusy(false)
                        }
                      }}
                    >
                      Update client quote
                    </button>
                  ) : null}
                </div>
              ) : null}

              {manualQuoteOfferId === o.id ? (
                <div className="mt-2 rounded border border-gold/30 bg-ink/60 p-2.5">
                  <OfferQuoteForm
                    lane={trip.lane}
                    busy={manualQuoteBusy}
                    submitLabel={
                      o.price_net != null ? 'Update quote' : 'Save quote'
                    }
                    intro=""
                    initialTypeName={o.type_name || ''}
                    initialTail={o.tail || ''}
                    initialPriceNet={o.price_net ?? undefined}
                    initialTtpMin={o.time_to_position_min ?? undefined}
                    initialQuickTurnMin={o.quick_turn_min ?? undefined}
                    initialLiveLegMin={o.live_leg_min ?? undefined}
                    onSubmit={(values) => {
                      setManualQuoteBusy(true)
                      void submitDeskManualQuote(trip.id, o.id, values)
                        .then(() => {
                          setManualQuoteOfferId(null)
                          setSelected((s) => ({ ...s, [o.id]: true }))
                          setPricingOfferId(o.id)
                          setError(null)
                        })
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        )
                        .finally(() => setManualQuoteBusy(false))
                    }}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {showQuoteComposer ? (
        <div className="space-y-2 rounded-md border border-gold/40 bg-gold/10 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm text-gold">
              {trip.hard_quote ? 'Send another quote' : 'Send hard quote'}
            </div>
            {trip.hard_quote && composeAnotherQuote ? (
              <button
                type="button"
                className="text-xs text-muted hover:text-cream"
                onClick={() => setComposeAnotherQuote(false)}
              >
                Cancel
              </button>
            ) : null}
          </div>
          <ClientEmailRecipientsBubble
            clientId={trip.client_id}
            value={emailSel}
            onChange={setEmailSel}
          />
          <button
            type="button"
            disabled={picked.length === 0 || emailSel.to.length === 0}
            className="rounded bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
            onClick={() => {
              const totals: Record<string, number> = {}
              for (const oid of picked) {
                const o = trip.offers.find((x) => x.id === oid)!
                const p = offerQuotePreviewFor(
                  o,
                  trip,
                  0,
                  clientEdits[oid] ?? null,
                  marginPct,
                )
                totals[oid] = clientEdits[oid] ?? p.client_total
              }
              if (trip.client_id) {
                rememberEmailsOnClient(
                  trip.client_id,
                  emailSel.to[0] ?? '',
                  [...emailSel.cc, ...emailSel.bcc],
                )
              }
              void selectOffersAndHardQuote(
                trip.id,
                picked,
                totals,
                emailSel.to,
                {
                  ccEmails: emailSel.cc,
                  bccEmails: emailSel.bcc,
                  marginPct,
                },
              )
                .then(() => {
                  setComposeAnotherQuote(false)
                  setError(null)
                })
                .catch((e) => setError(String(e)))
            }}
          >
            {trip.hard_quote ? 'Send another quote' : 'Send hard quote'} (
            {picked.length || 0})
          </button>
        </div>
      ) : null}

      {trip.hard_quote
        ? (() => {
            const hq = trip.hard_quote
            const clientStatus =
              hardQuoteStatus ??
              hardQuoteClientStatus({ trip_state: trip.state })
            const statusLabel = hardQuoteClientStatusLabel(clientStatus)
            const statusCls =
              clientStatus === 'accepted'
                ? 'text-onplan'
                : clientStatus === 'declined'
                  ? 'text-muted'
                  : 'text-gold'
            const options = hq.options?.length
              ? hq.options
              : [
                  {
                    offer_id: '_primary',
                    label: 'Option A',
                    client_total: hq.total,
                    eta_end: trip.promised_delivery,
                    fee_scope: null as null,
                    operator_name: undefined as string | undefined,
                    type_name: null as string | null,
                    tail: null as string | null,
                  },
                ]
            return (
              <div
                className={`rounded-md border p-3 ${
                  clientStatus === 'accepted'
                    ? 'border-onplan/50 bg-onplan/10'
                    : clientStatus === 'declined'
                      ? 'border-border/50 bg-ink/30'
                      : 'border-gold/40 bg-gold/10'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div
                    className={`text-sm ${
                      clientStatus === 'pending' ? 'text-gold' : 'text-cream'
                    }`}
                  >
                    Hard quote{' '}
                    {clientStatus === 'pending' ? 'sent' : 'response'}
                  </div>
                  <div className={`text-xs font-medium ${statusCls}`}>
                    {statusLabel}
                  </div>
                </div>
                <ul className="mt-2 space-y-2">
                  {options.map((opt) => {
                    const offer = trip.offers.find((x) => x.id === opt.offer_id)
                    const operator =
                      opt.operator_name || offer?.operator_name || 'Operator'
                    const typeName = opt.type_name || offer?.type_name || null
                    const tail = opt.tail || offer?.tail || null
                    let optLabel: string | null = null
                    let optCls = statusCls
                    if (clientStatus === 'accepted') {
                      if (
                        offer?.state === 'selected' ||
                        options.length === 1
                      ) {
                        optLabel = 'Accepted (Yes)'
                        optCls = 'text-onplan'
                      } else {
                        optLabel = 'Stood down'
                        optCls = 'text-muted'
                      }
                    } else if (clientStatus === 'declined') {
                      optLabel = 'Declined (No)'
                      optCls = 'text-muted'
                    }
                    // Pending: status shown once on the hard-quote header only.
                    return (
                      <li
                        key={opt.offer_id}
                        className="rounded border border-border/40 bg-ink/40 px-2.5 py-2"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="text-sm font-medium text-cream">
                            {operator}
                            {typeName ? (
                              <span className="font-normal text-cream/80">
                                {' '}
                                · {typeName}
                              </span>
                            ) : null}
                            {tail ? (
                              <span className="avionic ml-1 text-xs text-cream/70">
                                {tail}
                              </span>
                            ) : null}
                          </div>
                          {optLabel ? (
                            <div className={`text-xs font-medium ${optCls}`}>
                              {optLabel}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-1 avionic text-sm text-gold">
                          ${opt.client_total.toFixed(0)}
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <div className="mt-2 flex flex-wrap gap-3">
                  {clientStatus === 'pending' ? (
                    <Link
                      className="text-xs text-gold"
                      to={`/accept/${hq.accept_token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview client accept page →
                    </Link>
                  ) : null}
                  {canSendAnotherQuote && !showQuoteComposer ? (
                    <button
                      type="button"
                      className="rounded border border-gold/50 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold"
                      onClick={() => {
                        const pre: Record<string, boolean> = {}
                        for (const o of trip.offers) {
                          if (o.state !== 'quoted' && o.state !== 'selected') {
                            continue
                          }
                          const inCurrent = hq.options?.some(
                            (opt) => opt.offer_id === o.id,
                          )
                          pre[o.id] =
                            Boolean(inCurrent) || o.state === 'selected'
                        }
                        setSelected(pre)
                        setComposeAnotherQuote(true)
                      }}
                    >
                      Send another quote
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })()
        : null}
    </div>
  )
}
