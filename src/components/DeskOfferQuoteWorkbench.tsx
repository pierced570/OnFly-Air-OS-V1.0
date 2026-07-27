/**
 * Desk quote workbench — manual operator quotes, hard-quote send,
 * client margin/tax edit. Meant to stay inside Dispatch center.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
import { formatTaxLineDesk } from '@/domain/tax'
import { rememberEmailsOnClient } from '@/lib/clientStore'
import {
  buildHardQuoteEmailPayload,
  renderHardQuoteEmail,
} from '@/lib/hardQuoteEmail'
import {
  deskApproveTrip,
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
  const [pricingOfferId, setPricingOfferId] = useState<string | null>(null)
  const [emailSel, setEmailSel] = useState<ClientEmailSelection>(
    emptyClientEmailSelection,
  )
  const [composeAnotherQuote, setComposeAnotherQuote] = useState(false)
  const [manualQuoteOfferId, setManualQuoteOfferId] = useState<string | null>(
    null,
  )
  const [manualQuoteBusy, setManualQuoteBusy] = useState(false)
  const [approveBusy, setApproveBusy] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [emailPreview, setEmailPreview] = useState<{
    html: string
    subject: string
  } | null>(null)
  const pricingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setEmailSel(defaultClientEmailSelection(trip?.client_id))
  }, [trip?.client_id])

  useEffect(() => {
    return () => {
      if (pricingSaveTimer.current) clearTimeout(pricingSaveTimer.current)
    }
  }, [])

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

  const canApproveTrip =
    quoteableIds.length > 0 &&
    hardQuoteStatus !== 'accepted' &&
    trip != null &&
    !['booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(
      trip.state,
    )

  if (!trip) {
    return (
      <div className="mt-3 rounded-md border border-border bg-ink/40 p-3 text-sm text-muted">
        Trip not loaded.
      </div>
    )
  }

  const active = trip
  const picked = quoteableIds.filter((oid) => selected[oid])
  // Margin is applied later when building client totals — not edited on this
  // early waterfall stage (operator quotes → hard quote).
  const marginPct =
    active.offer_margin_pct != null && Number.isFinite(active.offer_margin_pct)
      ? active.offer_margin_pct
      : DEFAULT_OFFER_MARGIN_PCT

  function scheduleHardQuotePricingSave(
    offerId: string,
    clientTotal: number,
  ) {
    const t = getTrip(tripId)
    if (!t?.hard_quote?.options?.some((opt) => opt.offer_id === offerId)) {
      return
    }
    if (
      hardQuoteClientStatus({
        trip_state: t.state,
        client_decision: t.hard_quote.client_decision,
        accepted_at: t.hard_quote.accepted_at,
        declined_at: t.hard_quote.declined_at,
      }) === 'accepted'
    ) {
      return
    }
    if (pricingSaveTimer.current) clearTimeout(pricingSaveTimer.current)
    pricingSaveTimer.current = setTimeout(() => {
      try {
        const latest = getTrip(tripId)
        if (!latest?.hard_quote?.options) return
        const opts = latest.hard_quote.options.map((opt) => ({
          offer_id: opt.offer_id,
          client_total:
            opt.offer_id === offerId ? clientTotal : opt.client_total,
        }))
        const margin =
          latest.offer_margin_pct != null &&
          Number.isFinite(latest.offer_margin_pct)
            ? latest.offer_margin_pct
            : DEFAULT_OFFER_MARGIN_PCT
        updateHardQuoteClientPricing(tripId, {
          margin_pct: margin,
          options: opts,
        })
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, 350)
  }

  function openClientQuotePreview() {
    if (picked.length === 0 || emailSel.to.length === 0) return
    const optionInputs = picked.map((oid, i) => {
      const o = active.offers.find((x) => x.id === oid)!
      const p = offerQuotePreviewFor(
        o,
        active,
        0,
        clientEdits[oid] ?? null,
        marginPct,
      )
      return {
        offer_id: oid,
        label: `Option ${String.fromCharCode(65 + i)}`,
        type_name: o.type_name,
        time_to_position_min: o.time_to_position_min,
        quick_turn_min: o.quick_turn_min,
        live_leg_min: o.live_leg_min,
        client_total: clientEdits[oid] ?? p.client_total,
      }
    })
    const payload = buildHardQuoteEmailPayload({
      trip: active,
      options: optionInputs,
      acceptUrl: active.hard_quote?.accept_token
        ? `/accept/${active.hard_quote.accept_token}`
        : '/accept/preview',
      goAtIso: new Date().toISOString(),
    })
    const rendered = renderHardQuoteEmail(payload)
    setEmailPreview({ html: rendered.html, subject: rendered.subject })
  }

  async function confirmSendClientQuote() {
    const totals: Record<string, number> = {}
    for (const oid of picked) {
      const o = active.offers.find((x) => x.id === oid)!
      const p = offerQuotePreviewFor(
        o,
        active,
        0,
        clientEdits[oid] ?? null,
        marginPct,
      )
      totals[oid] = clientEdits[oid] ?? p.client_total
    }
    if (active.client_id) {
      rememberEmailsOnClient(
        active.client_id,
        emailSel.to[0] ?? '',
        [...emailSel.cc, ...emailSel.bcc],
      )
    }
    setSendBusy(true)
    try {
      await selectOffersAndHardQuote(active.id, picked, totals, emailSel.to, {
        ccEmails: emailSel.cc,
        bccEmails: emailSel.bcc,
        marginPct,
      })
      setComposeAnotherQuote(false)
      setEmailPreview(null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSendBusy(false)
    }
  }

  const sendLabel = active.hard_quote
    ? 'Resend client quote'
    : 'Send client quote'

  return (
    <div className="mt-3 space-y-3 rounded-md border border-gold/40 bg-ink/50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-gold">
          Quotes & pricing
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
            o.price_net != null
              ? clientTotalForOffer(o, {
                  ...trip,
                  offer_margin_pct: marginPct,
                })
              : null
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
                    Client pricing
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
                        <div key={`${line.code}-${line.note}`}>
                          {formatTaxLineDesk(line)}
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
                        onChange={(e) => {
                          const next = Number(e.target.value)
                          setClientEdits((m) => ({
                            ...m,
                            [o.id]: next,
                          }))
                          scheduleHardQuotePricingSave(o.id, next)
                        }}
                      />
                    </label>
                  </div>
                  <div className="font-mono text-[11px] text-cream/80">
                    TTP {formatMinutes(preview.ttp_min)} · turn{' '}
                    {formatMinutes(preview.turn_load_min)} · live{' '}
                    {formatMinutes(preview.live_leg_min)}
                  </div>
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

      {canApproveTrip ? (
        <button
          type="button"
          disabled={approveBusy}
          className="w-full rounded-md bg-gold px-3 py-2 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
          onClick={() => {
            const prefer =
              picked[0] ??
              quoteableIds.find((id) => {
                const o = trip.offers.find((x) => x.id === id)
                return o?.state === 'selected'
              }) ??
              quoteableIds[0]
            setApproveBusy(true)
            void deskApproveTrip(trip.id, prefer)
              .then(() => setError(null))
              .catch((e) =>
                setError(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setApproveBusy(false))
          }}
        >
          {approveBusy ? 'Approving…' : 'Approve trip'}
        </button>
      ) : null}

      {showQuoteComposer ? (
        <div className="space-y-2 rounded-md border border-gold/40 bg-gold/10 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm text-gold">{sendLabel}</div>
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
            onClick={() => openClientQuotePreview()}
          >
            Preview &amp; {sendLabel.toLowerCase()} ({picked.length || 0})
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
                {canSendAnotherQuote && !showQuoteComposer ? (
                  <div className="mt-2">
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
                      Resend client quote
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })()
        : null}

      {emailPreview ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Client quote email preview"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-border bg-cream sm:rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">
                  Email preview
                </h3>
                <p className="truncate text-[11px] text-muted">
                  {emailPreview.subject}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setEmailPreview(null)}
                disabled={sendBusy}
              >
                Close
              </button>
            </div>
            <iframe
              title="Client quote email preview"
              className="min-h-[50vh] w-full flex-1 bg-white"
              srcDoc={emailPreview.html}
            />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-white px-4 py-3">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-2 text-sm text-ink"
                onClick={() => setEmailPreview(null)}
                disabled={sendBusy}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                disabled={sendBusy}
                onClick={() => void confirmSendClientQuote()}
              >
                {sendBusy ? 'Sending…' : `Confirm — ${sendLabel}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
