/**
 * Quote math helpers — markup + tax recompute.
 */
import { computeTax, type TaxRateRow, type TaxResult } from '@/domain/tax'
import type { Candidate } from '@/domain/routing'

export type MarkupMode = 'percent' | 'dollars'

export function applyMarkup(
  cost: number,
  mode: MarkupMode,
  value: number,
): number {
  if (mode === 'percent') return Math.round(cost * (1 + value / 100) * 100) / 100
  return Math.round((cost + value) * 100) / 100
}

export function priceFromMargin(cost: number, marginPct: number): number {
  return Math.round((cost / (1 - marginPct / 100)) * 100) / 100
}

/** Effective margin % given vendor NET and client air (before tax). */
export function marginPctFromCostAndPrice(cost: number, price: number): number {
  if (!(price > 0) || !(cost >= 0)) return 0
  const raw = (1 - cost / price) * 100
  if (!Number.isFinite(raw)) return 0
  return Math.round(Math.max(0, raw) * 100) / 100
}

export function buildQuoteTotals(
  candidate: Candidate,
  opts: {
    markupMode: MarkupMode
    markupValue: number
    payloadKind: 'cargo' | 'pax' | 'both'
    mtowLbs: number | null
    paxCount: number
    segments: number
    rates: TaxRateRow[]
  },
): { airSubtotal: number; tax: TaxResult; total: number } {
  const airSubtotal =
    opts.markupMode === 'percent' || opts.markupValue !== 0
      ? applyMarkup(candidate.cost, opts.markupMode, opts.markupValue)
      : candidate.price

  const tax = computeTax({
    payloadKind: opts.payloadKind,
    legs: [
      {
        international: false,
        segments: opts.segments,
        paxCount: opts.paxCount,
      },
    ],
    aircraftMtowLbs: opts.mtowLbs,
    airSubtotal,
    rates: opts.rates,
  })

  return {
    airSubtotal,
    tax,
    total: Math.round((airSubtotal + tax.total) * 100) / 100,
  }
}
