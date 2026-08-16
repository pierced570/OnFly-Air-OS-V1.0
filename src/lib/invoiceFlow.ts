/**
 * Orchestrate QB invoice create → branded payment-request email → ledger.
 * PDF from QuickBooks; subject/body filled with PO + trip details via Resend.
 * Never falls through to the native QBO company template (ENTER … placeholders).
 */

import {
  createAccountingAdapter,
  type CreateInvoiceResult,
} from '@/adapters/accounting'
import type { FinancialRecord } from '@/domain/financials'
import {
  buildInvoiceCustomerMemo,
  buildInvoiceItineraryLines,
  extractPoNumeric,
  nextPoNumber,
  normalizePoDocNumber,
  tripInvoiceLines,
} from '@/domain/qbInvoice'
import {
  hasInvoicePlaceholderCopy,
  invoiceEmailSubject,
  isInvoicePoPlaceholder,
  renderInvoiceEmailHtml,
  renderInvoiceEmailText,
  type InvoiceEmailTemplate,
} from '@/domain/invoiceEmail'
import { patternLabelForService, shortLaneLabel } from '@/domain/etaSheetEmail'
import { listClients, listInvoiceEmails } from '@/lib/clientStore'
import { upsertFinancial } from '@/lib/financialsStore'
import { invoiceEmailLogoUrl } from '@/lib/invoiceEmailLogo'
import { charterContractUrlFromEnv } from '@/lib/invoiceTripFacts'
import { DateTime } from 'luxon'

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

  const lane = row.route_text || ''
  const itineraryLines = buildInvoiceItineraryLines({ lane })
  const memo = buildInvoiceCustomerMemo({
    lane,
    flightDate: row.date_of_flight,
    aircraftType: row.aircraft_type,
    tail: row.tail_number,
    poNumber,
    payTerms: row.pay_terms || client?.pay_terms || 'Net 30',
    itineraryLines,
    extraNotes: row.notes?.trim() || null,
  })
  if (hasInvoicePlaceholderCopy(memo)) {
    throw new Error(
      'Invoice trip details still contain ENTER placeholders — fill tail / route before send',
    )
  }

  const lines = tripInvoiceLines({
    tripRef: 0,
    lane,
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
        lane,
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
    notes: memo,
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
    if (isInvoicePoPlaceholder(doc)) {
      throw new Error('Invoice PO required before send — refuse placeholder PO')
    }
    const tpl = financialInvoiceEmailTemplate({
      row,
      poNumber: doc,
      clientName,
      amountUsd: row.client_invoiced_amount,
      payUrl: created.url || null,
      itineraryLines,
    })
    const mail = await acct.sendInvoiceEmail({
      to,
      poNumber: doc,
      qbInvoiceId: created.qbInvoiceId,
      clientName,
      amountUsd: row.client_invoiced_amount,
      lane: shortLaneLabel(lane) || lane,
      flightDate: row.date_of_flight,
      aircraftType: row.aircraft_type,
      tail: row.tail_number,
      itineraryLines,
      payUrl: created.url || null,
      contractUrl: charterContractUrlFromEnv(),
      customerMemo: memo,
      subject: invoiceEmailSubject({
        poNumber: doc,
        laneShort: tpl.laneShort,
        tail: tpl.tail,
      }),
      html: renderInvoiceEmailHtml(tpl),
      text: renderInvoiceEmailText(tpl),
      logoUrl: invoiceEmailLogoUrl(),
    })
    emailed = true
    emailId = mail.id
  }

  return {
    created,
    emailed,
    emailId,
    to,
    poNumber: doc,
  }
}

function financialInvoiceEmailTemplate(opts: {
  row: FinancialRecord
  poNumber: string
  clientName: string
  amountUsd: number
  payUrl?: string | null
  itineraryLines: string[]
}): InvoiceEmailTemplate {
  const lane = opts.row.route_text || ''
  const laneShort = shortLaneLabel(lane) || lane || '—'
  const parts = lane.split(/→|->|–|—/).map((s) => s.trim()).filter(Boolean)
  const origin = (parts[0] || 'DEP').replace(/^K/i, '')
  const dest = (parts[1] || 'ARR').replace(/^K/i, '')
  const tail = opts.row.tail_number?.trim() || 'TBD'
  const aircraft = opts.row.aircraft_type?.trim() || 'Aircraft TBD'
  const prepared = `Prepared ${DateTime.utc()
    .setZone('America/New_York')
    .toFormat('ccc LLL d · HH:mm ZZZZ')}`

  return {
    logoUrl: invoiceEmailLogoUrl(),
    poNumber: opts.poNumber,
    laneShort,
    preparedLabel: prepared,
    patternLabel: patternLabelForService(null),
    aircraftType: aircraft,
    aircraftBlurb: 'Cargo configuration',
    tail,
    pickup: {
      kind: 'pickup',
      placeBadge: 'AIRPORT',
      title: `${origin} departure`,
      addressLines: [`Depart via ${origin}`, 'Hangar-side / FBO load as coordinated'],
      footer: `Departs via ${origin}`,
    },
    dropoff: {
      kind: 'dropoff',
      placeBadge: 'FBO',
      title: `${dest} arrival`,
      addressLines: [`Arrive at ${dest}`, 'Your team meets aircraft at FBO ramp'],
      footer: `Arrives at ${dest}`,
    },
    milestones: [
      {
        label: `${origin} → ${dest}`,
        detail: 'Live times on portal',
        projected: null,
        actual: null,
      },
    ],
    portalUrl: 'https://ofaops.onflyair.com/portal',
    clientName: opts.clientName,
    amountUsd: opts.amountUsd,
    payUrl: opts.payUrl ?? null,
    contractUrl: charterContractUrlFromEnv(),
    itineraryLines: opts.itineraryLines,
    flightDate: opts.row.date_of_flight,
    detailLines: opts.row.notes?.trim() ? [opts.row.notes.trim()] : [],
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
