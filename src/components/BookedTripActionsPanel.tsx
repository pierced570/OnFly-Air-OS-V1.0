/**
 * Post-approve desk actions:
 * 1) QuickBooks native payment-request email (PO, ACH View & pay, QBO PDF)
 * 2) ETA sheet (tail + ETAs + tracking portal — no payment)
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  AircraftTypeSelect,
  initialAircraftTypeSelectValue,
} from '@/components/AircraftTypeSelect'
import {
  ClientEmailRecipientsBubble,
  defaultInvoiceEmailSelection,
  defaultTrackerEmailSelection,
  emptyClientEmailSelection,
  type ClientEmailSelection,
} from '@/components/ClientEmailRecipientsBubble'
import { InvoicePoVendorFields } from '@/components/InvoicePoVendorFields'
import { computeEtaSheetFromBookedTrip } from '@/lib/etaSheet'
import { TripPassengersPanel } from '@/components/TripPassengersPanel'
import {
  buildEtaSheetPreviewHtml,
  portalTrackingUrlForTrip,
  sendBookedEtaSheetToTrackers,
} from '@/lib/etaSheetSender'
import {
  flushPersistTrip,
  getTrip,
  listTripsStable,
  mutateTrip,
  safeTransitionTrip,
  sendTripInvoiceEmail,
  subscribeTrips,
} from '@/lib/tripStore'
import { tripRefLabel } from '@/domain/invoicePoHint'
import { resolveTripPoNumber } from '@/domain/tripPo'
import { tripRouteIcaos } from '@/domain/tripRouteIcaos'
import {
  getClient,
  recordPoUsed,
  recordVendorNumber,
  suggestNextPo,
  subscribeClients,
  listClients,
} from '@/lib/clientStore'

type Props = {
  tripId: string
}

export function BookedTripActionsPanel({ tripId }: Props) {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  useSyncExternalStore(subscribeClients, listClients, listClients)
  const trip = trips.find((t) => t.id === tripId) ?? getTrip(tripId)
  const [invoiceSel, setInvoiceSel] = useState<ClientEmailSelection>(
    emptyClientEmailSelection,
  )
  const [etaSel, setEtaSel] = useState<ClientEmailSelection>(
    emptyClientEmailSelection,
  )
  const [busy, setBusy] = useState<'invoice' | 'eta' | 'start' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const draftType =
    trip?.quick?.aircraft_type ||
    trip?.offers.find((o) => o.state === 'selected')?.type_name ||
    trip?.hard_quote?.options?.[0]?.type_name ||
    ''
  const [confirmedType, setConfirmedType] = useState(() =>
    initialAircraftTypeSelectValue(draftType),
  )
  const [poDraft, setPoDraft] = useState(
    () => trip?.po_number?.trim() || trip?.quick?.po?.trim() || '',
  )
  const [vendorDraft, setVendorDraft] = useState(
    () => trip?.vendor_number?.trim() || '',
  )

  const routeIcaos = useMemo(
    () => (trip ? tripRouteIcaos(trip) : []),
    [trip],
  )

  useEffect(() => {
    setInvoiceSel(defaultInvoiceEmailSelection(trip?.client_id))
    setEtaSel(
      defaultTrackerEmailSelection(trip?.client_id, {
        legIcaos: routeIcaos,
      }),
    )
  }, [trip?.client_id, tripId, routeIcaos.join('|')])

  useEffect(() => {
    setConfirmedType((prev) => prev || initialAircraftTypeSelectValue(draftType))
  }, [draftType])

  useEffect(() => {
    setPoDraft(trip?.po_number?.trim() || trip?.quick?.po?.trim() || '')
  }, [trip?.po_number, trip?.quick?.po, tripId])

  useEffect(() => {
    const client = trip?.client_id ? getClient(trip.client_id) : null
    setVendorDraft(
      trip?.vendor_number?.trim() ||
        client?.profile.vendor_number?.trim() ||
        '',
    )
  }, [trip?.vendor_number, trip?.client_id, tripId])

  const client = trip?.client_id ? getClient(trip.client_id) : null
  const lastPo = client?.last_po ?? null
  const lastPoTripRef = client?.profile.last_po_trip_ref ?? null
  const suggestedPo = useMemo(() => suggestNextPo(lastPo), [lastPo])

  // Prefill empty PO with +1 suggestion once client is known.
  useEffect(() => {
    const existing =
      trip?.po_number?.trim() || trip?.quick?.po?.trim() || ''
    if (existing) return
    setPoDraft((prev) => (prev.trim() ? prev : suggestedPo))
    // Only when the trip / client context changes — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, trip?.client_id, suggestedPo])

  if (!trip) return null

  const sheet = computeEtaSheetFromBookedTrip(trip, new Date(), {
    clientFacing: true,
  })
  const po = resolveTripPoNumber(trip)
  const thisTripRef = tripRefLabel(trip)
  const clientId = trip.client_id
  const tail =
    trip.quick?.tail ||
    trip.offers.find((o) => o.state === 'selected')?.tail ||
    'TBD'
  const trackUrl = portalTrackingUrlForTrip(trip.id)
  const vendorRecommended = client?.profile.needs_vendor_number === true

  function saveBillingIds() {
    const cleanedPo = poDraft.trim()
    const cleanedVendor = vendorDraft.trim()
    mutateTrip(tripId, (t) => {
      t.po_number = cleanedPo || null
      t.vendor_number = cleanedVendor || null
      if (t.quick) t.quick.po = cleanedPo
    })
    if (clientId && cleanedPo) {
      recordPoUsed(clientId, cleanedPo, { tripRef: thisTripRef })
    }
    if (clientId) {
      recordVendorNumber(clientId, cleanedVendor || null)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-gold/30 pt-3">
      <TripPassengersPanel trip={trip} compact />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gold">
            Invoice &amp; ETA sheet
          </div>
          <p className="mt-0.5 text-xs text-muted">
            QuickBooks payment request (PDF + ACH View and pay), then ETA sheet
            with tail and times.
          </p>
        </div>
        <div className="font-mono text-xs text-cream/85">
          {po ? `PO ${po}` : 'PO pending'} · Tail {tail}
          {confirmedType.trim() ? ` · ${confirmedType.trim()}` : ''}
        </div>
      </div>

      {err ? <p className="text-xs text-late">{err}</p> : null}
      {msg ? <p className="text-xs text-onplan">{msg}</p> : null}

      <div className="space-y-2 rounded-md border border-border/50 bg-ink/40 p-2.5">
        <div className="text-sm font-medium text-cream">1. Send invoice</div>
        <p className="text-[11px] text-muted">
          QuickBooks payment request (ACH) using the approved client total
          {trip.hard_quote?.total != null
            ? ` ($${Math.round(trip.hard_quote.total).toLocaleString('en-US')})`
            : ''}
          . Defaults to the client&apos;s preset invoice emails — add To/CC/BCC from
          their contact list before send.
        </p>

        <InvoicePoVendorFields
          poValue={poDraft}
          onPoChange={setPoDraft}
          onPoCommit={saveBillingIds}
          suggestedPo={suggestedPo}
          lastPo={lastPo}
          lastPoTripRef={lastPoTripRef}
          vendorValue={vendorDraft}
          onVendorChange={setVendorDraft}
          onVendorCommit={saveBillingIds}
          vendorRecommended={vendorRecommended}
          onUseSuggestedPo={() => {
            setPoDraft(suggestedPo)
            mutateTrip(tripId, (t) => {
              t.po_number = suggestedPo
              if (t.quick) t.quick.po = suggestedPo
            })
            if (trip.client_id) {
              recordPoUsed(trip.client_id, suggestedPo, {
                tripRef: thisTripRef,
              })
            }
          }}
        />

        <AircraftTypeSelect
          draft={draftType}
          value={confirmedType}
          onChange={setConfirmedType}
          label="Confirm aircraft type on invoice"
        />
        <ClientEmailRecipientsBubble
          clientId={trip.client_id}
          value={invoiceSel}
          onChange={setInvoiceSel}
          title="Invoice recipients"
        />
        <button
          type="button"
          disabled={
            busy !== null ||
            invoiceSel.to.length === 0 ||
            !confirmedType.trim() ||
            !poDraft.trim()
          }
          className="min-h-11 rounded-md bg-gold px-3 py-2 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
          onClick={() => {
            saveBillingIds()
            if (!poDraft.trim()) {
              setErr('Enter PO # before sending the invoice')
              return
            }
            setBusy('invoice')
            setErr(null)
            setMsg(null)
            void sendTripInvoiceEmail(trip.id, {
              to: invoiceSel.to,
              cc: invoiceSel.cc,
              bcc: invoiceSel.bcc,
              aircraftType: confirmedType.trim(),
            })
              .then((r) => {
                if (trip.client_id) {
                  recordPoUsed(trip.client_id, r.poNumber, {
                    tripRef: thisTripRef,
                  })
                }
                setMsg(
                  `Invoice emailed · PO ${r.poNumber}${
                    vendorDraft.trim() ? ` · Vendor #${vendorDraft.trim()}` : ''
                  }`,
                )
              })
              .catch((e) =>
                setErr(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setBusy(null))
          }}
        >
          {busy === 'invoice' ? 'Sending invoice…' : 'Send QuickBooks payment request'}
        </button>
      </div>

      <div className="space-y-2 rounded-md border border-border/50 bg-ink/40 p-2.5">
        <div className="text-sm font-medium text-cream">2. Send ETA sheet</div>
        <p className="text-[11px] text-muted">
          Timing + tracking link from the approved trip — no payment details.
          Defaults to the client&apos;s preset tracker emails; add contacts from
          their list before send.
        </p>
        {sheet ? (
          <div className="min-w-0 break-words font-mono text-[11px] text-cream/80 space-y-0.5">
            <div>
              Tail {sheet.tail || 'TBD'}
              {sheet.aircraft_type ? ` · ${sheet.aircraft_type}` : ''}
              {sheet.operator_name ? ` · ${sheet.operator_name}` : ''}
            </div>
            {sheet.lines.slice(0, 4).map((l) => (
              <div key={l.seq}>
                {l.leg_label}: {l.pickup_location} {l.pickup_time_zulu} →{' '}
                {l.where_going} {l.arrive_time_zulu}
              </div>
            ))}
            {sheet.lines.length > 4 ? (
              <div>+{sheet.lines.length - 4} more legs</div>
            ) : null}
            <a
              className="block text-gold hover:text-gold-lt"
              href={trackUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open tracking portal →
            </a>
          </div>
        ) : (
          <p className="text-xs text-muted">ETA chain not ready yet.</p>
        )}
        <ClientEmailRecipientsBubble
          clientId={trip.client_id}
          value={etaSel}
          onChange={setEtaSel}
          title="ETA / tracker recipients"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null || etaSel.to.length === 0}
            className="min-h-11 rounded-md bg-gold px-3 py-2 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
            onClick={() => {
              setBusy('eta')
              setErr(null)
              setMsg(null)
              void sendBookedEtaSheetToTrackers({
                trip,
                recipients: etaSel.to,
                cc: etaSel.cc,
              })
                .then((r) => {
                  setMsg(
                    r.sentTo.length
                      ? `ETA sheet sent to ${r.sentTo.length}`
                      : 'No ETA recipients',
                  )
                })
                .catch((e) =>
                  setErr(e instanceof Error ? e.message : String(e)),
                )
                .finally(() => setBusy(null))
            }}
          >
            {busy === 'eta' ? 'Sending ETA…' : 'Send ETA sheet'}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-border px-3 py-2 text-xs text-cream hover:border-gold/40"
            onClick={() => {
              const html = buildEtaSheetPreviewHtml(trip)
              if (!html) {
                setErr('No ETA sheet to preview')
                return
              }
              const blob = new Blob([html], {
                type: 'text/html;charset=utf-8',
              })
              const url = URL.createObjectURL(blob)
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
          >
            Preview ETA sheet
          </button>
        </div>
      </div>

      {trip.state === 'booked' ? (
        <div className="space-y-2 rounded-md border border-gold/40 bg-gold/5 p-2.5">
          <div className="text-sm font-medium text-cream">
            3. Start live tracking
          </div>
          <p className="text-[11px] text-muted">
            Moves this trip to Live tracking — portal link + Access chat for the
            ops group.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            className="min-h-11 rounded-md border border-gold/50 bg-gold/15 px-3 py-2 text-sm font-semibold text-gold hover:bg-gold/25 disabled:opacity-40"
            onClick={() => {
              setBusy('start')
              setErr(null)
              setMsg(null)
              try {
                safeTransitionTrip(trip.id, 'in_progress', 'dispatcher', {
                  reason: 'desk_start_live_tracking',
                })
                // Flush ETA nodes so magic-link portal can hydrate immediately.
                void flushPersistTrip(trip.id)
                setMsg('Moved to Live tracking')
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e))
              } finally {
                setBusy(null)
              }
            }}
          >
            {busy === 'start' ? 'Starting…' : 'Start live tracking'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
