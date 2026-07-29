/**
 * Accounting / QuickBooks adapter — mock (default) or QBO via edge functions.
 * Secrets (QB_CLIENT_ID/SECRET, tokens) never in VITE_*.
 *
 * Create in QBO (ACH on, DocNumber=PO). Deliver via native
 * /invoice/{id}/send so the PDF + ACH payment request match live OFA.
 */

import { adapterMode } from '@/adapters/types'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  buildQbInvoicePayload,
  type QbInvoiceLineInput,
} from '@/domain/qbInvoice'

export type InvoiceLine = QbInvoiceLineInput & { taxCode?: string }

export type CreateInvoiceRequest = {
  customerName: string
  customerId?: string | null
  poNumber: string
  txnDate: string
  payTerms: string | null
  lines: InvoiceLine[]
  notes?: string | null
  /** Trip ref for mock ids / logging */
  tripRef?: number
  /** AP inbox — stored on the QBO invoice BillEmail */
  billEmail?: string | null
  /** Default true — enables View & pay / ACH on the QBO PDF */
  allowOnlineAch?: boolean
}

export type CreateInvoiceResult = {
  qbInvoiceId: string
  qbInvoiceNumber: string
  url: string
  customerId: string
  mock: boolean
}

export type QbDashboardStats = {
  lifetime_revenue: number
  total_outstanding: number
  total_paid: number
  open_count: number
  overdue_count: number
  paid_count: number
  total_expenses: number | null
  net_income: number | null
  recent_open_invoices: Array<{
    id: string
    doc_number: string
    customer: string
    balance: number
    txn_date: string
    due_date: string
  }>
  source: 'mock' | 'quickbooks'
}

export type QbConnectionStatus = {
  connected: boolean
  environment: 'sandbox' | 'production' | null
  /** From QB_ENVIRONMENT secret — what invoices should use. */
  desired_environment?: 'sandbox' | 'production' | null
  /** Connected env ≠ desired (e.g. still on sandbox after flipping to production). */
  environment_mismatch?: boolean
  realm_id: string | null
}

export interface AccountingAdapter {
  ensureCustomer(clientName: string): Promise<string>
  createInvoice(req: CreateInvoiceRequest): Promise<CreateInvoiceResult>
  /** @deprecated prefer createInvoice(CreateInvoiceRequest) */
  createInvoiceLegacy?(
    tripRef: number,
    lines: InvoiceLine[],
  ): Promise<{ qbInvoiceId: string; url: string }>
  invoiceStatus(qbInvoiceId: string): Promise<'sent' | 'viewed' | 'paid'>
  getConnectionStatus(): Promise<QbConnectionStatus>
  getConnectUrl(redirectTo: string): Promise<string | null>
  getDashboardStats(): Promise<QbDashboardStats>
  getLastPoNumeric(customerName: string): Promise<number | null>
  getInvoicePdfBase64(qbInvoiceId: string): Promise<string | null>
  /** Native QBO payment-request email (preferred) or mock/Resend fallback. */
  sendInvoiceEmail(opts: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    poNumber: string
    qbInvoiceId: string
    /** Unused for native QBO send — kept for mock/Resend fallback. */
    pdfBase64?: string
    clientName?: string
    logoUrl?: string
  }): Promise<{ id: string }>
}

const mockInvoices = new Map<
  string,
  { status: 'sent' | 'viewed' | 'paid'; total: number; doc: string }
>()

/** Desk / tests: mark a mock QB invoice paid so the paid→closed poller can close. */
export function markMockInvoicePaid(qbInvoiceId: string): boolean {
  const row = mockInvoices.get(qbInvoiceId)
  if (!row) return false
  row.status = 'paid'
  return true
}

export function listMockInvoiceIds(): string[] {
  return [...mockInvoices.keys()]
}

export class MockAccountingAdapter implements AccountingAdapter {
  async ensureCustomer(clientName: string) {
    return `mock-cust-${clientName.slice(0, 12).replace(/\s+/g, '_')}`
  }

  async createInvoice(req: CreateInvoiceRequest): Promise<CreateInvoiceResult> {
    const customerId =
      req.customerId?.trim() || (await this.ensureCustomer(req.customerName))
    // Validate OFA payload shape even in mock
    const payload = buildQbInvoicePayload({
      customerId,
      customerName: req.customerName,
      poNumber: req.poNumber,
      txnDate: req.txnDate,
      payTerms: req.payTerms,
      lines: req.lines,
      notes: req.notes,
      itemId: 'mock-item-1',
      itemName: 'Brokerage Services - AOG',
      billEmail: req.billEmail,
      allowOnlineAch: req.allowOnlineAch ?? true,
    })
    const id = `mock-inv-${req.tripRef ?? payload.DocNumber}`
    mockInvoices.set(id, {
      status: 'sent',
      total: payload.Line.reduce((s, l) => s + l.Amount, 0),
      doc: payload.DocNumber,
    })
    console.info('[MockQB] create_invoice', {
      id,
      DocNumber: payload.DocNumber,
      EmailStatus: payload.EmailStatus,
      AllowOnlineACHPayment: payload.AllowOnlineACHPayment,
      lines: payload.Line.length,
    })
    return {
      qbInvoiceId: id,
      qbInvoiceNumber: payload.DocNumber,
      url: `/mock-qb/${id}`,
      customerId,
      mock: true,
    }
  }

  async invoiceStatus(qbInvoiceId: string) {
    return mockInvoices.get(qbInvoiceId)?.status ?? 'sent'
  }

  async getConnectionStatus(): Promise<QbConnectionStatus> {
    return { connected: false, environment: null, realm_id: null }
  }

  async getConnectUrl(_redirectTo: string) {
    return null
  }

  async getDashboardStats(): Promise<QbDashboardStats> {
    let revenue = 0
    for (const inv of mockInvoices.values()) revenue += inv.total
    return {
      lifetime_revenue: revenue,
      total_outstanding: revenue,
      total_paid: 0,
      open_count: mockInvoices.size,
      overdue_count: 0,
      paid_count: 0,
      total_expenses: null,
      net_income: null,
      recent_open_invoices: [...mockInvoices.entries()].slice(0, 5).map(
        ([id, inv]) => ({
          id,
          doc_number: inv.doc,
          customer: 'Mock',
          balance: inv.total,
          txn_date: new Date().toISOString().slice(0, 10),
          due_date: new Date().toISOString().slice(0, 10),
        }),
      ),
      source: 'mock',
    }
  }

  async getLastPoNumeric(_customerName: string) {
    let max: number | null = null
    for (const inv of mockInvoices.values()) {
      const m = inv.doc.match(/(\d+)/)
      if (m) {
        const n = Number(m[1])
        if (max == null || n > max) max = n
      }
    }
    return max
  }

  async getInvoicePdfBase64(_qbInvoiceId: string) {
    // Minimal PDF header as base64 for mock attach path
    const minimal =
      'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjQgMDAwMDAgbiAKMDAwMDAwMDEyMSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDQKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjE5OQolJUVPRgo='
    return minimal
  }

  async sendInvoiceEmail(opts: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    poNumber: string
    qbInvoiceId: string
    pdfBase64?: string
    clientName?: string
    logoUrl?: string
  }) {
    console.info(
      '[MockQB] send-invoice (native QBO path simulated)',
      {
        qbInvoiceId: opts.qbInvoiceId,
        to: opts.to,
        cc: opts.cc,
        po: opts.poNumber,
      },
    )
    // Optional Resend fallback when a PDF is provided (local demos).
    if (opts.pdfBase64 && supabase && isSupabaseConfigured) {
      const { data, error } = await supabase.functions.invoke(
        'send-invoice-email',
        {
          body: {
            to: opts.to,
            cc: opts.cc,
            bcc: opts.bcc,
            po_number: opts.poNumber,
            pdf_base64: opts.pdfBase64,
            client_name: opts.clientName,
            logo_url: opts.logoUrl,
          },
        },
      )
      if (!error) {
        const body = data as { id?: string; error?: string }
        if (!body?.error) {
          return { id: String(body.id ?? `mock-mail-${opts.poNumber}`) }
        }
      }
      console.warn('[MockQB] branded send-invoice-email failed', error ?? data)
    }
    return { id: `mock-mail-${opts.poNumber}` }
  }
}

export class QuickBooksAccountingAdapter implements AccountingAdapter {
  private async invoke(action: string, payload: Record<string, unknown> = {}) {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('QuickBooks real mode needs Supabase')
    }
    const { data, error } = await supabase.functions.invoke('quickbooks-api', {
      body: { action, company_id: 'onfly', ...payload },
    })
    if (error) throw new Error(error.message || `quickbooks-api ${action} failed`)
    const body = data as { error?: string; detail?: string } | null
    if (body?.error) {
      throw new Error(
        body.detail ? `${body.error}: ${body.detail}` : body.error,
      )
    }
    return data as Record<string, unknown>
  }

  async ensureCustomer(clientName: string): Promise<string> {
    const data = await this.invoke('ensure_customer', {
      customer_name: clientName,
    })
    return String(data.customer_id ?? '')
  }

  async createInvoice(req: CreateInvoiceRequest): Promise<CreateInvoiceResult> {
    const data = await this.invoke('create_invoice', {
      customer_name: req.customerName,
      ...(req.customerId ? { customer_id: req.customerId } : {}),
      po_number: req.poNumber,
      txn_date: req.txnDate,
      pay_terms: req.payTerms,
      lines: req.lines,
      notes: req.notes,
      trip_ref: req.tripRef,
      bill_email: req.billEmail ?? null,
      allow_online_ach: req.allowOnlineAch ?? true,
    })
    return {
      qbInvoiceId: String(data.invoice_id ?? ''),
      qbInvoiceNumber: String(data.doc_number ?? req.poNumber),
      url: String(data.url ?? ''),
      customerId: String(data.customer_id ?? ''),
      mock: false,
    }
  }

  async invoiceStatus(qbInvoiceId: string) {
    const data = await this.invoke('invoice_status', {
      invoice_id: qbInvoiceId,
    })
    const s = String(data.status ?? 'sent')
    if (s === 'paid' || s === 'viewed') return s
    return 'sent'
  }

  async getConnectionStatus(): Promise<QbConnectionStatus> {
    try {
      const data = await this.invoke('connection_status')
      const env =
        (data.environment as QbConnectionStatus['environment']) ?? null
      const desired =
        (data.desired_environment as QbConnectionStatus['environment']) ??
        null
      return {
        connected: Boolean(data.connected),
        environment: env,
        desired_environment: desired,
        environment_mismatch: Boolean(data.environment_mismatch),
        realm_id: data.realm_id ? String(data.realm_id) : null,
      }
    } catch {
      return {
        connected: false,
        environment: null,
        desired_environment: null,
        environment_mismatch: false,
        realm_id: null,
      }
    }
  }

  async getConnectUrl(redirectTo: string) {
    if (!supabase || !isSupabaseConfigured) return null
    const { data, error } = await supabase.functions.invoke('quickbooks-auth', {
      body: { action: 'connect', redirect_to: redirectTo, company_id: 'onfly' },
    })
    if (error) {
      console.warn('[qb] connect url', error.message)
      return null
    }
    const body = data as { url?: string; error?: string }
    if (body?.error) {
      console.warn('[qb]', body.error)
      return null
    }
    return body.url ?? null
  }

  async getDashboardStats(): Promise<QbDashboardStats> {
    const data = await this.invoke('get_dashboard_stats')
    return {
      lifetime_revenue: Number(data.lifetime_revenue ?? 0),
      total_outstanding: Number(data.total_outstanding ?? 0),
      total_paid: Number(data.total_paid ?? 0),
      open_count: Number(data.open_count ?? 0),
      overdue_count: Number(data.overdue_count ?? 0),
      paid_count: Number(data.paid_count ?? 0),
      total_expenses:
        data.total_expenses == null ? null : Number(data.total_expenses),
      net_income: data.net_income == null ? null : Number(data.net_income),
      recent_open_invoices: Array.isArray(data.recent_open_invoices)
        ? (data.recent_open_invoices as QbDashboardStats['recent_open_invoices'])
        : [],
      source: 'quickbooks',
    }
  }

  async getLastPoNumeric(customerName: string) {
    const data = await this.invoke('get_last_po', {
      customer_name: customerName,
    })
    const n = data.last_numeric
    return n == null ? null : Number(n)
  }

  async getInvoicePdfBase64(qbInvoiceId: string) {
    const data = await this.invoke('get_invoice_pdf', {
      invoice_id: qbInvoiceId,
    })
    return data.pdf_base64 ? String(data.pdf_base64) : null
  }

  async sendInvoiceEmail(opts: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    poNumber: string
    qbInvoiceId: string
    pdfBase64?: string
    clientName?: string
    logoUrl?: string
  }) {
    if (!opts.qbInvoiceId?.trim()) {
      throw new Error('qbInvoiceId required for QuickBooks invoice send')
    }
    const sendTo = opts.to.map((e) => e.trim().toLowerCase()).find((e) => e.includes('@'))
    if (!sendTo) throw new Error('Invoice To email required')
    // Native QBO payment-request email — PDF + ACH "View and pay" from the company file.
    const data = await this.invoke('send_invoice', {
      invoice_id: opts.qbInvoiceId,
      send_to: sendTo,
      cc: opts.cc ?? [],
      allow_online_ach: true,
    })
    return { id: String(data.invoice_id ?? opts.qbInvoiceId) }
  }
}

export function createAccountingAdapter(): AccountingAdapter {
  const mode =
    adapterMode('VITE_QB_ADAPTER', 'mock') === 'real' ||
    adapterMode('VITE_ACCOUNTING_PROVIDER', 'mock') === 'real'
      ? 'real'
      : 'mock'
  if (mode === 'real' && isSupabaseConfigured) {
    return new QuickBooksAccountingAdapter()
  }
  if (mode === 'real' && !isSupabaseConfigured) {
    console.warn('[qb] real mode needs Supabase — using mock')
  }
  return new MockAccountingAdapter()
}

export function isRealQbEnabled(): boolean {
  return (
    adapterMode('VITE_QB_ADAPTER', 'mock') === 'real' ||
    adapterMode('VITE_ACCOUNTING_PROVIDER', 'mock') === 'real'
  )
}
