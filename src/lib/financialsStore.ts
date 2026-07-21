/**
 * In-session financial ledger.
 * Seeds from CSV fixture; edits persist as localStorage overrides (and best-effort DB later).
 */

import fixture from '@/fixtures/financials.json'
import {
  computeFields,
  type ComputedFinancial,
  type FinancialRecord,
} from '@/domain/financials'

const OVERRIDES_KEY = 'onfly.financials.overrides.v1'

const records = new Map<string, FinancialRecord>()
const overrides = new Map<string, Partial<FinancialRecord>>()
const listeners = new Set<() => void>()
let snapshot: ComputedFinancial[] = []

/** Money / funding fields that unlock live recompute on legacy rows. */
const LIVE_MATH_FIELDS = new Set<keyof FinancialRecord>([
  'client_invoiced_amount',
  'client_subtotal_pre_tax',
  'tax_total',
  'vendor_amount',
  'funded_by',
  'investor_paid',
  'jonny_money_returned',
])

function rebuild() {
  snapshot = [...records.values()]
    .map((r) => computeFields(r))
    .sort((a, b) => (b.date_of_flight ?? '').localeCompare(a.date_of_flight ?? ''))
}

function bump() {
  rebuild()
  persistOverrides()
  for (const l of listeners) l()
}

function loadOverrides(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, Partial<FinancialRecord>>
    for (const [id, patch] of Object.entries(parsed)) {
      if (patch && typeof patch === 'object') overrides.set(id, patch)
    }
  } catch {
    /* ignore corrupt */
  }
}

function persistOverrides(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const obj: Record<string, Partial<FinancialRecord>> = {}
    for (const [id, patch] of overrides) obj[id] = patch
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(obj))
  } catch {
    /* quota */
  }
}

function applyOverride(id: string, patch: Partial<FinancialRecord>): void {
  const prev = overrides.get(id) ?? {}
  overrides.set(id, { ...prev, ...patch })
  const row = records.get(id)
  if (!row) return
  Object.assign(row, patch)
}

function seed() {
  if (records.size) return
  loadOverrides()
  for (const r of fixture.records as unknown as FinancialRecord[]) {
    const base = {
      ...r,
      tax_breakdown: r.tax_breakdown ?? [],
      referral_share_amount: r.referral_share_amount ?? 0,
    }
    const patch = overrides.get(r.id)
    records.set(r.id, patch ? { ...base, ...patch } : base)
  }
  // Edits that created brand-new ids (rare) — keep overrides-only rows
  for (const [id, patch] of overrides) {
    if (records.has(id)) continue
    if (!patch.id && !patch.client_name && !patch.operator_po) continue
    records.set(id, {
      id,
      is_legacy: false,
      source: 'edit',
      date_of_flight: null,
      operator_po: null,
      client_name: null,
      route_text: null,
      aircraft_type: null,
      tail_number: null,
      vendor_name: null,
      pay_terms: 'Net 30',
      referral_name: null,
      referral_share_amount: 0,
      client_subtotal_pre_tax: null,
      tax_total: 0,
      tax_breakdown: [],
      client_invoiced_amount: 0,
      vendor_amount: 0,
      margin: 0,
      funded_by: 'Jonny 1%',
      deposited_to: null,
      check_deposit_number: null,
      jonnys_profits: 0,
      jonny_invested: 0,
      jonny_money_owed: 0,
      jonny_money_returned: 0,
      ofa_profit_per_trip: 0,
      was_it_paid: false,
      vendor_paid: false,
      investor_paid: false,
      has_ofa_seen_profit: false,
      bill_logged_in_qb: false,
      referral_paid_out: false,
      vendor_bill_url: null,
      vendor_bill_verified: false,
      notes: null,
      ...patch,
    })
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

export function getFinancial(id: string): ComputedFinancial | null {
  const row = records.get(id)
  return row ? computeFields(row) : null
}

export function upsertFinancial(row: FinancialRecord): void {
  records.set(row.id, row)
  applyOverride(row.id, row)
  bump()
}

export function updateFinancialField(
  id: string,
  field: keyof FinancialRecord,
  value: unknown,
): void {
  const row = records.get(id)
  if (!row) return
  const patch: Partial<FinancialRecord> = {
    [field]: value,
  } as Partial<FinancialRecord>

  // Editing money on a legacy import unlocks live investor/margin math.
  if (row.is_legacy && LIVE_MATH_FIELDS.has(field)) {
    patch.is_legacy = false
  }

  Object.assign(row, patch)
  applyOverride(id, patch)
  bump()
}

/** Batch-update several fields on one row (trip identity edit). */
export function updateFinancialRecord(
  id: string,
  patch: Partial<FinancialRecord>,
): ComputedFinancial | null {
  const row = records.get(id)
  if (!row) return null
  const next = { ...patch }
  const touchesMoney = Object.keys(next).some((k) =>
    LIVE_MATH_FIELDS.has(k as keyof FinancialRecord),
  )
  if (row.is_legacy && touchesMoney) next.is_legacy = false
  Object.assign(row, next)
  applyOverride(id, next)
  bump()
  return computeFields(row)
}

export function clearFinancialOverrides(): void {
  overrides.clear()
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(OVERRIDES_KEY)
  }
  records.clear()
  seed()
  for (const l of listeners) l()
}

export function financialOverrideCount(): number {
  return overrides.size
}
