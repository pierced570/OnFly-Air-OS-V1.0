/**
 * Post-approve desk actions:
 * 1) QuickBooks invoice email (PO last+1, AP To, invoice DL CC, BCC info@)
 * 2) ETA sheet (tail + ETAs + tracking portal — no payment)
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
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
import { computeEtaSheetFromBookedTrip } from '@/lib/etaSheet'
import {
  buildEtaSheetPreviewHtml,
  portalTrackingUrlForTrip,
  sendBookedEtaSheetToTrackers,
} from '@/lib/etaSheetSender'
import {
  getTrip,
  listTripsStable,
  sendTripInvoiceEmail,
  subscribeTrips,
} from '@/lib/tripStore'

type Props = {
  tripId: string
}

export function BookedTripActionsPanel({ tripId }: Props) {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = trips.find((t) => t.id === tripId) ?? getTrip(tripId)
  const [invoiceSel, setInvoiceSel] = useState<ClientEmailSelection>(
    emptyClientEmailSelection,
  )
  const [etaSel, setEtaSel] = useState<ClientEmailSelection>(
    emptyClientEmailSelection,
  )
  const [busy, setBusy] = useState<'invoice' | 'eta' | null>(null)
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

  useEffect(() => {
    setInvoiceSel(defaultInvoiceEmailSelection(trip?.client_id))
    setEtaSel(defaultTrackerEmailSelection(trip?.client_id))
  }, [trip?.client_id, tripId])

  useEffect(() => {
    setConfirmedType((prev) => prev || initialAircraftTypeSelectValue(draftType))
  }, [draftType])

  if (!trip) return null

  const sheet = computeEtaSheetFromBookedTrip(trip, new Date(), {
    clientFacing: true,
  })
  const po =
    trip.po_number?.trim() ||
    trip.quick?.po?.trim() ||
    (trip.invoice ? 'QB draft' : '—')
  const tail =
    trip.quick?.tail ||
    trip.offers.find((o) => o.state === 'selected')?.tail ||
    'TBD'
  const trackUrl = portalTrackingUrlForTrip(trip.id)

  return (
    <div className="mt-2 space-y-3 border-t border-border/50 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-gold">
          Booked actions
        </div>
        <div className="font-mono text-xs text-cream/85">
          PO {po} · Tail {tail}
        </div>
      </div>

      {err ? <p className="text-xs text-late">{err}</p> : null}
      {msg ? <p className="text-xs text-onplan">{msg}</p> : null}

      <div className="space-y-2 rounded-md border border-border/50 bg-ink/40 p-2.5">
        <div className="text-sm font-medium text-cream">1. QuickBooks invoice</div>
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
            !confirmedType.trim()
          }
          className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
          onClick={() => {
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
                setMsg(`Invoice emailed · PO ${r.poNumber}`)
              })
              .catch((e) =>
                setErr(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setBusy(null))
          }}
        >
          {busy === 'invoice' ? 'Sending invoice…' : 'Send QuickBooks invoice'}
        </button>
      </div>

      <div className="space-y-2 rounded-md border border-border/50 bg-ink/40 p-2.5">
        <div className="text-sm font-medium text-cream">2. ETA sheet + tracking</div>
        {sheet ? (
          <div className="font-mono text-[11px] text-cream/80 space-y-0.5">
            <div>
              Tail {sheet.tail || 'TBD'}
              {sheet.aircraft_type ? ` · ${sheet.aircraft_type}` : ''}
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
            className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
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
            className="rounded-md border border-border px-3 py-2 text-xs text-cream hover:border-gold/40"
            onClick={() => {
              const html = buildEtaSheetPreviewHtml(trip)
              if (!html) {
                setErr('No ETA sheet to preview')
                return
              }
              const blob = new Blob([html], { type: 'text/html' })
              const url = URL.createObjectURL(blob)
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
          >
            Preview ETA sheet
          </button>
        </div>
      </div>
    </div>
  )
}
