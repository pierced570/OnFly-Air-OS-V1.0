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
import { OfferQuoteForm } from '@/components/OfferQuoteForm'
import {
  buildCharterMissionChips,
  buildLogisticsQuoteOption,
  deskRankLabels,
  finalizeLogisticsQuoteOptions,
  logisticsQuoteTitle,
} from '@/domain/clientLogisticsQuote'
import {
  hardQuoteClientStatus,
  hardQuoteClientStatusLabel,
} from '@/domain/hardQuoteClientStatus'
import { DISCLOSURE_295_24_TEMPLATE } from '@/domain/offers'
import {
  DEFAULT_OFFER_MARGIN_PCT,
  formatMinutes,
} from '@/domain/offerQuotePreview'
import {
  DEFAULT_QUICK_TURN_MIN,
  buildDeskOfferQuoteTimeline,
} from '@/domain/offerQuoteTiming'
import {
  offerQuoteFacts,
  offerRecipientStatus,
} from '@/domain/offerRecipients'
import {
  fetAppliesAtMtow,
  fetExemptMtowThreshold,
  formatTaxLineDesk,
  type FetOverride,
} from '@/domain/tax'
import { rememberEmailsOnClient } from '@/lib/clientStore'
import {
  selectOffersAndHardQuote,
  submitDeskManualQuote,
  updateHardQuoteClientPricing,
} from '@/lib/offerFlow'
import { NumericDraftInput } from '@/components/NumericDraftInput'
import { offerQuotePreviewFor } from '@/lib/offerPricing'
import { resolveAircraftMtowLbs } from '@/lib/resolveAircraftMtow'
import { getTaxRates } from '@/lib/taxRatesStore'
import {
  getTrip,
  listTripsStable,
  mutateTrip,
  payloadKindOf,
  subscribeTrips,
} from '@/lib/tripStore'

type Props = {
  tripId: string
  onClose?: () => void
  /** Open the desk manual-quote form for this offer on mount. */
  initialManualOfferId?: string | null
}

function feeBadgeLabel(feeScope: string | null | undefined): string | null {
  if (feeScope === 'aircraft_and_fees') return 'All fees in'
  if (feeScope === 'aircraft_only') return 'Aircraft only'
  return null
}

/** `undefined` edit → auto; otherwise force on/off. */
function fetOverrideFromEdit(
  edit: boolean | undefined,
): FetOverride | null {
  if (edit === undefined) return null
  return edit ? 'on' : 'off'
}

export function DeskOfferQuoteWorkbench({
  tripId,
  onClose,
  initialManualOfferId = null,
}: Props) {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = trips.find((t) => t.id === tripId) ?? getTrip(tripId)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [clientEdits, setClientEdits] = useState<Record<string, number>>({})
  const [marginEdits, setMarginEdits] = useState<Record<string, number>>({})
  /** Rare per-offer FET include override (`undefined` = auto from MTOW). */
  const [fetEdits, setFetEdits] = useState<Record<string, boolean>>({})
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
    initialManualOfferId,
  )
  const [manualQuoteBusy, setManualQuoteBusy] = useState(false)
  const [pricingBusy, setPricingBusy] = useState(false)
  /** Confirmed aircraft types for hard-quote send (offerId → label). */
  const [confirmedTypes, setConfirmedTypes] = useState<Record<string, string>>(
    {},
  )
  const [poDraft, setPoDraft] = useState('')

  useEffect(() => {
    if (!initialManualOfferId) return
    setManualQuoteOfferId(initialManualOfferId)
    setExpanded((m) => ({ ...m, [initialManualOfferId]: true }))
  }, [initialManualOfferId])

  useEffect(() => {
    setEmailSel(defaultClientEmailSelection(trip?.client_id))
  }, [trip?.client_id])

  useEffect(() => {
    setPoDraft(
      trip?.po_number?.trim() || trip?.quick?.po?.trim() || '',
    )
  }, [trip?.id, trip?.po_number, trip?.quick?.po])

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
  const marginPct =
    liveTrip.offer_margin_pct != null &&
    Number.isFinite(liveTrip.offer_margin_pct)
      ? liveTrip.offer_margin_pct
      : DEFAULT_OFFER_MARGIN_PCT

  const canPreviewClientQuote =
    picked.length > 0 &&
    emailSel.to.length > 0 &&
    picked.every((oid) => (confirmedTypes[oid] ?? '').trim()) &&
    Boolean(poDraft.trim())

  const needsTypeConfirm = picked.some(
    (oid) => !(confirmedTypes[oid] ?? '').trim(),
  )

  function persistPoDraft() {
    const cleaned = poDraft.trim()
    mutateTrip(liveTrip.id, (t) => {
      t.po_number = cleaned || null
      if (t.quick) t.quick.po = cleaned
    })
  }

  function sendHardQuoteNow() {
    if (!poDraft.trim()) {
      setError('Enter PO # before sending the hard quote')
      return
    }
    persistPoDraft()
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
        fetOverrideFromEdit(fetEdits[oid]),
      )
      totals[oid] = p.client_total
      typeNamesByOffer[oid] = confirmedTypes[oid]!.trim()
      sendMargin = p.margin_pct
    }
    if (liveTrip.client_id) {
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

  const clientPreviewOptions =
    clientQuotePreview && canPreviewClientQuote
      ? finalizeLogisticsQuoteOptions(
          picked.map((oid, i) => {
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
              fetOverrideFromEdit(fetEdits[oid]),
            )
            const typeName = confirmedTypes[oid]!.trim()
            return buildLogisticsQuoteOption({
              offer_id: oid,
              label: `Option ${String.fromCharCode(65 + i)}`,
              option_index: i,
              type_name: typeName,
              time_to_position_min: o.time_to_position_min,
              quick_turn_min: o.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
              live_leg_min: o.live_leg_min,
              client_total: p.client_total,
              lane: liveTrip.lane,
              goAtIso: new Date().toISOString(),
              pickup_location: liveTrip.portal_pickup_address,
              dropoff_location: liveTrip.portal_dropoff_address,
            })
          }),
        )
      : []

  /** Desk-only cheapest/fastest among quoteable offers with a price. */
  const deskRankByOfferId = (() => {
    const rows = quoteableIds
      .map((oid) => {
        const o = liveTrip.offers.find((x) => x.id === oid)
        if (!o || o.price_net == null) return null
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
          fetOverrideFromEdit(fetEdits[oid]),
        )
        return buildLogisticsQuoteOption({
          offer_id: oid,
          label: o.operator_name || oid,
          type_name: o.type_name,
          time_to_position_min: o.time_to_position_min,
          quick_turn_min: o.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
          live_leg_min: o.live_leg_min,
          client_total: p.client_total,
          lane: liveTrip.lane,
          goAtIso: new Date().toISOString(),
          pickup_location: liveTrip.portal_pickup_address,
          dropoff_location: liveTrip.portal_dropoff_address,
        })
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
    const ranked = finalizeLogisticsQuoteOptions(rows)
    return Object.fromEntries(
      ranked.map((r) => [r.offer_id, deskRankLabels(r)]),
    ) as Record<string, string[]>
  })()

  const previewMissionChips = buildCharterMissionChips({
    payload_kind: payloadKindOf(liveTrip),
    payload_summary: liveTrip.payload_summary,
    ready_label: liveTrip.ready_label,
  })
  const previewRef =
    (liveTrip.code ?? '').trim() || `T-${liveTrip.ref}`

  const kind = payloadKindOf(liveTrip)
  const showPaxDisclosure = kind === 'pax' || kind === 'both'

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
    const lock = pricingLock[o.id] ?? (hqOpt != null ? 'total' : 'margin')
    const draftMargin = marginEdits[o.id] ?? marginPct
    const draftTotal = clientEdits[o.id] ?? hqOpt?.client_total ?? null
    const fetOverride = fetOverrideFromEdit(fetEdits[o.id])
    const preview =
      o.price_net != null
        ? offerQuotePreviewFor(
            o,
            liveTrip,
            0,
            lock === 'total' ? draftTotal : null,
            draftMargin,
            fetOverride,
          )
        : null
    const cand =
      liveTrip.candidates.find((c) => c.aircraft_id === o.aircraft_id) ??
      liveTrip.candidates.find((c) => c.tail === o.tail)
    const mtowLbs = resolveAircraftMtowLbs({
      mtowLbs: cand?.mtow_lbs ?? null,
      typeName: cand?.type_name ?? o.type_name,
      tail: o.tail,
      selectedAircraftId: o.aircraft_id,
      candidates: liveTrip.candidates,
    })
    const rates = getTaxRates()
    const exemptThresh = fetExemptMtowThreshold(rates)
    const autoFetOn = fetAppliesAtMtow(mtowLbs, rates).applies
    const fetOn = fetEdits[o.id] ?? autoFetOn
    const fetIsOverride = fetEdits[o.id] !== undefined
    const canManual = status !== 'no' && hardQuoteStatus !== 'accepted'
    const inHardQuote = Boolean(hqOpt)
    const included = Boolean(selected[o.id])
    const isOpen = Boolean(expanded[o.id])
    const turn = o.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN
    const timeline =
      o.time_to_position_min != null && o.live_leg_min != null
        ? buildDeskOfferQuoteTimeline({
            lane: liveTrip.lane,
            timeToPositionMin: o.time_to_position_min,
            quickTurnMin: turn,
            liveLegMin: o.live_leg_min,
            pickupLocation: liveTrip.portal_pickup_address,
            dropoffLocation: liveTrip.portal_dropoff_address,
          })
        : null
    const feeLabel = feeBadgeLabel(o.fee_scope)
    const summaryBits = [
      facts?.type_name,
      facts?.tail,
      facts ? `NET $${Math.round(facts.price_net).toLocaleString('en-US')}` : null,
    ].filter(Boolean)

    return (
      <li
        key={o.id}
        className={[
          'rounded-md border px-3 py-2.5',
          selectable && included
            ? 'border-gold/60 bg-gold/5 ring-1 ring-gold/25'
            : 'border-border/50 bg-ink/40',
        ].join(' ')}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {selectable && (showQuoteComposer || !liveTrip.hard_quote) ? (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={included}
                onChange={(e) =>
                  setSelected((s) => ({
                    ...s,
                    [o.id]: e.target.checked,
                  }))
                }
              />
              <span className="text-sm font-semibold text-gold">
                {o.operator_name}
              </span>
            </label>
          ) : (
            <div className="text-sm font-semibold text-gold">
              {o.operator_name}
            </div>
          )}

          <div className="min-w-0 flex-1 text-xs text-cream/85">
            {summaryBits.join(' · ') || 'No quote yet'}
          </div>

          {(deskRankByOfferId[o.id] ?? []).map((label) => (
            <span
              key={label}
              className="rounded border border-cream/25 bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cream/90"
              title="Desk only — not shown to the client"
            >
              {label}
            </span>
          ))}

          {timeline ? (
            <span className="rounded border border-gold/45 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
              {timeline.deliversBadge}
            </span>
          ) : null}

          {canManual ? (
            <button
              type="button"
              className={[
                'min-h-11 rounded-md px-2.5 py-2 text-xs font-semibold',
                manualQuoteOfferId === o.id
                  ? 'border border-gold/50 bg-transparent text-gold hover:bg-gold/10'
                  : 'bg-gold text-ink hover:bg-gold-lt',
              ].join(' ')}
              onClick={() => {
                setExpanded((m) => ({ ...m, [o.id]: true }))
                setManualQuoteOfferId((id) => (id === o.id ? null : o.id))
              }}
            >
              {manualQuoteOfferId === o.id
                ? 'Cancel'
                : o.price_net != null
                  ? 'Edit quote'
                  : 'Add quote manually'}
            </button>
          ) : null}

          {selectable || facts || canManual ? (
            <button
              type="button"
              className="min-h-11 rounded-md px-3 py-2 text-xs text-muted hover:bg-surface-2 hover:text-cream"
              onClick={() =>
                setExpanded((m) => ({ ...m, [o.id]: !m[o.id] }))
              }
            >
              {isOpen ? 'Collapse ▲' : 'Expand ▼'}
            </button>
          ) : null}
        </div>

        {isOpen ? (
          <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
            {timeline ? (
              <div className="space-y-1.5">
                <div className="grid gap-2 sm:grid-cols-4">
                  {timeline.milestones.map((m) => (
                    <div
                      key={m.key}
                      className={[
                        'rounded-md border px-2.5 py-2',
                        m.key === 'delivered'
                          ? 'border-gold/50 bg-gold/10'
                          : 'border-border/50 bg-ink/50',
                      ].join(' ')}
                    >
                      <div className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted">
                        {m.label}
                      </div>
                      <div className="avionic mt-0.5 text-sm text-cream">
                        {m.clock}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-muted">
                  {timeline.chainHint}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2 rounded-md border border-border/40 bg-ink/30 px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wider text-muted">
                  Operator · wholesale
                </div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="avionic text-xl text-cream">
                    $
                    {facts
                      ? Math.round(facts.price_net).toLocaleString('en-US')
                      : '—'}
                  </div>
                  {feeLabel ? (
                    <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                      {feeLabel}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded border border-border/50 px-1.5 py-0.5 avionic text-cream/85">
                    TTP {formatMinutes(o.time_to_position_min)}
                  </span>
                  <span className="rounded border border-border/50 px-1.5 py-0.5 avionic text-cream/85">
                    Turn {formatMinutes(turn)}
                  </span>
                  <span className="rounded border border-border/50 px-1.5 py-0.5 avionic text-cream/85">
                    Live {formatMinutes(o.live_leg_min)}
                  </span>
                </div>
                {preview?.fet_exempt && preview.fet_override === 'auto' ? (
                  <div className="text-xs text-onplan">
                    FET-exempt — MTOW
                    {mtowLbs != null ? ` ${Math.round(mtowLbs)} lbs` : ''} ≤{' '}
                    {Math.round(exemptThresh).toLocaleString()} lbs (IRC §4281)
                  </div>
                ) : null}
                {preview?.fet_mtow_unknown &&
                preview.fet_override === 'auto' ? (
                  <div className="text-xs text-gold">
                    MTOW unknown — FET not charged until confirmed over{' '}
                    {Math.round(exemptThresh).toLocaleString()} lbs (§4281)
                  </div>
                ) : null}
              </div>

              {preview && hardQuoteStatus !== 'accepted' ? (
                <div className="space-y-2 rounded-md border border-gold/30 bg-gold/5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-wider text-gold">
                      Client · retail
                    </div>
                    <label
                      className="inline-flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider text-muted"
                      title={
                        fetIsOverride
                          ? 'Desk override — normally driven by aircraft MTOW'
                          : 'Auto from aircraft MTOW (§4281). Toggle only to override.'
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 accent-[#C9A227]"
                        checked={fetOn}
                        onChange={(e) => {
                          const next = e.target.checked
                          setFetEdits((m) => ({ ...m, [o.id]: next }))
                          // FET toggle always recomputes client total from margin.
                          setPricingLock((m) => ({
                            ...m,
                            [o.id]: 'margin',
                          }))
                          setClientEdits((m) => {
                            const cleared = { ...m }
                            delete cleared[o.id]
                            return cleared
                          })
                        }}
                      />
                      FET
                      {fetIsOverride ? (
                        <span className="normal-case tracking-normal text-gold/80">
                          override
                        </span>
                      ) : null}
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block text-xs text-muted">
                      Margin %
                      <NumericDraftInput
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-2.5 avionic text-sm text-cream"
                        value={
                          lock === 'margin' ? draftMargin : preview.margin_pct
                        }
                        onValueChange={(n) => {
                          setPricingLock((m) => ({
                            ...m,
                            [o.id]: 'margin',
                          }))
                          setClientEdits((m) => {
                            const next = { ...m }
                            delete next[o.id]
                            return next
                          })
                          if (n == null) return
                          setMarginEdits((m) => ({ ...m, [o.id]: n }))
                        }}
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      Client total $
                      <NumericDraftInput
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-2.5 avionic text-sm text-cream"
                        value={
                          lock === 'total' && draftTotal != null
                            ? draftTotal
                            : preview.client_total
                        }
                        onValueChange={(n) => {
                          setPricingLock((m) => ({
                            ...m,
                            [o.id]: 'total',
                          }))
                          if (n == null) return
                          setClientEdits((m) => ({
                            ...m,
                            [o.id]: n,
                          }))
                        }}
                      />
                    </label>
                  </div>
                  <div className="space-y-0.5 font-mono text-[11px] text-cream/85">
                    <div>
                      Air + margin {preview.margin_pct}% ($
                      {preview.client_air.toFixed(0)})
                    </div>
                    {preview.tax_lines.map((line) => (
                      <div key={`${line.code}-${line.note}`}>
                        {formatTaxLineDesk(line)}
                      </div>
                    ))}
                  </div>
                  <div className="text-lg font-semibold text-gold">
                    Client sees $
                    {Math.round(preview.client_total).toLocaleString('en-US')}
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
                <div className="rounded-md border border-border/40 px-3 py-2.5 font-mono text-[11px] text-cream/85">
                  Client $
                  {Math.round(preview.client_total).toLocaleString('en-US')} ·
                  Accepted
                </div>
              ) : (
                <div className="rounded-md border border-border/40 px-3 py-2.5 text-xs text-muted">
                  Enter an operator quote to price for the client.
                </div>
              )}
            </div>

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
                      setExpanded((m) => ({ ...m, [o.id]: true }))
                      setError(null)
                    })
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : String(e)),
                    )
                    .finally(() => setManualQuoteBusy(false))
                }}
              />
            ) : null}
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-gold/50 bg-ink/50 px-3.5 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
            Quotes · {quoteable.length} in
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Add quotes manually from a phone call, or wait for operators.
            Check to include in the client quote · expand for pricing &amp;
            ETAs.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="min-h-11 rounded-md px-3 py-2 text-xs text-muted hover:bg-surface-2 hover:text-cream"
            onClick={onClose}
          >
            Close compare
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-late">{error}</p> : null}

      {quoteable.length ? (
        <ul className="flex flex-col gap-2">
          {quoteable.map((o) => renderQuoteCard(o, true))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No operator quotes in yet — use{' '}
          <span className="text-gold">Add quote manually</span> on an awaiting
          operator below, or wait for Submitted quotes.
        </p>
      )}

      {awaiting.length ? (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Awaiting quote
          </div>
          <ul className="flex flex-col gap-2">
            {awaiting.map((o) => renderQuoteCard(o, false))}
          </ul>
        </div>
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
            layout="compact"
            embedded
          />
          <label className="block text-xs text-muted">
            PO #{' '}
            <span className="text-late">(required — goes on invoice / booking)</span>
            <input
              type="text"
              className="mt-1 w-full rounded border border-border bg-ink px-2 py-1.5 font-mono text-sm text-cream"
              value={poDraft}
              placeholder="Client PO / DocNumber"
              onChange={(e) => {
                setPoDraft(e.target.value)
                setClientQuotePreview(false)
              }}
              onBlur={persistPoDraft}
            />
          </label>
          {needsTypeConfirm ? (
            <div className="space-y-2">
              <div className="text-xs text-muted">
                Confirm aircraft type before send
              </div>
              {picked.map((oid) => {
                const o = trip.offers.find((x) => x.id === oid)
                if (!o) return null
                if ((confirmedTypes[oid] ?? '').trim()) return null
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
                previewBanner="Client preview — branded email / accept link (no operator names, margins, or cheapest/fastest flags)"
                disclosureText={
                  showPaxDisclosure ? DISCLOSURE_295_24_TEMPLATE : null
                }
                refLabel={previewRef}
                missionChips={previewMissionChips}
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
              {`Preview client quote (${picked.length || 0})`}
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
