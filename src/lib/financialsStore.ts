/**
 * In-session financial ledger. Seeded from CSV fixture; Supabase sync later.
 */

import fixture from '@/fixtures/financials.json'
import {
  computeFields,
  type ComputedFinancial,
  type FinancialRecord,
} from '@/domain/financials'

const records = new Map<string, FinancialRecord>()
const listeners = new Set<() => void>()
let snapshot: ComputedFinancial[] = []

function rebuild() {
  snapshot = [...records.values()]
    .map((r) => computeFields(r))
    .sort((a, b) => (b.date_of_flight ?? '').localeCompare(a.date_of_flight ?? ''))
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

function seed() {
  if (records.size) return
  for (const r of fixture.records as FinancialRecord[]) {
    records.set(r.id, { ...r, tax_breakdown: r.tax_breakdown ?? [] })
  }
  rebuild()
}

seed()

export function subscribeFinancials(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listFinancials(): ComputedFinancial[] {
  return snapshot
}

export function upsertFinancial(row: FinancialRecord): void {
  records.set(row.id, row)
  bump()
}

export function updateFinancialField(
  id: string,
  field: keyof FinancialRecord,
  value: unknown,
): void {
  const row = records.get(id)
  if (!row) return
  ;(row as Record<string, unknown>)[field] = value
  bump()
}
