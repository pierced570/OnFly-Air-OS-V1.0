/**
 * QuickBooks invoice payload builder — pure TS.
 * OFA rules: EmailStatus=NotSet, no BillEmail, no online pay, DocNumber=PO.
 */

import { payTermsDays } from '@/domain/financials'

export type QbSalesTermId = '1' | '2' | '3' | '4'

/** QBO SalesTermRef value IDs (standard company file). */
export function salesTermRefForPayTerms(payTerms: string | null | undefined): QbSalesTermId {
  const t = (payTerms ?? '').toLowerCase()
  if (t.includes('receipt') || t.includes('due on')) return '1'
  if (/\b15\b/.test(t) || t.includes('net 15')) return '2'
  if (/\b60\b/.test(t) || t.includes('net 60')) return '4'
  return '3' // Net 30 default
}

export type QbInvoiceLineInput = {
  description: string
  amount: number
}

export type BuildQbInvoiceInput = {
  customerId: string
  customerName: string
  /** Becomes DocNumber — OFA preference */
  poNumber: string
  txnDate: string // yyyy-mm-dd
  payTerms: string | null
  lines: QbInvoiceLineInput[]
  notes?: string | null
  /** QBO ItemRef for SalesItemLineDetail */
  itemId: string
  itemName?: string
}

export type QbInvoicePayload = {
  CustomerRef: { value: string; name: string }
  AllowOnlineCreditCardPayment: false
  AllowOnlineACHPayment: false
  Line: Array<{
    Amount: number
    DetailType: 'SalesItemLineDetail'
    Description: string
    SalesItemLineDetail: {
      ItemRef: { value: string; name: string }
      UnitPrice: number
      Qty: number
    }
  }>
  TxnDate: string
  DocNumber: string
  SalesTermRef: { value: QbSalesTermId }
  DueDate: string
  CustomerMemo?: { value: string }
  PrivateNote?: string
  EmailStatus: 'NotSet'
}

export function dueDateIso(txnDate: string, payTerms: string | null): string {
  const days = payTermsDays(payTerms)
  const d = new Date(`${txnDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Normalize PO for DocNumber (strip "PO #" prefix noise). */
export function normalizePoDocNumber(raw: string | null | undefined, fallback: string): string {
  const s = (raw ?? '').trim()
  if (!s) return fallback
  const cleaned = s.replace(/^PO\s*#?\s*/i, '').trim()
  return cleaned || fallback
}

export function nextPoNumber(opts: {
  lastNumeric: number | null
  prefix: string
  pad?: number
}): string {
  const n = (opts.lastNumeric ?? 0) + 1
  const pad = opts.pad ?? 4
  const body = String(n).padStart(pad, '0')
  const prefix = opts.prefix.trim()
  return prefix ? `${prefix}${body}` : body
}

export function extractPoNumeric(po: string | null | undefined): number | null {
  if (!po) return null
  const m = po.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

export function buildQbInvoicePayload(input: BuildQbInvoiceInput): QbInvoicePayload {
  const doc = normalizePoDocNumber(input.poNumber, `T-${Date.now()}`)
  const lines = input.lines
    .filter((l) => l.amount > 0 && l.description.trim())
    .map((l) => ({
      Amount: Math.round(l.amount * 100) / 100,
      DetailType: 'SalesItemLineDetail' as const,
      Description: l.description.trim().slice(0, 4000),
      SalesItemLineDetail: {
        ItemRef: {
          value: input.itemId,
          name: input.itemName ?? 'Services',
        },
        UnitPrice: Math.round(l.amount * 100) / 100,
        Qty: 1,
      },
    }))
  if (!lines.length) {
    throw new Error('Invoice needs at least one line with amount > 0')
  }

  const payload: QbInvoicePayload = {
    CustomerRef: {
      value: input.customerId,
      name: input.customerName,
    },
    AllowOnlineCreditCardPayment: false,
    AllowOnlineACHPayment: false,
    Line: lines,
    TxnDate: input.txnDate,
    DocNumber: doc,
    SalesTermRef: { value: salesTermRefForPayTerms(input.payTerms) },
    DueDate: dueDateIso(input.txnDate, input.payTerms),
    EmailStatus: 'NotSet',
  }
  const notes = input.notes?.trim()
  if (notes) {
    payload.CustomerMemo = { value: notes.slice(0, 1000) }
    payload.PrivateNote = notes.slice(0, 4000)
  }
  return payload
}

/** Build air + tax lines for OnFly trip invoice (CHUNK_5). */
export function tripInvoiceLines(opts: {
  tripRef: number
  lane: string
  flightDate: string | null
  airAmount: number
  taxLines?: Array<{ code: string; amount: number; note?: string }>
  /** Confirmed aircraft type — appears on the air line description. */
  aircraftType?: string | null
}): QbInvoiceLineInput[] {
  const dateBit = opts.flightDate ?? ''
  const typeBit = (opts.aircraftType ?? '').trim()
  const desc = [`T-${opts.tripRef}`, opts.lane, typeBit, dateBit]
    .filter(Boolean)
    .join(' ')
  const lines: QbInvoiceLineInput[] = [
    {
      description: desc,
      amount: opts.airAmount,
    },
  ]
  for (const t of opts.taxLines ?? []) {
    if (t.amount <= 0) continue
    lines.push({
      description: `${t.code}${t.note ? ` — ${t.note}` : ''}`,
      amount: t.amount,
    })
  }
  return lines
}
