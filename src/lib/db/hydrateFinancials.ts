/**
 * Pull financial_records (+ vendor lines) into the session ledger.
 */

import type { FinancialRecord, FinancialVendorLine, VendorLineKind } from '@/domain/financials'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import { replaceFinancialsFromDb } from '@/lib/financialsStore'

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v)
  return s.length ? s : null
}

function mapLine(r: Record<string, unknown>): FinancialVendorLine {
  const kindRaw = String(r.kind ?? 'aircraft')
  const kind = (
    ['aircraft', 'ground', 'fbo', 'other'].includes(kindRaw)
      ? kindRaw
      : 'other'
  ) as VendorLineKind
  return {
    id: String(r.id),
    kind,
    vendor_name: String(r.vendor_name ?? ''),
    tail_number: strOrNull(r.tail_number),
    aircraft_type: strOrNull(r.aircraft_type),
    amount: num(r.amount),
    pay_terms: strOrNull(r.pay_terms),
    vendor_paid: Boolean(r.vendor_paid),
    bill_logged_in_qb: Boolean(r.bill_logged_in_qb),
    vendor_bill_url: strOrNull(r.vendor_bill_url),
    vendor_bill_verified: Boolean(r.vendor_bill_verified),
    notes: strOrNull(r.notes),
  }
}

function storeIdForDbRow(r: Record<string, unknown>): string {
  const id = String(r.id)
  const tripId = strOrNull(r.trip_id)
  // Match ensureFinancialFromBookedTrip session ids when this row is trip-backed.
  if (tripId && tripId === id) return `trip-${tripId}`
  return id
}

function mapRecord(
  r: Record<string, unknown>,
  lines: FinancialVendorLine[],
): FinancialRecord {
  return {
    id: storeIdForDbRow(r),
    is_legacy: Boolean(r.is_legacy),
    source: String(r.source ?? 'live'),
    date_of_flight: strOrNull(r.date_of_flight),
    operator_po: strOrNull(r.operator_po),
    client_name: strOrNull(r.client_name),
    route_text: strOrNull(r.route_text),
    aircraft_type: strOrNull(r.aircraft_type),
    tail_number: strOrNull(r.tail_number),
    vendor_name: strOrNull(r.vendor_name),
    pay_terms: strOrNull(r.pay_terms),
    referral_name: strOrNull(r.referral_name),
    referral_share_amount: num(r.referral_share_amount),
    client_subtotal_pre_tax:
      r.client_subtotal_pre_tax == null ? null : num(r.client_subtotal_pre_tax),
    tax_total: num(r.tax_total),
    tax_breakdown: Array.isArray(r.tax_breakdown)
      ? (r.tax_breakdown as FinancialRecord['tax_breakdown'])
      : [],
    client_invoiced_amount: num(r.client_invoiced_amount),
    vendor_amount: num(r.vendor_amount),
    margin: num(r.margin),
    funded_by: strOrNull(r.funded_by),
    deposited_to: strOrNull(r.deposited_to),
    check_deposit_number: strOrNull(r.check_deposit_number),
    jonnys_profits: num(r.jonnys_profits),
    jonny_invested: num(r.jonny_invested),
    jonny_money_owed: num(r.jonny_money_owed),
    jonny_money_returned: num(r.jonny_money_returned),
    ofa_profit_per_trip: num(r.ofa_profit_per_trip),
    was_it_paid: Boolean(r.was_it_paid ?? r.client_paid),
    vendor_paid: Boolean(r.vendor_paid),
    investor_paid: Boolean(r.investor_paid),
    has_ofa_seen_profit: Boolean(r.has_ofa_seen_profit),
    bill_logged_in_qb: Boolean(r.bill_logged_in_qb),
    referral_paid_out: Boolean(r.referral_paid_out),
    vendor_bill_url: strOrNull(r.vendor_bill_url),
    vendor_bill_verified: Boolean(r.vendor_bill_verified),
    notes: strOrNull(r.notes),
    vendor_lines: lines,
    qb_invoice_id: strOrNull(r.qb_invoice_id),
    qb_invoice_number: strOrNull(r.qb_invoice_number),
    invoice_date: strOrNull(r.invoice_date),
    due_date: strOrNull(r.due_date),
    po_number: strOrNull(r.po_number),
  }
}

export async function hydrateFinancialsFromDb(): Promise<number> {
  if (!canPersist()) return 0

  const rows = await safeQuery<Record<string, unknown>[]>('financial_records.hydrate', () =>
    db()
      .from('financial_records')
      .select('*')
      .order('date_of_flight', { ascending: false }),
  )
  if (!rows?.length) return 0

  const ids = rows.map((r) => String(r.id))
  const lineRows = await safeQuery<Record<string, unknown>[]>(
    'financial_vendor_lines.hydrate',
    () =>
      db().from('financial_vendor_lines').select('*').in('financial_record_id', ids),
  )

  const byRecord = new Map<string, FinancialVendorLine[]>()
  for (const raw of lineRows ?? []) {
    const rid = String(raw.financial_record_id)
    const list = byRecord.get(rid) ?? []
    list.push(mapLine(raw))
    byRecord.set(rid, list)
  }

  const mapped = rows.map((r) =>
    mapRecord(r, byRecord.get(String(r.id)) ?? []),
  )
  replaceFinancialsFromDb(mapped)
  return mapped.length
}
