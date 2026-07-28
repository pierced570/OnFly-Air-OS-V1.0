/**
 * Client quote layout + OnFly internal breakdown for desk preview.
 * Never expose operator name / vendor / margin on client-facing surfaces.
 */

import { marginPctFromCostAndPrice, priceFromMargin } from '@/domain/quote'
import {
  airSubtotalFromClientTotal,
  computeTax,
  type TaxLine,
  type TaxRateRow,
} from '@/domain/tax'
import { DEFAULT_QUICK_TURN_MIN } from '@/domain/offerQuoteTiming'

/** Default margin used when building client totals from operator NET NET. */
export const DEFAULT_OFFER_MARGIN_PCT = 15

export type OfferQuotePreviewInput = {
  offer_id: string
  operator_name: string
  tail: string | null
  price_net: number | null
  time_to_position_min: number | null
  quick_turn_min: number | null
  live_leg_min: number | null
  fee_scope: string | null
  mtow_lbs: number | null
  payload_kind: 'cargo' | 'pax' | 'both'
  /** Override margin % (desk edit). Defaults to DEFAULT_OFFER_MARGIN_PCT. */
  margin_pct?: number | null
  /** Override client total (desk edit). */
  client_total_override?: number | null
  segment_count?: number
  pax_count?: number
}

export type OfferQuotePreview = {
  offer_id: string
  /** Client-safe label e.g. Option A — no carrier name. */
  label: string
  /** Internal only. */
  operator_name: string
  tail: string | null
  /** Client-facing mission chain. */
  ttp_min: number | null
  turn_load_min: number
  live_leg_min: number | null
  /** Vendor NET NET. */
  vendor_price: number
  /** Air after margin, before tax. */
  client_air: number
  margin_pct: number
  /** Markup dollars (client_air − vendor). */
  margin_dollars: number
  tax_total: number
  tax_lines: TaxLine[]
  segment_fee_total: number
  fet_total: number
  fet_exempt: boolean
  payload_kind: 'cargo' | 'pax' | 'both'
  /** Final client total (override or computed). */
  client_total: number
  fee_scope: string | null
}

export function buildOfferQuotePreview(
  input: OfferQuotePreviewInput,
  rates: TaxRateRow[],
  optionIndex: number,
): OfferQuotePreview {
  const vendor = Math.max(0, Math.round(input.price_net ?? 0))
  const margin_pct_in =
    input.margin_pct != null && Number.isFinite(input.margin_pct)
      ? Math.max(0, input.margin_pct)
      : DEFAULT_OFFER_MARGIN_PCT
  const segments = Math.max(1, input.segment_count ?? 1)
  const paxCount = Math.max(1, input.pax_count ?? 1)
  const taxInputBase = {
    payloadKind: input.payload_kind,
    legs: [{ international: false, segments, paxCount }],
    aircraftMtowLbs: input.mtow_lbs,
    rates,
  }

  const hasOverride =
    input.client_total_override != null &&
    Number.isFinite(input.client_total_override)

  let client_air: number
  let margin_pct: number
  let client_total: number
  let tax

  if (hasOverride) {
    // Desk set the client all-in number — solve air + tax backwards from it.
    client_total = Math.round(input.client_total_override as number)
    let air = airSubtotalFromClientTotal(client_total, taxInputBase)
    tax = computeTax({ ...taxInputBase, airSubtotal: air })
    for (let i = 0; i < 4; i++) {
      const sum = Math.round(air) + Math.round(tax.total)
      const diff = client_total - sum
      if (diff === 0) break
      air = Math.max(0, air + diff)
      tax = computeTax({ ...taxInputBase, airSubtotal: air })
    }
    client_air = Math.round(air)
    margin_pct = marginPctFromCostAndPrice(vendor, client_air)
  } else {
    margin_pct = margin_pct_in
    client_air = Math.round(priceFromMargin(vendor, margin_pct))
    tax = computeTax({ ...taxInputBase, airSubtotal: client_air })
    client_total = Math.round(client_air + tax.total)
  }

  const segment_fee_total = tax.lines
    .filter((l) => l.code === 'SEG_FEE_DOM')
    .reduce((s, l) => s + l.amount, 0)
  const fet_total = tax.lines
    .filter((l) => l.code === 'FET_CARGO' || l.code === 'FET_PAX')
    .reduce((s, l) => s + l.amount, 0)

  return {
    offer_id: input.offer_id,
    label: `Option ${String.fromCharCode(65 + optionIndex)}`,
    operator_name: input.operator_name,
    tail: input.tail?.trim() || null,
    ttp_min: input.time_to_position_min,
    turn_load_min:
      input.quick_turn_min != null && Number.isFinite(input.quick_turn_min)
        ? Math.max(0, Math.floor(input.quick_turn_min))
        : DEFAULT_QUICK_TURN_MIN,
    live_leg_min: input.live_leg_min,
    vendor_price: vendor,
    client_air: Math.round(client_air),
    margin_pct,
    margin_dollars: Math.round(client_air - vendor),
    tax_total: tax.total,
    tax_lines: tax.lines,
    segment_fee_total,
    fet_total,
    fet_exempt: tax.fetExempt,
    payload_kind: input.payload_kind,
    client_total,
    fee_scope: input.fee_scope,
  }
}

/** Always Hrs + Mins (e.g. 2h 0m, 0h 45m, 1h 15m). */
export function formatMinutes(min: number | null): string {
  if (min == null || !Number.isFinite(min)) return '—'
  const t = Math.max(0, Math.floor(min))
  const h = Math.floor(t / 60)
  const m = t % 60
  return `${h}h ${m}m`
}
