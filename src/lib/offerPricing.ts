/**
 * Client-facing offer pricing — margin + table-driven tax / FET.
 */

import {
  buildOfferQuotePreview,
  DEFAULT_OFFER_MARGIN_PCT,
  type OfferQuotePreview,
} from '@/domain/offerQuotePreview'
import { priceFromMargin } from '@/domain/quote'
import { computeTax } from '@/domain/tax'
import { resolveAircraftMtowLbs } from '@/lib/resolveAircraftMtow'
import { getTaxRates } from '@/lib/taxRatesStore'
import { payloadKindOf, type OfferRow, type TripStoreRow } from '@/lib/tripStore'

export { DEFAULT_OFFER_MARGIN_PCT }

export function clientTotalForOffer(
  offer: OfferRow,
  trip: TripStoreRow,
): { net: number; client: number; tax: number; fetExempt: boolean } {
  const preview = offerQuotePreviewFor(offer, trip, 0)
  return {
    net: preview.vendor_price,
    client: preview.client_total,
    tax: preview.tax_total,
    fetExempt: preview.fet_exempt,
  }
}

export function offerQuotePreviewFor(
  offer: OfferRow,
  trip: TripStoreRow,
  optionIndex: number,
  clientTotalOverride?: number | null,
  marginPctOverride?: number | null,
): OfferQuotePreview {
  const cand =
    trip.candidates.find((c) => c.aircraft_id === offer.aircraft_id) ??
    trip.candidates.find((c) => c.tail === offer.tail)
  const kind = payloadKindOf(trip)
  const paxMatch = trip.payload_summary.match(
    /(\d+)\s*(?:pax|passengers?|techs?)\b/i,
  )
  const pax_count = paxMatch ? Number(paxMatch[1]) : kind === 'cargo' ? 0 : 1
  const segment_count = Math.max(
    1,
    trip.lane.split(/\s*·\s*/).filter(Boolean).length,
  )
  const margin_pct =
    marginPctOverride != null && Number.isFinite(marginPctOverride)
      ? marginPctOverride
      : trip.offer_margin_pct ?? DEFAULT_OFFER_MARGIN_PCT
  return buildOfferQuotePreview(
    {
      offer_id: offer.id,
      operator_name: offer.operator_name,
      tail: offer.tail,
      price_net: offer.price_net,
      time_to_position_min: offer.time_to_position_min,
      quick_turn_min: offer.quick_turn_min,
      live_leg_min: offer.live_leg_min,
      fee_scope: offer.fee_scope,
      mtow_lbs: resolveAircraftMtowLbs({
        mtowLbs: cand?.mtow_lbs ?? null,
        typeName: cand?.type_name ?? offer.type_name,
        tail: offer.tail,
        selectedAircraftId: offer.aircraft_id,
        candidates: trip.candidates,
      }),
      payload_kind: kind,
      margin_pct,
      client_total_override: clientTotalOverride,
      segment_count,
      pax_count: Math.max(1, pax_count || 1),
    },
    getTaxRates(),
    optionIndex,
  )
}

/** Quoted offers as ordered client options (A, B, …). */
export function buildClientQuoteOptions(
  trip: TripStoreRow,
  clientEdits?: Record<string, number>,
): OfferQuotePreview[] {
  const quoted = trip.offers
    .filter(
      (o) =>
        (o.state === 'quoted' || o.state === 'selected') &&
        o.price_net != null,
    )
    .sort((a, b) => {
      const rank = (s: string) => (s === 'selected' ? 0 : 1)
      const d = rank(a.state) - rank(b.state)
      if (d !== 0) return d
      return (a.price_net ?? 0) - (b.price_net ?? 0)
    })
  return quoted.map((o, i) =>
    offerQuotePreviewFor(o, trip, i, clientEdits?.[o.id] ?? null),
  )
}

/** Keep old math path available for light call sites. */
export function markedAirFromNet(net: number): number {
  return priceFromMargin(Math.max(0, net), DEFAULT_OFFER_MARGIN_PCT)
}

export function taxOnMarkedAir(
  marked: number,
  trip: TripStoreRow,
  mtowLbs: number | null,
) {
  return computeTax({
    payloadKind: payloadKindOf(trip),
    legs: [{ international: false, segments: 1, paxCount: 1 }],
    aircraftMtowLbs: mtowLbs,
    airSubtotal: marked,
    rates: getTaxRates(),
  })
}
