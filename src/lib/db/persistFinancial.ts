/**
 * Best-effort upsert of OFA Financials rows into Supabase.
 * In-memory + localStorage stay optimistic; DB is the cross-deploy source of truth.
 */

import type { FinancialRecord, FinancialVendorLine } from '@/domain/financials'
import { canPersist, db } from '@/lib/db/client'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(v: string | undefined | null): v is string {
  return Boolean(v && UUID_RE.test(v))
}

/** Map session store id → Postgres uuid (+ optional trip link). */
export function financialDbIdentity(storeId: string): {
  id: string
  trip_id: string | null
} | null {
  if (isUuid(storeId)) return { id: storeId, trip_id: null }
  const m = /^trip-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
    storeId,
  )
  if (m?.[1]) return { id: m[1], trip_id: m[1] }
  return null
}

function linePersistId(line: FinancialVendorLine): string {
  if (isUuid(line.id)) return line.id
  return crypto.randomUUID()
}

export type PersistFinancialResult = {
  ok: boolean
  /** Vendor line ids rewritten to UUIDs when the session used synthetic ids. */
  vendor_lines?: FinancialVendorLine[]
}

export async function persistFinancialRecord(
  row: FinancialRecord,
): Promise<PersistFinancialResult> {
  if (!canPersist()) return { ok: false }
  const ident = financialDbIdentity(row.id)
  if (!ident) {
    console.warn('[financials] skip DB persist — non-uuid id', row.id)
    return { ok: false }
  }

  const body = {
    id: ident.id,
    updated_at: new Date().toISOString(),
    trip_id: ident.trip_id,
    is_legacy: row.is_legacy,
    source: row.source || 'edit',
    date_of_flight: row.date_of_flight,
    operator_po: row.operator_po,
    client_name: row.client_name,
    route_text: row.route_text,
    aircraft_type: row.aircraft_type,
    tail_number: row.tail_number,
    vendor_name: row.vendor_name,
    pay_terms: row.pay_terms,
    referral_name: row.referral_name,
    referral_share_amount: row.referral_share_amount ?? 0,
    client_subtotal_pre_tax: row.client_subtotal_pre_tax,
    tax_total: row.tax_total,
    tax_breakdown: row.tax_breakdown ?? [],
    client_invoiced_amount: row.client_invoiced_amount,
    vendor_amount: row.vendor_amount,
    margin: row.margin,
    funded_by: row.funded_by,
    deposited_to: row.deposited_to,
    check_deposit_number: row.check_deposit_number,
    jonnys_profits: row.jonnys_profits,
    jonny_invested: row.jonny_invested,
    jonny_money_owed: row.jonny_money_owed,
    jonny_money_returned: row.jonny_money_returned,
    ofa_profit_per_trip: row.ofa_profit_per_trip,
    was_it_paid: row.was_it_paid,
    vendor_paid: row.vendor_paid,
    investor_paid: row.investor_paid,
    has_ofa_seen_profit: row.has_ofa_seen_profit,
    bill_logged_in_qb: row.bill_logged_in_qb,
    referral_paid_out: row.referral_paid_out,
    vendor_bill_url: row.vendor_bill_url,
    vendor_bill_verified: row.vendor_bill_verified,
    notes: row.notes,
    qb_invoice_id: row.qb_invoice_id ?? null,
    qb_invoice_number: row.qb_invoice_number ?? null,
    invoice_date: row.invoice_date ?? null,
    due_date: row.due_date ?? null,
    po_number: row.po_number ?? row.operator_po ?? null,
    client_paid: row.was_it_paid,
  }

  const { error: upsertError } = await db()
    .from('financial_records')
    .upsert(body, { onConflict: 'id' })
  if (upsertError) {
    console.warn('[financials] upsert failed', upsertError.message)
    return { ok: false }
  }

  const lines = Array.isArray(row.vendor_lines) ? row.vendor_lines : []
  const nextLines: FinancialVendorLine[] = lines.map((l) => ({
    ...l,
    id: linePersistId(l),
  }))

  const { error: delError } = await db()
    .from('financial_vendor_lines')
    .delete()
    .eq('financial_record_id', ident.id)
  if (delError) {
    console.warn('[financials] vendor lines delete failed', delError.message)
  }

  if (nextLines.length) {
    const lineRows = nextLines.map((l) => ({
      id: l.id,
      financial_record_id: ident.id,
      trip_id: ident.trip_id,
      po_number: row.operator_po,
      kind: l.kind,
      vendor_name: l.vendor_name ?? '',
      tail_number: l.tail_number,
      aircraft_type: l.aircraft_type,
      amount: l.amount ?? 0,
      pay_terms: l.pay_terms,
      vendor_paid: l.vendor_paid,
      bill_logged_in_qb: l.bill_logged_in_qb,
      vendor_bill_url: l.vendor_bill_url,
      vendor_bill_verified: l.vendor_bill_verified,
      notes: l.notes,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await db().from('financial_vendor_lines').insert(lineRows)
    if (error) {
      console.warn('[financials] vendor lines insert failed', error.message)
      return { ok: false, vendor_lines: nextLines }
    }
  }

  return { ok: true, vendor_lines: nextLines }
}

/** Soft-delete a ledger row from Postgres (vendor lines cascade via FK or explicit). */
export async function deleteFinancialRecordFromDb(
  storeId: string,
): Promise<boolean> {
  if (!canPersist()) return false
  const ident = financialDbIdentity(storeId)
  if (!ident) {
    console.warn('[financials] skip DB delete — non-uuid id', storeId)
    return false
  }

  const { error: lineErr } = await db()
    .from('financial_vendor_lines')
    .delete()
    .eq('financial_record_id', ident.id)
  if (lineErr) {
    console.warn('[financials] vendor lines delete failed', lineErr.message)
  }

  const { error } = await db()
    .from('financial_records')
    .delete()
    .eq('id', ident.id)
  if (error) {
    console.warn('[financials] record delete failed', error.message)
    return false
  }
  return true
}
