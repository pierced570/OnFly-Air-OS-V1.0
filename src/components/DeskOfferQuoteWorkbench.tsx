/**
 * Desk quote workbench — manual operator quotes, hard-quote send,
 * client margin/tax edit. Meant to stay inside Dispatch center.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  AircraftTypeSelect,
  initialAircraftTypeSelectValue,
} from '@/components/AircraftTypeSelect'
import {
  ClientEmailRecipientsBubble,
  defaultClientEmailSelection,
  emptyClientEmailSelection,
  type ClientEmailSelection,
} from '@/components/ClientEmailRecipientsBubble'
import { ClientLogisticsQuotePreview } from '@/components/ClientLogisticsQuotePreview'
import { OfferQuoteFactsBlock } from '@/components/OfferQuoteFactsBlock'
import { OfferQuoteForm } from '@/components/OfferQuoteForm'
import {
  buildLogisticsQuoteOption,
  logisticsQuoteTitle,
} from '@/domain/clientLogisticsQuote'
import {
  hardQuoteClientStatus,
  hardQuoteClientStatusLabel,
} from '@/domain/hardQuoteClientStatus'
import { DISCLOSURE_295_24_TEMPLATE } from '@/domain/offers'
import { DEFAULT_OFFER_MARGIN_PCT } from '@/domain/offerQuotePreview'
import { DEFAULT_QUICK_TURN_MIN } from '@/domain/offerQuoteTiming'
import {
  offerQuoteFacts,
  offerRecipientStatus,
} from '@/domain/offerRecipients'
import { formatTaxLineDesk } from '@/domain/tax'
import { rememberEmailsOnClient } from '@/lib/clientStore'
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
  payloadKindOf,
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
  const [clientQuotePreview, setClientQuotePreview] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [manualQuoteOfferId, setManualQuoteOfferId] = useState<string | null>(
    null,
  )
  const [manualQuoteBusy, setManualQuoteBusy] = useState(false)
  const [pricingBusy, setPricingBusy] = useState(false)
  const [approveBusy, setApproveBusy] = useState(false)
  /** Confirmed aircraft types for hard-quote send (offerId → label). */
  const [confirmedTypes, setConfirmedTypes] = useState<Record<string, string>>(
    {},
  )

  useEffect(() => {
    setEmailSel(defaultClientEmailSelection(trip?.client_id))
  }, [trip?.client_id])

  useEffect(() => {
    if (!trip) return
    setConfirmedTypes((prev) => {
      const next = { ...prev }
      for (const o of trip.offers) {
        if (next[o.id]) continue
        const suggested = initialAircraftTypeSelectValue(o.type_name)
        if (suggested) next[o.id] = suggested
      }
      return next
    })
  }, [trip])

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

  const liveTrip = trip

  const picked = quoteableIds.filter((oid) => selected[oid])
  // Margin is applied later when building client totals — not edited on this
  // early waterfall stage (operator quotes → hard quote).
  const marginPct =
    liveTrip.offer_margin_pct != null &&
    Number.isFinite(liveTrip.offer_margin_pct)
      ? liveTrip.offer_margin_pct
      : DEFAULT_OFFER_MARGIN_PCT

  const canPreviewClientQuote =
    picked.length > 0 &&
    emailSel.to.length > 0 &&
    picked.every((oid) => (confirmedTypes[oid] ?? '').trim())

  const clientPreviewOptions =
    clientQuotePreview && canPreviewClientQuote
      ? picked.map((oid, i) => {
          const o = liveTrip.offers.find((x) => x.id === oid)!
          const p = offerQuotePreviewFor(
            o,
            liveTrip,
            0,
            clientEdits[oid] ?? null,
            marginPct,
          )
          const typeName = confirmedTypes[oid]!.trim()
          return buildLogisticsQuoteOption({
            offer_id: oid,
            label: `Option ${String.fromCharCode(65 + i)}`,
            type_name: typeName,
            time_to_position_min: o.time_to_position_min,
            quick_turn_min: o.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
            live_leg_min: o.live_leg_min,
            client_total: clientEdits[oid] ?? p.client_total,
            lane: liveTrip.lane,
            goAtIso: new Date().toISOString(),
          })
        })
      : []

  const kind = payloadKindOf(liveTrip)
  const showPaxDisclosure = kind === 'pax' || kind === 'both'

  function sendHardQuoteNow() {
    const totals: Record<string, number> = {}
    const typeNamesByOffer: Record<string, string> = {}
    for (const oid of picked) {
      const o = liveTrip.offers.find((x) => x.id === oid)!
      const p = offerQuotePreviewFor(
        o,
        liveTrip,
        0,
        clientEdits[oid] ?? null,
        marginPct,
      )
      totals[oid] = clientEdits[oid] ?? p.client_total
      typeNamesByOffer[oid] = confirmedTypes[oid]!.trim()
    }
    if (liveTrip.client_id) {
      rememberEmailsOnClient(
        liveTrip.client_id,
        emailSel.to[0] ?? '',
        [...emailSel.cc, ...emailSel.bcc],
      )
    }
    setSendBusy(true)
    void selectOffersAndHardQuote(liveTrip.id, picked, totals, emailSel.to, {
      ccEmails: emailSel.cc,
      bccEmails: emailSel.bcc,
      marginPct,
      typeNamesByOffer,
    })
      .then(() => {
        setComposeAnotherQuote(false)
        setClientQuotePreview(false)
        setError(null)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setSendBusy(false))
  }

  return (
    <div className="mt-3 space-y-4 border-t border-gold/30 pt-3">
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

      <ul className="space-y-4">
        {liveTrip.offers.map((o) => {
          const status = offerRecipientStatus(o.state)
          if (status === 'no' && o.declined_acked_at) return null
          if (status === 'stood_down' || status === 'expired') return null
          const facts = offerQuoteFacts(o)
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
              className="space-y-2 border-t border-border/40 pt-3 first:border-t-0 first:pt-0"
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
                  </div>
                  {facts ? (
                    <OfferQuoteFactsBlock
                      facts={facts}
                      clientTotal={
                        priced
                          ? (clientEdits[o.id] ?? priced.client)
                          : null
                      }
                      fetExempt={priced?.fetExempt}
                    />
                  ) : (
                    <div className="mt-1 text-[11px] text-muted">
                      No quote yet
                    </div>
                  )}
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
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted">
                    Client pricing detail
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-0.5 font-mono text-[11px] text-muted">
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
                        type="text"
                        inputMode="decimal"
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 avionic text-sm text-cream"
                        value={String(
                          clientEdits[o.id] ?? preview.client_total,
                        )}
                        onChange={(e) => {
                          const v = e.target.value.replace(/,/g, '')
                          if (v === '' || /^\d*\.?\d*$/.test(v)) {
                            setClientEdits((m) => ({
                              ...m,
                              [o.id]:
                                v === '' ? preview.client_total : Number(v),
                            }))
                          }
                        }}
                      />
                    </label>
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
                <div className="pt-1">
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
        <div className="space-y-3 border-t border-gold/30 pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm text-gold">
              {trip.hard_quote ? 'Send another quote' : 'Send hard quote'}
            </div>
            {trip.hard_quote && composeAnotherQuote ? (
              <button
                type="button"
                className="text-xs text-muted hover:text-cream"
                onClick={() => {
                  setComposeAnotherQuote(false)
                  setClientQuotePreview(false)
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
          <ClientEmailRecipientsBubble
            clientId={trip.client_id}
            value={emailSel}
            onChange={(next) => {
              setEmailSel(next)
              setClientQuotePreview(false)
            }}
            embedded
          />
          {picked.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs text-muted">
                Confirm aircraft type before send
              </div>
              {picked.map((oid) => {
                const o = trip.offers.find((x) => x.id === oid)
                if (!o) return null
                return (
                  <AircraftTypeSelect
                    key={oid}
                    label={`${o.operator_name || 'Option'} · ${o.tail || 'TBD'}`}
                    draft={o.type_name}
                    value={confirmedTypes[oid] ?? ''}
                    onChange={(v) => {
                      setConfirmedTypes((m) => ({ ...m, [oid]: v }))
                      setClientQuotePreview(false)
                    }}
                  />
                )
              })}
            </div>
          ) : null}

          {clientQuotePreview && clientPreviewOptions.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs text-muted">
                To: {emailSel.to.join(', ') || '—'}
                {emailSel.cc.length ? ` · CC: ${emailSel.cc.join(', ')}` : ''}
                {emailSel.bcc.length ? ` · BCC: ${emailSel.bcc.join(', ')}` : ''}
              </div>
              <ClientLogisticsQuotePreview
                title={logisticsQuoteTitle(trip.lane)}
                options={clientPreviewOptions}
                previewBanner="Client preview — what they get in email / accept link (no operator names or margins)"
                disclosureText={
                  showPaxDisclosure ? DISCLOSURE_295_24_TEMPLATE : null
                }
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={sendBusy}
                  className="rounded bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
                  onClick={sendHardQuoteNow}
                >
                  {sendBusy
                    ? 'Sending…'
                    : trip.hard_quote
                      ? `Confirm & send another (${picked.length})`
                      : `Confirm & send hard quote (${picked.length})`}
                </button>
                <button
                  type="button"
                  disabled={sendBusy}
                  className="rounded border border-border px-3 py-2 text-sm text-muted hover:text-cream disabled:opacity-40"
                  onClick={() => setClientQuotePreview(false)}
                >
                  Back to edit
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!canPreviewClientQuote}
              className="rounded bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
              onClick={() => {
                setError(null)
                setClientQuotePreview(true)
              }}
            >
              {trip.hard_quote
                ? `Preview client quote (${picked.length || 0})`
                : `Preview client quote (${picked.length || 0})`}
            </button>
          )}
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
              <div className="space-y-2 border-t border-border/50 pt-3">
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
                <ul className="space-y-3">
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
                    const facts = offer ? offerQuoteFacts(offer) : null
                    return (
                      <li key={opt.offer_id} className="space-y-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="text-sm font-medium text-cream">
                            {operator}
                          </div>
                          {optLabel ? (
                            <div className={`text-xs font-medium ${optCls}`}>
                              {optLabel}
                            </div>
                          ) : null}
                        </div>
                        {facts ? (
                          <OfferQuoteFactsBlock
                            facts={facts}
                            clientTotal={opt.client_total}
                          />
                        ) : (
                          <div className="avionic text-sm text-gold">
                            ${opt.client_total.toFixed(0)}
                            {typeName ? ` · ${typeName}` : ''}
                            {tail ? ` · ${tail}` : ''}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {canSendAnotherQuote && !showQuoteComposer ? (
                  <div className="pt-1">
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
                  </div>
                ) : null}
              </div>
            )
          })()
        : null}
    </div>
  )
}
