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
import { formatTaxLineDesk, fetExemptMtowThreshold } from '@/domain/tax'
import { rememberEmailsOnClient } from '@/lib/clientStore'
import {
  selectOffersAndHardQuote,
  submitDeskManualQuote,
  updateHardQuoteClientPricing,
} from '@/lib/offerFlow'
import {
  offerQuotePreviewFor,
} from '@/lib/offerPricing'
import { getTaxRates } from '@/lib/taxRatesStore'
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
  const [marginEdits, setMarginEdits] = useState<Record<string, number>>({})
  /** Which field the desk last edited — drives forward vs reverse tax math. */
  const [pricingLock, setPricingLock] = useState<
    Record<string, 'total' | 'margin'>
  >({})
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

  // Seed client totals from the sent hard quote so the edit field matches.
  useEffect(() => {
    const opts = trip?.hard_quote?.options
    if (!opts?.length) return
    setClientEdits((prev) => {
      let changed = false
      const next = { ...prev }
      for (const opt of opts) {
        if (next[opt.offer_id] == null) {
          next[opt.offer_id] = opt.client_total
          changed = true
        }
      }
      return changed ? next : prev
    })
    setPricingLock((prev) => {
      let changed = false
      const next = { ...prev }
      for (const opt of opts) {
        if (!next[opt.offer_id]) {
          next[opt.offer_id] = 'total'
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [trip?.hard_quote?.accept_token, trip?.hard_quote?.options])

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
          const hqOpt = liveTrip.hard_quote?.options?.find(
            (opt) => opt.offer_id === oid,
          )
          const lock =
            pricingLock[oid] ?? (hqOpt != null ? 'total' : 'margin')
          const draftMargin = marginEdits[oid] ?? marginPct
          const draftTotal = clientEdits[oid] ?? hqOpt?.client_total ?? null
          const p = offerQuotePreviewFor(
            o,
            liveTrip,
            0,
            lock === 'total' ? draftTotal : null,
            draftMargin,
          )
          const typeName = confirmedTypes[oid]!.trim()
          return buildLogisticsQuoteOption({
            offer_id: oid,
            label: `Option ${String.fromCharCode(65 + i)}`,
            type_name: typeName,
            time_to_position_min: o.time_to_position_min,
            quick_turn_min: o.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
            live_leg_min: o.live_leg_min,
            client_total: p.client_total,
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
    let sendMargin = marginPct
    for (const oid of picked) {
      const o = liveTrip.offers.find((x) => x.id === oid)!
      const hqOpt = liveTrip.hard_quote?.options?.find(
        (opt) => opt.offer_id === oid,
      )
      const lock =
        pricingLock[oid] ?? (hqOpt != null ? 'total' : 'margin')
      const draftMargin = marginEdits[oid] ?? marginPct
      const draftTotal = clientEdits[oid] ?? hqOpt?.client_total ?? null
      const p = offerQuotePreviewFor(
        o,
        liveTrip,
        0,
        lock === 'total' ? draftTotal : null,
        draftMargin,
      )
      totals[oid] = p.client_total
      typeNamesByOffer[oid] = confirmedTypes[oid]!.trim()
      sendMargin = p.margin_pct
    }
    if (liveTrip.client_id) {
      // Remember extras the desk typed — do not treat quote To as invoice AP.
      rememberEmailsOnClient(liveTrip.client_id, '', emailSel.cc, emailSel.bcc)
    }
    setSendBusy(true)
    void selectOffersAndHardQuote(liveTrip.id, picked, totals, emailSel.to, {
      ccEmails: emailSel.cc,
      bccEmails: emailSel.bcc,
      marginPct: sendMargin,
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
    <div className="mt-3 space-y-4 rounded-xl border border-gold/50 bg-ink/50 px-3.5 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
            Compare &amp; price for client
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Select which operator quotes to present, set client total or margin
            %, then preview the email.
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

      {(() => {
        const quoteable = liveTrip.offers.filter((o) => {
          const status = offerRecipientStatus(o.state)
          if (status === 'no' && o.declined_acked_at) return false
          if (status === 'stood_down' || status === 'expired') return false
          return o.state === 'quoted' || o.state === 'selected'
        })
        const awaiting = liveTrip.offers.filter((o) => {
          const status = offerRecipientStatus(o.state)
          if (status === 'no' && o.declined_acked_at) return false
          if (status === 'stood_down' || status === 'expired') return false
          return o.state !== 'quoted' && o.state !== 'selected'
        })

        function renderQuoteCard(
          o: (typeof liveTrip.offers)[number],
          selectable: boolean,
        ) {
          const status = offerRecipientStatus(o.state)
          const facts = offerQuoteFacts(o)
          const hqOpt = liveTrip.hard_quote?.options?.find(
            (opt) => opt.offer_id === o.id,
          )
          const lock =
            pricingLock[o.id] ?? (hqOpt != null ? 'total' : 'margin')
          const draftMargin = marginEdits[o.id] ?? marginPct
          const draftTotal =
            clientEdits[o.id] ?? hqOpt?.client_total ?? null
          const preview =
            o.price_net != null
              ? offerQuotePreviewFor(
                  o,
                  liveTrip,
                  0,
                  lock === 'total' ? draftTotal : null,
                  draftMargin,
                )
              : null
          const cand =
            liveTrip.candidates.find((c) => c.aircraft_id === o.aircraft_id) ??
            liveTrip.candidates.find((c) => c.tail === o.tail)
          const mtowLbs = cand?.mtow_lbs ?? null
          const exemptThresh = fetExemptMtowThreshold(getTaxRates())
          const canManual =
            status !== 'no' && hardQuoteStatus !== 'accepted'
          const inHardQuote = Boolean(hqOpt)
          const included = Boolean(selected[o.id])
          return (
            <li
              key={o.id}
              className={[
                'flex min-w-[16rem] flex-1 flex-col gap-3 rounded-md border px-3 py-3',
                selectable && included
                  ? 'border-gold/60 bg-gold/5 ring-1 ring-gold/25'
                  : 'border-border/50 bg-ink/40',
              ].join(' ')}
            >
              {selectable &&
              (showQuoteComposer || !liveTrip.hard_quote) ? (
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={included}
                    onChange={(e) =>
                      setSelected((s) => ({
                        ...s,
                        [o.id]: e.target.checked,
                      }))
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gold">
                      {o.operator_name}
                    </span>
                    <span className="text-[11px] text-gold/80">
                      {included
                        ? 'Included in client quote'
                        : 'Tap to include'}
                    </span>
                  </span>
                </label>
              ) : (
                <div className="text-sm font-semibold text-gold">
                  {o.operator_name}
                </div>
              )}

              {facts ? (
                <OfferQuoteFactsBlock
                  facts={facts}
                  bare
                  fetExempt={preview?.fet_exempt}
                  mtowLbs={mtowLbs}
                  fetExemptThresholdLbs={exemptThresh}
                />
              ) : (
                <div className="text-[11px] text-muted">No quote yet</div>
              )}

              {preview && hardQuoteStatus !== 'accepted' ? (
                <div className="space-y-2 border-t border-border/40 pt-2">
                  <div className="text-[11px] uppercase tracking-wider text-gold">
                    Client price
                  </div>
                  <div className="grid gap-2">
                    <label className="block text-xs text-muted">
                      Margin %
                      <input
                        type="text"
                        inputMode="decimal"
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 avionic text-sm text-cream"
                        value={String(
                          lock === 'margin'
                            ? draftMargin
                            : preview.margin_pct,
                        )}
                        onChange={(e) => {
                          const v = e.target.value.replace(/,/g, '')
                          if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
                          const n = v === '' ? 0 : Number(v)
                          setPricingLock((m) => ({
                            ...m,
                            [o.id]: 'margin',
                          }))
                          setMarginEdits((m) => ({ ...m, [o.id]: n }))
                          setClientEdits((m) => {
                            const next = { ...m }
                            delete next[o.id]
                            return next
                          })
                        }}
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      Client total $
                      <input
                        type="text"
                        inputMode="decimal"
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-1 avionic text-sm text-cream"
                        value={String(
                          lock === 'total' && draftTotal != null
                            ? draftTotal
                            : preview.client_total,
                        )}
                        onChange={(e) => {
                          const v = e.target.value.replace(/,/g, '')
                          if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
                          setPricingLock((m) => ({
                            ...m,
                            [o.id]: 'total',
                          }))
                          setClientEdits((m) => ({
                            ...m,
                            [o.id]:
                              v === '' ? preview.client_total : Number(v),
                          }))
                        }}
                      />
                    </label>
                  </div>
                  <div className="space-y-0.5 font-mono text-[11px] text-cream/85">
                    <div>
                      Air ${preview.client_air.toFixed(0)} · margin{' '}
                      {preview.margin_pct}% (+$
                      {preview.margin_dollars.toFixed(0)})
                    </div>
                    {preview.tax_lines.map((line) => (
                      <div key={`${line.code}-${line.note}`}>
                        {formatTaxLineDesk(line)}
                      </div>
                    ))}
                    <div className="pt-0.5 text-gold">
                      Client sees ${preview.client_total.toFixed(0)}
                    </div>
                  </div>
                  {inHardQuote ? (
                    <button
                      type="button"
                      disabled={pricingBusy}
                      className="rounded border border-gold/50 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold disabled:opacity-40"
                      onClick={() => {
                        setPricingBusy(true)
                        const opts = (liveTrip.hard_quote?.options ?? []).map(
                          (opt) => ({
                            offer_id: opt.offer_id,
                            client_total:
                              opt.offer_id === o.id
                                ? preview.client_total
                                : opt.client_total,
                          }),
                        )
                        void updateHardQuoteClientPricing(liveTrip.id, {
                          margin_pct: preview.margin_pct,
                          options: opts,
                        })
                          .then(() => {
                            setClientEdits((m) => ({
                              ...m,
                              [o.id]: preview.client_total,
                            }))
                            setMarginEdits((m) => ({
                              ...m,
                              [o.id]: preview.margin_pct,
                            }))
                            setError(null)
                          })
                          .catch((e) =>
                            setError(
                              e instanceof Error ? e.message : String(e),
                            ),
                          )
                          .finally(() => setPricingBusy(false))
                      }}
                    >
                      {pricingBusy ? 'Updating…' : 'Update client quote'}
                    </button>
                  ) : null}
                </div>
              ) : preview && hardQuoteStatus === 'accepted' ? (
                <div className="border-t border-border/40 pt-2 font-mono text-[11px] text-cream/85">
                  Client ${preview.client_total.toFixed(0)} · Accepted
                </div>
              ) : null}

              {canManual ? (
                <button
                  type="button"
                  className="self-start text-xs font-medium text-gold hover:text-gold-lt"
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

              {manualQuoteOfferId === o.id ? (
                <OfferQuoteForm
                  lane={liveTrip.lane}
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
                    void submitDeskManualQuote(liveTrip.id, o.id, values)
                      .then(() => {
                        setManualQuoteOfferId(null)
                        setSelected((s) => ({ ...s, [o.id]: true }))
                        setError(null)
                      })
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      )
                      .finally(() => setManualQuoteBusy(false))
                  }}
                />
              ) : null}
            </li>
          )
        }

        return (
          <div className="space-y-4">
            {quoteable.length ? (
              <ul className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-stretch">
                {quoteable.map((o) => renderQuoteCard(o, true))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                No operator quotes in yet — wait for Submitted quotes, or enter
                one manually below.
              </p>
            )}
            {awaiting.length ? (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-muted">
                  Awaiting quote
                </div>
                <ul className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
                  {awaiting.map((o) => renderQuoteCard(o, false))}
                </ul>
              </div>
            ) : null}
          </div>
        )
      })()}

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
                previewBanner="Client preview — branded email / accept link (no operator names or margins)"
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
                <ul className="space-y-2">
                  {options.map((opt) => {
                    const offer = trip.offers.find((x) => x.id === opt.offer_id)
                    const operator =
                      opt.operator_name || offer?.operator_name || 'Operator'
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
                    return (
                      <li
                        key={opt.offer_id}
                        className="flex flex-wrap items-baseline justify-between gap-2"
                      >
                        <div className="text-sm text-cream">
                          {operator}
                          <span className="avionic ml-2 text-gold">
                            ${opt.client_total.toFixed(0)}
                          </span>
                        </div>
                        {optLabel ? (
                          <div className={`text-xs font-medium ${optCls}`}>
                            {optLabel}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
                {canSendAnotherQuote && !showQuoteComposer ? (
                  <div className="pt-1">
                    <button
                      type="button"
                      className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-ink hover:bg-gold-lt"
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
                      Revise — send another quote
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
