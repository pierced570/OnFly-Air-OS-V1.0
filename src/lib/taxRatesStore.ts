/**
 * tax_rates from Supabase — composers must not use TEST literals at runtime.
 */

import type { TaxRateRow } from '@/domain/tax'
import { TEST_TAX_RATES_2026 } from '@/domain/tax'
import { canPersist, db, safeQuery } from '@/lib/db/client'

let cached: TaxRateRow[] | null = null
let loading: Promise<TaxRateRow[]> | null = null

function mapRows(raw: unknown): TaxRateRow[] {
  if (!Array.isArray(raw) || !raw.length) return []
  return raw.map((r: Record<string, unknown>) => ({
    code: String(r.code ?? ''),
    rate_pct: r.rate_pct == null ? null : Number(r.rate_pct),
    flat_amount: r.flat_amount == null ? null : Number(r.flat_amount),
    applies_to: r.applies_to == null ? null : String(r.applies_to),
  }))
}

export async function loadTaxRates(): Promise<TaxRateRow[]> {
  if (cached?.length) return cached
  if (loading) return loading
  loading = (async () => {
    if (!canPersist()) {
      cached = TEST_TAX_RATES_2026
      return cached
    }
    const rows = await safeQuery('tax_rates', () =>
      db()
        .from('tax_rates')
        .select('code,rate_pct,flat_amount,applies_to')
        .or('effective_to.is.null,effective_to.gte.' + new Date().toISOString().slice(0, 10)),
    )
    const mapped = mapRows(rows)
    cached = mapped.length ? mapped : TEST_TAX_RATES_2026
    return cached
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

/** Sync getter — returns cache or test seed until hydrate finishes. */
export function getTaxRates(): TaxRateRow[] {
  return cached?.length ? cached : TEST_TAX_RATES_2026
}

export function __resetTaxRatesForTests(): void {
  cached = null
  loading = null
}
