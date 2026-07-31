/**
 * In-session financial ledger.
 * Seeds from CSV fixture; edits persist as localStorage overrides + best-effort Supabase.
 */

import fixture from '@/fixtures/financials.json'
import {
  applyVendorLineRollup,
  computeFields,
  ensureVendorLines,
  newVendorLine,
  type ComputedFinancial,
  type FinancialRecord,
  type FinancialVendorLine,
} from '@/domain/financials'
import { referralFlightMonthKey } from '@/domain/referrals'
import { unifyAircraftType } from '@/lib/aircraftTypeCatalog'
import { persistFinancialRecord } from '@/lib/db/persistFinancial'

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
    .map((r) => {
      const aircraft_type =
        unifyAircraftType(r.aircraft_type ?? '') || r.aircraft_type
      const vendor_lines = (r.vendor_lines ?? []).map((l) => ({
        ...l,
        aircraft_type:
          unifyAircraftType(l.aircraft_type ?? '') || l.aircraft_type,
      }))
      return computeFields({ ...r, aircraft_type, vendor_lines })
    })
    .sort((a, b) => (b.date_of_flight ?? '').localeCompare(a.date_of_flight ?? ''))
}

function bump(persistId?: string) {
  rebuild()
  persistOverrides()
  for (const l of listeners) l()
  if (persistId) schedulePersist(persistId)
}

const persistQueued = new Set<string>()
let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(id: string): void {
  persistQueued.add(id)
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    const ids = [...persistQueued]
    persistQueued.clear()
    for (const id of ids) void flushPersist(id)
  }, 0)
}

async function flushPersist(id: string): Promise<void> {
  const row = records.get(id)
  if (!row) return
  const result = await persistFinancialRecord(row)
  if (!result.ok) return
  if (
    result.vendor_lines &&
    result.vendor_lines.some(
      (l, i) => l.id !== (row.vendor_lines[i]?.id ?? ''),
    )
  ) {
    row.vendor_lines = result.vendor_lines
    applyOverride(id, { vendor_lines: result.vendor_lines })
    persistOverrides()
  }
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

function normalizeRecord(r: FinancialRecord): FinancialRecord {
  const withLines: FinancialRecord = {
    ...r,
    tax_breakdown: r.tax_breakdown ?? [],
    referral_share_amount: r.referral_share_amount ?? 0,
    vendor_lines: Array.isArray(r.vendor_lines) ? r.vendor_lines : [],
  }
  // Persist synthesized primary line so multi-vendor edits have a real array.
  if (!withLines.vendor_lines.length) {
    const synthesized = ensureVendorLines(withLines)
    if (synthesized.length) withLines.vendor_lines = synthesized
  }
  return withLines
}

function seed() {
  if (records.size) return
  loadOverrides()
  for (const r of fixture.records as unknown as FinancialRecord[]) {
    const base = normalizeRecord({
      ...r,
      tax_breakdown: r.tax_breakdown ?? [],
      referral_share_amount: r.referral_share_amount ?? 0,
      vendor_lines: r.vendor_lines ?? [],
    })
    const patch = overrides.get(r.id)
    records.set(
      r.id,
      patch ? normalizeRecord({ ...base, ...patch }) : base,
    )
  }
  // Edits that created brand-new ids (rare) — keep overrides-only rows
  for (const [id, patch] of overrides) {
    if (records.has(id)) continue
    if (!patch.id && !patch.client_name && !patch.operator_po) continue
    records.set(
      id,
      normalizeRecord({
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
        vendor_lines: [],
        ...patch,
      }),
    )
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
  const normalized = normalizeRecord(row)
  records.set(normalized.id, normalized)
  applyOverride(normalized.id, normalized)
  bump(normalized.id)
}

/**
 * Overlay rows loaded from Supabase. DB wins over fixture for matching ids;
 * fixture-only rows remain until edited/persisted.
 */
export function replaceFinancialsFromDb(rows: FinancialRecord[]): void {
  if (!rows.length) return
  for (const raw of rows) {
    const normalized = normalizeRecord(raw)
    records.set(normalized.id, normalized)
    // Keep localStorage in sync so a cold boot before hydrate still shows DB edits
    // once hydrate has run at least once in this browser.
    applyOverride(normalized.id, normalized)
  }
  rebuild()
  persistOverrides()
  for (const l of listeners) l()
}

function commitVendorLines(
  id: string,
  lines: FinancialVendorLine[],
): ComputedFinancial | null {
  const row = records.get(id)
  if (!row) return null
  const rolled = applyVendorLineRollup({
    ...row,
    vendor_lines: lines,
    is_legacy: false,
  })
  Object.assign(row, rolled)
  applyOverride(id, {
    vendor_lines: rolled.vendor_lines,
    vendor_amount: rolled.vendor_amount,
    vendor_name: rolled.vendor_name,
    vendor_paid: rolled.vendor_paid,
    bill_logged_in_qb: rolled.bill_logged_in_qb,
    vendor_bill_url: rolled.vendor_bill_url,
    vendor_bill_verified: rolled.vendor_bill_verified,
    tail_number: rolled.tail_number,
    aircraft_type: rolled.aircraft_type,
    pay_terms: rolled.pay_terms,
    is_legacy: false,
  })
  bump(id)
  return computeFields(row)
}

/** Replace all vendor lines on a PO / financial row (re-rolls op cost). */
export function setFinancialVendorLines(
  id: string,
  lines: FinancialVendorLine[],
): ComputedFinancial | null {
  return commitVendorLines(id, lines)
}

export function addFinancialVendorLine(
  id: string,
  partial?: Partial<FinancialVendorLine>,
): ComputedFinancial | null {
  const row = records.get(id)
  if (!row) return null
  const lines = [...ensureVendorLines(row), newVendorLine(partial)]
  return commitVendorLines(id, lines)
}

export function updateFinancialVendorLine(
  id: string,
  lineId: string,
  patch: Partial<FinancialVendorLine>,
): ComputedFinancial | null {
  const row = records.get(id)
  if (!row) return null
  const lines = ensureVendorLines(row).map((l) =>
    l.id === lineId ? { ...l, ...patch } : l,
  )
  return commitVendorLines(id, lines)
}

export function removeFinancialVendorLine(
  id: string,
  lineId: string,
): ComputedFinancial | null {
  const row = records.get(id)
  if (!row) return null
  const lines = ensureVendorLines(row).filter((l) => l.id !== lineId)
  return commitVendorLines(id, lines)
}

export function updateFinancialField(
  id: string,
  field: keyof FinancialRecord,
  value: unknown,
): void {
  const row = records.get(id)
  if (!row) return
  const patch: Partial<FinancialRecord> = {
    [field]:
      field === 'aircraft_type' && typeof value === 'string'
        ? unifyAircraftType(value) || null
        : value,
  } as Partial<FinancialRecord>

  // Editing money on a legacy import unlocks live investor/margin math.
  if (row.is_legacy && LIVE_MATH_FIELDS.has(field)) {
    patch.is_legacy = false
  }

  // Keep primary vendor line in sync when sheet edits touch rolled fields.
  if (
    field === 'vendor_amount' ||
    field === 'vendor_name' ||
    field === 'vendor_paid' ||
    field === 'bill_logged_in_qb' ||
    field === 'vendor_bill_url' ||
    field === 'tail_number' ||
    field === 'aircraft_type' ||
    field === 'pay_terms'
  ) {
    const lines = ensureVendorLines(row)
    if (lines.length) {
      const primary =
        lines.find((l) => l.kind === 'aircraft') ?? lines[0]!
      const nextPrimary = { ...primary }
      if (field === 'vendor_amount') nextPrimary.amount = Number(value) || 0
      if (field === 'vendor_name') nextPrimary.vendor_name = String(value ?? '')
      if (field === 'vendor_paid') nextPrimary.vendor_paid = Boolean(value)
      if (field === 'bill_logged_in_qb') {
        nextPrimary.bill_logged_in_qb = Boolean(value)
      }
      if (field === 'vendor_bill_url') {
        nextPrimary.vendor_bill_url = (value as string | null) ?? null
      }
      if (field === 'tail_number') {
        nextPrimary.tail_number = (value as string | null) ?? null
      }
      if (field === 'aircraft_type') {
        nextPrimary.aircraft_type =
          unifyAircraftType(String(value ?? '')) || null
      }
      if (field === 'pay_terms') {
        nextPrimary.pay_terms = (value as string | null) ?? null
      }
      const nextLines = lines.map((l) =>
        l.id === primary.id ? nextPrimary : l,
      )
      const rolled = applyVendorLineRollup({
        ...row,
        ...patch,
        vendor_lines: nextLines,
      })
      Object.assign(row, rolled)
      applyOverride(id, {
        ...patch,
        vendor_lines: rolled.vendor_lines,
        vendor_amount: rolled.vendor_amount,
        vendor_name: rolled.vendor_name,
        vendor_paid: rolled.vendor_paid,
        bill_logged_in_qb: rolled.bill_logged_in_qb,
      })
      bump(id)
      return
    }
  }

  Object.assign(row, patch)
  applyOverride(id, patch)
  bump(id)
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

  // If money/vendor identity changes without an explicit vendor_lines patch,
  // keep the primary aircraft line aligned so rollup doesn't stomp the edit.
  if (
    !next.vendor_lines &&
    (next.vendor_amount != null ||
      next.vendor_name != null ||
      next.vendor_paid != null ||
      next.bill_logged_in_qb != null ||
      next.vendor_bill_url !== undefined ||
      next.tail_number !== undefined ||
      next.aircraft_type !== undefined)
  ) {
    const lines = ensureVendorLines({ ...row, ...next })
    if (lines.length) {
      const primary =
        lines.find((l) => l.kind === 'aircraft') ?? lines[0]!
      const nextPrimary = {
        ...primary,
        amount:
          next.vendor_amount != null
            ? Number(next.vendor_amount) || 0
            : primary.amount,
        vendor_name:
          next.vendor_name != null
            ? String(next.vendor_name)
            : primary.vendor_name,
        vendor_paid:
          next.vendor_paid != null ? Boolean(next.vendor_paid) : primary.vendor_paid,
        bill_logged_in_qb:
          next.bill_logged_in_qb != null
            ? Boolean(next.bill_logged_in_qb)
            : primary.bill_logged_in_qb,
        vendor_bill_url:
          next.vendor_bill_url !== undefined
            ? next.vendor_bill_url
            : primary.vendor_bill_url,
        tail_number:
          next.tail_number !== undefined
            ? next.tail_number
            : primary.tail_number,
        aircraft_type:
          next.aircraft_type !== undefined
            ? next.aircraft_type
            : primary.aircraft_type,
      }
      next.vendor_lines = lines.map((l) =>
        l.id === primary.id ? nextPrimary : l,
      )
    }
  }

  if (next.vendor_lines) {
    const rolled = applyVendorLineRollup({
      ...row,
      ...next,
      vendor_lines: next.vendor_lines,
    })
    Object.assign(row, rolled)
    applyOverride(id, rolled)
    bump(id)
    return computeFields(row)
  }

  Object.assign(row, next)
  applyOverride(id, next)
  bump(id)
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

/**
 * Mark every financial row for a referral partner in a calendar month as paid out.
 * Entire months are remitted together (e.g. August → paid in September).
 */
export function markReferralMonthPaidOut(opts: {
  referralName: string
  monthKey: string
  paid?: boolean
}): number {
  const needle = opts.referralName.trim().toLowerCase()
  if (!needle || !opts.monthKey) return 0
  const paid = opts.paid !== false
  let n = 0
  const touched: string[] = []
  for (const row of records.values()) {
    if ((row.referral_name ?? '').trim().toLowerCase() !== needle) continue
    if (referralFlightMonthKey(row.date_of_flight) !== opts.monthKey) continue
    if (row.referral_paid_out === paid) continue
    row.referral_paid_out = paid
    applyOverride(row.id, { referral_paid_out: paid })
    touched.push(row.id)
    n += 1
  }
  if (n) {
    rebuild()
    persistOverrides()
    for (const l of listeners) l()
    for (const id of touched) schedulePersist(id)
  }
  return n
}

