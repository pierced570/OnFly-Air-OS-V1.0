/**
 * QuickBooks invoice payload builder — pure TS.
 * DocNumber = PO. Online ACH enabled so the PDF/email include View & pay.
 * Create with EmailStatus=NotSet; send explicitly via /invoice/{id}/send.
 */

import { payTermsDays } from '@/domain/financials'

export type QbSalesTermId = '1' | '2' | '3' | '4'

/** QBO SalesTermRef value IDs (standard company file). */
export function salesTermRefForPayTerms(
  payTerms: string | null | undefined,
): QbSalesTermId {
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
  /** Enable ACH "View and pay" on the QBO PDF / payment-request email. */
  allowOnlineAch?: boolean
  allowOnlineCard?: boolean
  billEmail?: string | null
}

export type QbInvoicePayload = {
  CustomerRef: { value: string; name: string }
  AllowOnlineCreditCardPayment: boolean
  AllowOnlineACHPayment: boolean
  BillEmail?: { Address: string }
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
export function normalizePoDocNumber(
  raw: string | null | undefined,
  fallback: string,
): string {
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

/**
 * Line description matching live OFA invoices:
 * Charter Flight: KNQA → KDFW | 2026-07-28 | MU2 | Tail: N175CA
 */
export function charterFlightLineDescription(opts: {
  lane: string
  flightDate?: string | null
  aircraftType?: string | null
  tail?: string | null
}): string {
  const bits = [
    `Charter Flight: ${opts.lane.trim() || 'TBD'}`,
    opts.flightDate?.trim() || null,
    opts.aircraftType?.trim() || null,
    opts.tail?.trim() ? `Tail: ${opts.tail.trim().toUpperCase()}` : null,
  ].filter(Boolean)
  return bits.join(' | ')
}

/**
 * Trip itinerary lines for invoice email / PDF note (OFA payment-request style).
 * Example:
 *   KNQA → KDFW
 *   Pickup in NQA ETA 2hr 15 min
 *   NQA-DFW 1 hr 45 min
 *   Drop Off at DFW
 */
export function buildInvoiceItineraryLines(opts: {
  lane: string
  /** Position / TTP minutes (pickup ETA). */
  pickupEtaMin?: number | null
  /** Live air-leg minutes. */
  liveLegMin?: number | null
  originIcao?: string | null
  destIcao?: string | null
}): string[] {
  const lane = opts.lane.trim()
  const origin = (
    opts.originIcao?.trim() ||
    lane.split(/→|->|–|—/)[0]?.trim() ||
    ''
  ).toUpperCase()
  const dest = (
    opts.destIcao?.trim() ||
    lane.split(/→|->|–|—/)[1]?.trim() ||
    ''
  ).toUpperCase()
  const originShort = origin.replace(/^K/, '') || origin
  const destShort = dest.replace(/^K/, '') || dest
  const lines: string[] = []
  if (lane) lines.push(lane)
  if (originShort && opts.pickupEtaMin != null && Number.isFinite(opts.pickupEtaMin)) {
    lines.push(
      `Pickup in ${originShort} ETA ${formatInvoiceDuration(opts.pickupEtaMin)}`,
    )
  } else if (originShort) {
    lines.push(`Pickup in ${originShort}`)
  }
  if (
    originShort &&
    destShort &&
    opts.liveLegMin != null &&
    Number.isFinite(opts.liveLegMin)
  ) {
    lines.push(
      `${originShort}-${destShort} ${formatInvoiceDuration(opts.liveLegMin)}`,
    )
  }
  if (destShort) lines.push(`Drop Off at ${destShort}`)
  return lines
}

/** "2hr 15 min" / "1 hr 45 min" — matches live OFA invoice copy. */
export function formatInvoiceDuration(min: number): string {
  const t = Math.max(0, Math.round(min))
  const h = Math.floor(t / 60)
  const m = t % 60
  if (h > 0 && m > 0) return `${h}hr ${m} min`
  if (h > 0) return `${h} hr`
  return `${m} min`
}

/**
 * Pickup / drop-off address lines for QBO "Note to customer".
 */
export function buildInvoiceStopNotes(opts: {
  pickupAddress?: string | null
  dropoffAddress?: string | null
}): string[] {
  const out: string[] = []
  const pickup = opts.pickupAddress?.trim()
  const drop = opts.dropoffAddress?.trim()
  if (pickup) out.push(`Pick up the part at ${pickup}`)
  if (drop) out.push(`Drop off part at ${drop}`)
  return out
}

/**
 * Customer-facing memo on the QBO PDF ("Note to customer"), OFA style.
 */
export function buildInvoiceCustomerMemo(opts: {
  lane: string
  flightDate?: string | null
  aircraftType?: string | null
  tail?: string | null
  poNumber?: string | null
  payTerms?: string | null
  extraNotes?: string | null
  /** Optional itinerary block (inserted after terms). */
  itineraryLines?: string[] | null
  pickupAddress?: string | null
  dropoffAddress?: string | null
}): string {
  const stopNotes = buildInvoiceStopNotes({
    pickupAddress: opts.pickupAddress,
    dropoffAddress: opts.dropoffAddress,
  })
  const itinerary = (opts.itineraryLines ?? []).map((l) => l.trim()).filter(Boolean)
  const lines = [
    opts.tail?.trim() ? `Tail Number: ${opts.tail.trim().toUpperCase()}` : null,
    opts.lane.trim() ? `Route: ${opts.lane.trim()}` : null,
    opts.flightDate?.trim() ? `Date: ${opts.flightDate.trim()}` : null,
    opts.aircraftType?.trim()
      ? `Aircraft: ${opts.aircraftType.trim()}`
      : null,
    opts.poNumber?.trim()
      ? `PO #${normalizePoDocNumber(opts.poNumber, opts.poNumber.trim())}`
      : null,
    opts.payTerms?.trim() ? `Terms: ${opts.payTerms.trim()}` : null,
    itinerary.length ? '' : null,
    ...itinerary,
    ...stopNotes,
    opts.extraNotes?.trim() || null,
  ].filter((l) => l != null) as string[]
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 1000)
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
    AllowOnlineCreditCardPayment: input.allowOnlineCard ?? false,
    AllowOnlineACHPayment: input.allowOnlineAch ?? true,
    Line: lines,
    TxnDate: input.txnDate,
    DocNumber: doc,
    SalesTermRef: { value: salesTermRefForPayTerms(input.payTerms) },
    DueDate: dueDateIso(input.txnDate, input.payTerms),
    EmailStatus: 'NotSet',
  }
  const bill = input.billEmail?.trim()
  if (bill?.includes('@')) {
    payload.BillEmail = { Address: bill.toLowerCase() }
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
  tail?: string | null
}): QbInvoiceLineInput[] {
  const desc = charterFlightLineDescription({
    lane: opts.lane,
    flightDate: opts.flightDate,
    aircraftType: opts.aircraftType,
    tail: opts.tail,
  })
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
