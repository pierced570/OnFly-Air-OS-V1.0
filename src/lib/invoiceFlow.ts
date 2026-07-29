/**
 * Orchestrate QB invoice create → PDF → branded Resend → ledger update.
 * Never uses QBO's native email send.
 */

import {
  createAccountingAdapter,
  type CreateInvoiceResult,
} from '@/adapters/accounting'
import type { FinancialRecord } from '@/domain/financials'
import {
  extractPoNumeric,
  nextPoNumber,
  normalizePoDocNumber,
  tripInvoiceLines,
} from '@/domain/qbInvoice'
import { listClients, listInvoiceEmails } from '@/lib/clientStore'
import { upsertFinancial } from '@/lib/financialsStore'

export type SendFinancialInvoiceResult = {
  created: CreateInvoiceResult
  emailed: boolean
  emailId?: string
  to: string[]
  poNumber: string
}

export async function sendFinancialInvoice(
  row: FinancialRecord,
  opts?: { to?: string[]; poPrefix?: string; skipEmail?: boolean },
): Promise<SendFinancialInvoiceResult> {
  if (row.qb_invoice_id) {
    throw new Error(
      `Already invoiced as ${row.qb_invoice_number || row.qb_invoice_id}`,
    )
  }
  if (!(row.client_invoiced_amount > 0)) {
    throw new Error('Client charged amount must be > 0')
  }

  const acct = createAccountingAdapter()
  const clientName = row.client_name?.trim() || 'Client'
  const client = listClients().find(
    (c) => c.name.toLowerCase() === clientName.toLowerCase(),
  )

  const prefix =
    opts?.poPrefix ||
    client?.po_prefix?.trim() ||
    guessPrefix(row.operator_po ?? row.po_number ?? null) ||
    initialsPrefix(clientName)

  const last = await acct.getLastPoNumeric(clientName)
  const existingPo = (row.operator_po || row.po_number || '').trim()
  const fromRecord = extractPoNumeric(existingPo)
  // Prefer existing PO on the ledger row; otherwise sequence from QBO last + prefix
  const poNumber = existingPo
    ? normalizePoDocNumber(
        existingPo,
        nextPoNumber({ lastNumeric: last ?? fromRecord, prefix }),
      )
    : nextPoNumber({
        lastNumeric: last ?? fromRecord,
        prefix,
      })

  const txnDate =
    row.date_of_flight || new Date().toISOString().slice(0, 10)
  const air =
    row.client_subtotal_pre_tax != null
      ? row.client_subtotal_pre_tax
      : Math.max(0, row.client_invoiced_amount - (row.tax_total || 0))

  const lines = tripInvoiceLines({
    tripRef: 0,
    lane: row.route_text || '',
    flightDate: row.date_of_flight,
    airAmount: air || row.client_invoiced_amount,
    aircraftType: row.aircraft_type,
    taxLines: (row.tax_breakdown ?? []).map((t) => ({
      code: t.code,
      amount: t.amount,
      note: t.note,
    })),
  })
  if (lines[0]) {
    lines[0] = {
      ...lines[0],
      description: [
        poNumber,
        row.route_text || '',
        row.aircraft_type || '',
        txnDate,
      ]
        .filter(Boolean)
        .join(' ')
        .trim(),
    }
  }

  const created = await acct.createInvoice({
    customerName: clientName,
    customerId: client?.qb_customer_id,
    poNumber,
    txnDate,
    payTerms: row.pay_terms || client?.pay_terms || 'Net 30',
    lines,
    notes: row.notes,
  })

  const doc = created.qbInvoiceNumber || poNumber
  upsertFinancial({
    ...row,
    operator_po: doc,
    po_number: doc,
    qb_invoice_id: created.qbInvoiceId,
    qb_invoice_number: doc,
    invoice_date: txnDate,
    bill_logged_in_qb: true,
  })

  if (client && created.customerId && !client.qb_customer_id) {
    const { updateClient } = await import('@/lib/clientStore')
    updateClient(client.id, { qb_customer_id: created.customerId })
  }

  let emailed = false
  let emailId: string | undefined
  const to =
    opts?.to?.filter((e) => e.includes('@')) ??
    (client ? listInvoiceEmails(client.id) : inferApEmails(clientName))

  if (!opts?.skipEmail && to.length) {
    const pdf = await acct.getInvoicePdfBase64(created.qbInvoiceId)
    if (pdf) {
      const { invoiceEmailLogoUrl } = await import('@/lib/invoiceEmailLogo')
      const mail = await acct.sendInvoiceEmail({
        to,
        poNumber: doc,
        pdfBase64: pdf,
        clientName,
        logoUrl: invoiceEmailLogoUrl(),
      })
      emailed = true
      emailId = mail.id
    }
  }

  return {
    created,
    emailed,
    emailId,
    to,
    poNumber: doc,
  }
}

function guessPrefix(po: string | null): string {
  if (!po) return ''
  const m = po.match(/^([A-Za-z]+)/)
  return m?.[1]?.toUpperCase() ?? ''
}

function initialsPrefix(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }
  return name.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'OFA'
}

function inferApEmails(clientName: string): string[] {
  const hit = listClients().find(
    (c) => c.name.toLowerCase() === clientName.toLowerCase(),
  )
  if (hit) return listInvoiceEmails(hit.id)
  return []
}
