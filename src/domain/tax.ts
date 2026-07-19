/**
 * Tax engine — rates come from tax_rates rows, never hardcoded literals in call sites.
 * Pure TypeScript; no React / Supabase.
 */

export type TaxRateRow = {
  code: string
  rate_pct: number | null
  flat_amount: number | null
  applies_to: string | null
}

export type TaxLegInput = {
  international: boolean
  segments: number
  paxCount: number
}

export type TaxInput = {
  payloadKind: 'cargo' | 'pax' | 'both'
  legs: TaxLegInput[]
  aircraftMtowLbs: number | null
  /** Air portion charged to the client (markup included). Ground billed separately. */
  airSubtotal: number
  rates: TaxRateRow[]
}

export type TaxLine = {
  code: string
  base: number
  amount: number
  note: string
}

export type TaxResult = {
  lines: TaxLine[]
  total: number
  fetExempt: boolean
}

function rateByCode(rates: TaxRateRow[], code: string): TaxRateRow | undefined {
  return rates.find((r) => r.code === code)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compute tax lines for a quote.
 * - Cargo domestic: FET_CARGO % of airSubtotal
 * - Pax domestic: FET_PAX % + SEG_FEE_DOM × pax × segments
 * - Any international leg → INTL_HEAD per pax on that leg; no domestic FET stacking on that leg
 * - §4281: MTOW ≤ FET_EXEMPT_MTOW → zero FET
 */
export function computeTax(input: TaxInput): TaxResult {
  const { payloadKind, legs, aircraftMtowLbs, airSubtotal, rates } = input
  const lines: TaxLine[] = []

  const exemptThreshold = rateByCode(rates, 'FET_EXEMPT_MTOW')?.flat_amount ?? 6000
  const fetExempt =
    aircraftMtowLbs != null && aircraftMtowLbs <= exemptThreshold

  const hasIntl = legs.some((l) => l.international)
  const domesticLegs = legs.filter((l) => !l.international)
  const intlLegs = legs.filter((l) => l.international)

  const isCargo = payloadKind === 'cargo' || payloadKind === 'both'
  const isPax = payloadKind === 'pax' || payloadKind === 'both'

  // Domestic FET / segment — only if there is a domestic air subtotal portion.
  // Keep simple: if any international leg exists and all legs are intl, use intl regime only.
  // Mixed: apply domestic FET to full airSubtotal when any domestic leg exists (flag for review).
  const applyDomestic = domesticLegs.length > 0 || !hasIntl

  if (applyDomestic && !fetExempt) {
    if (payloadKind === 'cargo' || payloadKind === 'both') {
      const fet = rateByCode(rates, 'FET_CARGO')
      const pct = fet?.rate_pct ?? 0
      const amount = round2(airSubtotal * (pct / 100))
      if (amount > 0 || pct > 0) {
        lines.push({
          code: 'FET_CARGO',
          base: airSubtotal,
          amount,
          note: `Cargo FET ${pct}%`,
        })
      }
    } else if (payloadKind === 'pax') {
      const fet = rateByCode(rates, 'FET_PAX')
      const pct = fet?.rate_pct ?? 0
      const fetAmt = round2(airSubtotal * (pct / 100))
      lines.push({
        code: 'FET_PAX',
        base: airSubtotal,
        amount: fetAmt,
        note: `Passenger FET ${pct}%`,
      })

      const seg = rateByCode(rates, 'SEG_FEE_DOM')
      const flat = seg?.flat_amount ?? 0
      const segCount = domesticLegs.reduce((n, l) => n + l.segments * l.paxCount, 0)
      const segAmt = round2(flat * segCount)
      lines.push({
        code: 'SEG_FEE_DOM',
        base: segCount,
        amount: segAmt,
        note: `Segment fee $${flat} × ${segCount} (pax×segments)`,
      })
    }
  }

  if (fetExempt && applyDomestic && (isCargo || isPax)) {
    lines.push({
      code: 'FET_EXEMPT_MTOW',
      base: aircraftMtowLbs ?? 0,
      amount: 0,
      note: 'FET-exempt under IRC §4281.',
    })
  }

  if (hasIntl) {
    const head = rateByCode(rates, 'INTL_HEAD')
    const flat = head?.flat_amount ?? 0
    for (const leg of intlLegs) {
      const amt = round2(flat * leg.paxCount)
      lines.push({
        code: 'INTL_HEAD',
        base: leg.paxCount,
        amount: amt,
        note: `International head tax $${flat}/pax — flag for human review`,
      })
    }
  }

  const total = round2(lines.reduce((s, l) => s + l.amount, 0))
  return { lines, total, fetExempt }
}

/** Seed rates matching migration 0001 (for unit tests — not runtime literals in composers). */
export const TEST_TAX_RATES_2026: TaxRateRow[] = [
  { code: 'FET_CARGO', rate_pct: 6.25, flat_amount: null, applies_to: 'cargo' },
  { code: 'FET_PAX', rate_pct: 7.5, flat_amount: null, applies_to: 'pax' },
  { code: 'SEG_FEE_DOM', rate_pct: null, flat_amount: 5.3, applies_to: 'pax_segment' },
  { code: 'INTL_HEAD', rate_pct: null, flat_amount: 23.4, applies_to: 'pax_intl' },
  { code: 'FET_EXEMPT_MTOW', rate_pct: null, flat_amount: 6000, applies_to: 'rule' },
]
