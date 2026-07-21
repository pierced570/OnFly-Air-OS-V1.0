/**
 * Client-facing offer pricing — margin + table-driven tax / FET.
 */

import { priceFromMargin } from '@/domain/quote'
import { computeTax } from '@/domain/tax'
import { getTaxRates } from '@/lib/taxRatesStore'
import { payloadKindOf, type OfferRow, type TripStoreRow } from '@/lib/tripStore'

export function clientTotalForOffer(
  offer: OfferRow,
  trip: TripStoreRow,
): { net: number; client: number; tax: number; fetExempt: boolean } {
  const net = Math.max(0, Math.round(offer.price_net ?? 0))
  const cand =
    trip.candidates.find((c) => c.aircraft_id === offer.aircraft_id) ??
    trip.candidates.find((c) => c.tail === offer.tail)
  const mtow = cand?.mtow_lbs ?? null
  const rates = getTaxRates()
  const kind = payloadKindOf(trip)
  const marked = priceFromMargin(net, 15)
  const tax = computeTax({
    payloadKind: kind,
    legs: [{ international: false, segments: 1, paxCount: 1 }],
    aircraftMtowLbs: mtow,
    airSubtotal: marked,
    rates,
  })
  return {
    net,
    client: Math.round(marked + tax.total),
    tax: tax.total,
    fetExempt: tax.fetExempt,
  }
}
