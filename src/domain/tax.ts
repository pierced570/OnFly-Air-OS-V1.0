/**
 * Tax engine — rates come from tax_rates rows, never hardcoded literals in call sites.
 * Pure TypeScript; no React / Supabase.
 *
 * FET (and domestic segment fees stacked with it) apply only when MTOW is known
 * and strictly over the §4281 threshold (default 6000 lb). Cessna 310 / Baron /
 * other light twins must never pick up FET by accident when MTOW is missing.
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

/** Desk override for rare FET edge cases. Default `auto` uses MTOW §4281. */
export type FetOverride = 'auto' | 'on' | 'off'

export type TaxInput = {
  payloadKind: 'cargo' | 'pax' | 'both'
  legs: TaxLegInput[]
  aircraftMtowLbs: number | null
  /** Air portion charged to the client (markup included). Ground billed separately. */
  airSubtotal: number
  rates: TaxRateRow[]
  /**
   * Rare desk override. `on`/`off` force domestic FET (+ segment fees when pax);
   * `auto` (default) follows MTOW §4281.
   */
  fetOverride?: FetOverride
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
  /** True when MTOW is known and ≤ exemption threshold (§4281). */
  fetExempt: boolean
  /** True when MTOW is missing — FET must not be charged until known. */
  fetMtowUnknown: boolean
}

function rateByCode(rates: TaxRateRow[], code: string): TaxRateRow | undefined {
  return rates.find((r) => r.code === code)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** FET exemption threshold from tax_rates (fallback 6000). */
export function fetExemptMtowThreshold(rates: TaxRateRow[]): number {
  return rateByCode(rates, 'FET_EXEMPT_MTOW')?.flat_amount ?? 6000
}

/**
 * FET applies only when MTOW is known and strictly over the §4281 threshold.
 * Missing MTOW → do not charge (flag, don't invent tax).
 */
export function fetAppliesAtMtow(
  aircraftMtowLbs: number | null | undefined,
  rates: TaxRateRow[],
): { applies: boolean; exempt: boolean; unknown: boolean; threshold: number } {
  const threshold = fetExemptMtowThreshold(rates)
  if (aircraftMtowLbs == null || !Number.isFinite(Number(aircraftMtowLbs))) {
    return { applies: false, exempt: false, unknown: true, threshold }
  }
  const mtow = Number(aircraftMtowLbs)
  if (mtow <= threshold) {
    return { applies: false, exempt: true, unknown: false, threshold }
  }
  return { applies: true, exempt: false, unknown: false, threshold }
}

/**
 * Resolve whether domestic FET applies, honoring a rare desk override.
 */
export function resolveFetApplies(
  aircraftMtowLbs: number | null | undefined,
  rates: TaxRateRow[],
  fetOverride: FetOverride = 'auto',
): {
  applies: boolean
  exempt: boolean
  unknown: boolean
  threshold: number
  override: FetOverride
} {
  const fetGate = fetAppliesAtMtow(aircraftMtowLbs, rates)
  if (fetOverride === 'on') {
    return { ...fetGate, applies: true, override: 'on' }
  }
  if (fetOverride === 'off') {
    return { ...fetGate, applies: false, override: 'off' }
  }
  return { ...fetGate, override: 'auto' }
}

/**
 * Compute tax lines for a quote.
 * - Cargo-only domestic: FET_CARGO % of airSubtotal (~6.25%)
 * - Pax on board (pax or both): FET_PAX % (~7.5%) + SEG_FEE_DOM × pax × segments
 * - Any international leg → INTL_HEAD per pax on that leg; no domestic FET stacking on that leg
 * - §4281: MTOW ≤ FET_EXEMPT_MTOW → zero FET
 * - Missing MTOW → zero FET (NEEDS-INFO); never default to charging
 * - `fetOverride` on/off: rare desk override of the MTOW gate
 */
export function computeTax(input: TaxInput): TaxResult {
  const {
    payloadKind,
    legs,
    aircraftMtowLbs,
    airSubtotal,
    rates,
    fetOverride = 'auto',
  } = input
  const lines: TaxLine[] = []

  const fetGate = resolveFetApplies(aircraftMtowLbs, rates, fetOverride)
  const fetExempt = fetGate.exempt
  const fetMtowUnknown = fetGate.unknown

  const hasIntl = legs.some((l) => l.international)
  const domesticLegs = legs.filter((l) => !l.international)
  const intlLegs = legs.filter((l) => l.international)

  const isCargo = payloadKind === 'cargo' || payloadKind === 'both'
  const isPax = payloadKind === 'pax' || payloadKind === 'both'
  /** Pax on board → higher FET + segment fees; cargo-only → lower cargo FET. */
  const paxOnBoard = payloadKind === 'pax' || payloadKind === 'both'

  // Domestic FET / segment — MTOW gate, unless desk overrides.
  const applyDomestic = domesticLegs.length > 0 || !hasIntl

  if (applyDomestic && fetGate.applies) {
    if (paxOnBoard) {
      const fet = rateByCode(rates, 'FET_PAX')
      const pct = fet?.rate_pct ?? 0
      const fetAmt = round2(airSubtotal * (pct / 100))
      lines.push({
        code: 'FET_PAX',
        base: airSubtotal,
        amount: fetAmt,
        note: `FET ${pct}% (passenger)`,
      })

      const seg = rateByCode(rates, 'SEG_FEE_DOM')
      const flat = seg?.flat_amount ?? 0
      const segCount = domesticLegs.reduce(
        (n, l) => n + l.segments * Math.max(0, l.paxCount),
        0,
      )
      const segAmt = round2(flat * segCount)
      lines.push({
        code: 'SEG_FEE_DOM',
        base: segCount,
        amount: segAmt,
        note: `Segment fee $${flat} × ${segCount} (pax × segments)`,
      })
    } else if (isCargo) {
      const fet = rateByCode(rates, 'FET_CARGO')
      const pct = fet?.rate_pct ?? 0
      const amount = round2(airSubtotal * (pct / 100))
      if (amount > 0 || pct > 0) {
        lines.push({
          code: 'FET_CARGO',
          base: airSubtotal,
          amount,
          note: `FET ${pct}% (cargo)`,
        })
      }
    }
  }

  // MTOW status notes only when auto — overrides replace them with desk notes.
  if (fetOverride === 'auto' && fetExempt && applyDomestic && (isCargo || isPax)) {
    lines.push({
      code: 'FET_EXEMPT_MTOW',
      base: aircraftMtowLbs ?? 0,
      amount: 0,
      note: `FET-exempt under IRC §4281 (MTOW ≤ ${fetGate.threshold} lbs).`,
    })
  }

  if (
    fetOverride === 'auto' &&
    fetMtowUnknown &&
    applyDomestic &&
    (isCargo || isPax)
  ) {
    lines.push({
      code: 'FET_NEEDS_MTOW',
      base: 0,
      amount: 0,
      note: `MTOW unknown — FET not charged until MTOW confirms > ${fetGate.threshold} lbs (§4281).`,
    })
  }

  if (fetOverride === 'off' && applyDomestic && (isCargo || isPax)) {
    lines.push({
      code: 'FET_WAIVED',
      base: 0,
      amount: 0,
      note: 'FET waived (desk override).',
    })
  }

  if (
    fetOverride === 'on' &&
    applyDomestic &&
    (isCargo || isPax) &&
    (fetExempt || fetMtowUnknown)
  ) {
    lines.push({
      code: 'FET_FORCED',
      base: 0,
      amount: 0,
      note: 'FET applied (desk override).',
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
  return { lines, total, fetExempt, fetMtowUnknown }
}

/**
 * Solve air subtotal from a desired client all-in total.
 * FET % scales with air; segment / intl head taxes are flat.
 */
export function airSubtotalFromClientTotal(
  clientTotal: number,
  input: Omit<TaxInput, 'airSubtotal'>,
): number {
  const target = Math.max(0, clientTotal)
  const {
    payloadKind,
    legs,
    aircraftMtowLbs,
    rates,
    fetOverride = 'auto',
  } = input

  const fetGate = resolveFetApplies(aircraftMtowLbs, rates, fetOverride)

  const hasIntl = legs.some((l) => l.international)
  const domesticLegs = legs.filter((l) => !l.international)
  const intlLegs = legs.filter((l) => l.international)
  const isCargo = payloadKind === 'cargo' || payloadKind === 'both'
  const paxOnBoard = payloadKind === 'pax' || payloadKind === 'both'
  const applyDomestic = domesticLegs.length > 0 || !hasIntl

  let fetPct = 0
  let flat = 0

  if (applyDomestic && fetGate.applies) {
    if (paxOnBoard) {
      fetPct = rateByCode(rates, 'FET_PAX')?.rate_pct ?? 0
      const seg = rateByCode(rates, 'SEG_FEE_DOM')
      const segFlat = seg?.flat_amount ?? 0
      const segCount = domesticLegs.reduce(
        (n, l) => n + l.segments * Math.max(0, l.paxCount),
        0,
      )
      flat += segFlat * segCount
    } else if (isCargo) {
      fetPct = rateByCode(rates, 'FET_CARGO')?.rate_pct ?? 0
    }
  }

  if (hasIntl) {
    const head = rateByCode(rates, 'INTL_HEAD')?.flat_amount ?? 0
    for (const leg of intlLegs) {
      flat += head * leg.paxCount
    }
  }

  const denom = 1 + fetPct / 100
  if (denom <= 0) return round2(Math.max(0, target - flat))
  return round2(Math.max(0, (target - flat) / denom))
}

/** Seed rates matching migration 0001 (for unit tests — not runtime literals in composers). */
export const TEST_TAX_RATES_2026: TaxRateRow[] = [
  { code: 'FET_CARGO', rate_pct: 6.25, flat_amount: null, applies_to: 'cargo' },
  { code: 'FET_PAX', rate_pct: 7.5, flat_amount: null, applies_to: 'pax' },
  { code: 'SEG_FEE_DOM', rate_pct: null, flat_amount: 5.3, applies_to: 'pax_segment' },
  { code: 'INTL_HEAD', rate_pct: null, flat_amount: 23.4, applies_to: 'pax_intl' },
  { code: 'FET_EXEMPT_MTOW', rate_pct: null, flat_amount: 6000, applies_to: 'rule' },
]

/** Desk-readable tax line, e.g. "FET 6.25% (cargo): $625". */
export function formatTaxLineDesk(line: TaxLine): string {
  const amt =
    Number.isInteger(line.amount) || Math.abs(line.amount % 1) < 1e-9
      ? `$${line.amount.toFixed(0)}`
      : `$${line.amount.toFixed(2)}`
  if (line.code === 'FET_CARGO' || line.code === 'FET_PAX') {
    return `${line.note}: ${amt}`
  }
  if (line.code === 'SEG_FEE_DOM' || line.code === 'INTL_HEAD') {
    return `${line.note}: ${amt}`
  }
  if (
    line.code === 'FET_EXEMPT_MTOW' ||
    line.code === 'FET_NEEDS_MTOW' ||
    line.code === 'FET_WAIVED' ||
    line.code === 'FET_FORCED'
  ) {
    return line.note
  }
  return line.note ? `${line.note}: ${amt}` : `${line.code}: ${amt}`
}
