/**
 * Desk preview of what the client sees (timing + total) plus OnFly internals
 * (vendor, markup, tax, segment fees). Replaces Event log on Offers.
 */

import { useState } from 'react'
import { formatMinutes, type OfferQuotePreview } from '@/domain/offerQuotePreview'
import { buildClientQuoteOptions } from '@/lib/offerPricing'
import { deskAcceptOfferOption } from '@/lib/offerFlow'
import type { TripStoreRow } from '@/lib/tripStore'

type Props = {
  trip: TripStoreRow
  clientEdits?: Record<string, number>
  onAccepted?: () => void
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function OptionCard({
  preview,
  tripId,
  clientTotal,
  acceptEnabled,
  onAccepted,
  onError,
}: {
  preview: OfferQuotePreview
  tripId: string
  clientTotal: number
  acceptEnabled: boolean
  onAccepted?: () => void
  onError: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const taxKind =
    preview.payload_kind === 'pax'
      ? 'Passenger FET'
      : preview.payload_kind === 'both'
        ? 'Cargo + pax tax'
        : 'Cargo FET'

  return (
    <article className="space-y-3 rounded-lg border border-border bg-ink/50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium text-cream">
          {preview.operator_name}
          {preview.tail ? (
            <span className="avionic ml-2 text-xs font-normal text-cream/70">
              {preview.tail}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted">{preview.label}</div>
      </div>

      <div className="space-y-1.5 rounded-md border border-gold/30 bg-gold/5 px-3 py-2.5">
        <div className="text-[11px] uppercase tracking-wider text-gold">
          Client sees
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm text-cream">
          <dt className="text-muted">Time to be in from Go</dt>
          <dd className="avionic text-right">
            {formatMinutes(preview.ttp_min)}
          </dd>
          <dt className="text-muted">Loading and turn around</dt>
          <dd className="avionic text-right">
            {formatMinutes(preview.turn_load_min)}
          </dd>
          <dt className="text-muted">Live leg time</dt>
          <dd className="avionic text-right">
            {formatMinutes(preview.live_leg_min)}
          </dd>
          <dt className="font-medium text-cream">Price</dt>
          <dd className="avionic text-right font-semibold text-gold">
            {money(clientTotal)}
          </dd>
        </dl>
        <p className="text-[11px] text-muted">All taxes and fees included</p>
      </div>

      <div className="space-y-1.5 rounded-md border border-border/60 bg-surface/40 px-3 py-2.5">
        <div className="text-[11px] uppercase tracking-wider text-muted">
          OnFly internals
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm text-cream">
          <dt className="text-muted">Vendor price (NET NET)</dt>
          <dd className="avionic text-right">{money(preview.vendor_price)}</dd>
          <dt className="text-muted">Client air (after markup)</dt>
          <dd className="avionic text-right">{money(preview.client_air)}</dd>
          <dt className="text-muted">Markup</dt>
          <dd className="avionic text-right">
            {preview.margin_pct}% · {money(preview.margin_dollars)}
          </dd>
          <dt className="text-muted">{taxKind}</dt>
          <dd className="avionic text-right">
            {preview.fet_exempt
              ? 'FET exempt'
              : money(preview.fet_total)}
          </dd>
          <dt className="text-muted">Segment fees</dt>
          <dd className="avionic text-right">
            {preview.segment_fee_total > 0
              ? money(preview.segment_fee_total)
              : '—'}
          </dd>
          <dt className="text-muted">Tax total</dt>
          <dd className="avionic text-right">{money(preview.tax_total)}</dd>
          <dt className="font-medium text-cream">Client total</dt>
          <dd className="avionic text-right font-semibold">
            {money(clientTotal)}
          </dd>
        </dl>
      </div>

      {acceptEnabled ? (
        <button
          type="button"
          disabled={busy}
          className="w-full rounded-md bg-gold px-3 py-2.5 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50"
          onClick={() => {
            if (
              !window.confirm(
                `Accept ${preview.label} for the client at ${money(clientTotal)}?\n\nThis books the trip and stands down other options.`,
              )
            ) {
              return
            }
            setBusy(true)
            void deskAcceptOfferOption(tripId, preview.offer_id, clientTotal)
              .then(() => onAccepted?.())
              .catch((e) =>
                onError(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Accepting…' : 'Accept quote'}
        </button>
      ) : null}
    </article>
  )
}

export function ClientQuoteLayoutPanel({
  trip,
  clientEdits,
  onAccepted,
}: Props) {
  const [error, setError] = useState<string | null>(null)
  const options = buildClientQuoteOptions(trip, clientEdits)
  const booked = ['booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(
    trip.state,
  )

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-xs uppercase tracking-wider text-muted">
        Client quote layout
      </h2>
      <p className="mt-1 text-xs text-muted">
        What the client sees (timing + total), plus OnFly vendor / markup / tax.
        Multiple quoted operators show as Option A, B, …
      </p>
      {error ? <p className="mt-2 text-sm text-late">{error}</p> : null}
      {booked ? (
        <p className="mt-3 text-sm text-onplan">
          Trip already booked — accept is complete.
        </p>
      ) : null}
      {!options.length ? (
        <p className="mt-3 text-sm text-muted">
          No quotes in yet. When an operator submits, their option appears here.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {options.map((p) => (
            <li key={p.offer_id}>
              <OptionCard
                preview={p}
                tripId={trip.id}
                clientTotal={clientEdits?.[p.offer_id] ?? p.client_total}
                acceptEnabled={!booked}
                onAccepted={onAccepted}
                onError={setError}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
