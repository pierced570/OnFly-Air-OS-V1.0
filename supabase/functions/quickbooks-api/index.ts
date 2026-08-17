/**
 * QuickBooks Online API router — OnFly invoices.
 * Secrets: QB_CLIENT_ID, QB_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY
 *
 * Actions: connection_status, ensure_customer, create_invoice, prepare_invoice,
 * send_invoice, get_invoices, get_dashboard_stats, get_last_po, get_invoice_pdf,
 * invoice_status
 *
 * create_invoice: DocNumber=PO, ACH View & pay on, CustomerMemo=trip details.
 * prepare_invoice: sparse-update DocNumber + CustomerMemo + BillEmail before send.
 * send_invoice: native QBO payment-request (fallback only — prefer Resend).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const COMPANY_ID = 'onfly'
const INTEGRATION = 'quickbooks'

type QbConfig = {
  access_token: string
  refresh_token: string
  token_expires_at: string
  realm_id: string
  environment: 'sandbox' | 'production'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
    if (!req.headers.get('Authorization')) {
      return json({ error: 'Missing Authorization' }, 401)
    }

    const body = (await req.json()) as Record<string, unknown>
    const action = String(body.action ?? '')
    const companyId = String(body.company_id ?? COMPANY_ID)

    if (action === 'connection_status') {
      const row = await loadConfig(companyId)
      const stored = row?.config?.environment ?? null
      const desired = desiredEnvironment()
      return json({
        connected: Boolean(row?.is_connected && row.config?.realm_id),
        environment: stored,
        desired_environment: desired,
        /** True when tokens were issued against sandbox but secrets want production (or vice versa). */
        environment_mismatch: Boolean(stored && stored !== desired),
        realm_id: row?.config?.realm_id ?? null,
      })
    }

    const cfg = await ensureValidToken(companyId)
    // Refuse to create/send against the wrong Intuit environment.
    assertEnvironment(cfg)

    switch (action) {
      case 'ensure_customer':
        return json(
          await ensureCustomer(cfg, String(body.customer_name ?? '')),
        )
      case 'create_invoice':
        return json(await createInvoice(cfg, body))
      case 'prepare_invoice':
        return json(await prepareInvoice(cfg, body))
      case 'send_invoice':
        // Native QBO payment-request uses the company email template with
        // literal (ENTER TAIL/FBO/ETA) blanks. Never send that way — branded
        // Resend (send-invoice-email) is the only allowed client delivery.
        return json(
          {
            error:
              'Native QuickBooks invoice email is disabled — it leaves trip fields blank. Use branded send-invoice-email (Resend) with filled HTML.',
          },
          400,
        )
      case 'get_dashboard_stats':
        return json(await getDashboardStats(cfg))
      case 'get_last_po':
        return json(
          await getLastPo(cfg, String(body.customer_name ?? '')),
        )
      case 'get_invoice_pdf':
        return json(await getInvoicePdf(cfg, String(body.invoice_id ?? '')))
      case 'invoice_status':
        return json(await invoiceStatus(cfg, String(body.invoice_id ?? '')))
      case 'get_company_info':
        return json(await qbFetch(cfg, '/companyinfo/' + cfg.realm_id))
      default:
        return json({ error: `Unknown action ${action}` }, 400)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[quickbooks-api]', msg)
    const reconnect = /reconnect QuickBooks|ApplicationAuthorizationFailed/i.test(
      msg,
    )
    return json(
      {
        error: reconnect ? 'reconnect QuickBooks' : msg,
        detail: msg,
      },
      reconnect ? 401 : 500,
    )
  }
})

function admin() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase service role not configured')
  return createClient(url, key)
}

async function loadConfig(companyId: string) {
  const sb = admin()
  const { data, error } = await sb
    .from('integration_configs')
    .select('is_connected, config')
    .eq('company_id', companyId)
    .eq('integration_type', INTEGRATION)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as {
    is_connected: boolean
    config: QbConfig
  } | null
}

async function saveConfig(companyId: string, config: QbConfig) {
  const sb = admin()
  const { error } = await sb.from('integration_configs').upsert(
    {
      company_id: companyId,
      integration_type: INTEGRATION,
      is_connected: true,
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,integration_type' },
  )
  if (error) throw new Error(error.message)
}

async function ensureValidToken(companyId: string): Promise<QbConfig> {
  const row = await loadConfig(companyId)
  if (!row?.is_connected || !row.config?.refresh_token) {
    throw new Error('reconnect QuickBooks — not connected')
  }
  let cfg = row.config
  const expires = new Date(cfg.token_expires_at).getTime()
  if (expires - Date.now() > 5 * 60_000) return cfg

  const id = Deno.env.get('QB_CLIENT_ID')?.trim()
  const secret = Deno.env.get('QB_CLIENT_SECRET')?.trim()
  if (!id || !secret) throw new Error('QB_CLIENT_ID/SECRET not configured')

  const tokenRes = await fetch(
    'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: cfg.refresh_token,
      }),
    },
  )
  const tokens = await tokenRes.json()
  if (!tokenRes.ok) {
    throw new Error(
      'reconnect QuickBooks — refresh failed (' +
        (tokens?.error ?? tokenRes.status) +
        ')',
    )
  }
  cfg = {
    ...cfg,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? cfg.refresh_token,
    token_expires_at: new Date(
      Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
    ).toISOString(),
  }
  await saveConfig(companyId, cfg)
  return cfg
}

/** Secrets target — production when QB_ENVIRONMENT=production. */
function desiredEnvironment(): 'sandbox' | 'production' {
  const e = (Deno.env.get('QB_ENVIRONMENT') ?? 'sandbox').toLowerCase()
  return e === 'production' ? 'production' : 'sandbox'
}

function assertEnvironment(cfg: QbConfig) {
  const desired = desiredEnvironment()
  const stored = cfg.environment === 'production' ? 'production' : 'sandbox'
  if (stored !== desired) {
    throw new Error(
      `reconnect QuickBooks — connected to ${stored} but QB_ENVIRONMENT=${desired}. ` +
        `Disconnect and Connect again, then pick the live OnFly company.`,
    )
  }
}

function baseUrl(cfg: QbConfig) {
  // Prefer the environment stamped at OAuth connect time.
  return cfg.environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
}

async function qbFetch(
  cfg: QbConfig,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const url = path.startsWith('http')
    ? path
    : `${baseUrl(cfg)}/v3/company/${cfg.realm_id}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.access_token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let data: unknown = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const fault = JSON.stringify(data)
    if (/ApplicationAuthorizationFailed/i.test(fault)) {
      throw new Error('reconnect QuickBooks — ApplicationAuthorizationFailed')
    }
    throw new Error(`QBO HTTP ${res.status}: ${fault.slice(0, 400)}`)
  }
  return data
}

function toArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function escapeQl(name: string) {
  return name.replace(/'/g, "\\'")
}

function salesTermRef(payTerms: string | null | undefined): string {
  const t = (payTerms ?? '').toLowerCase()
  if (t.includes('receipt') || t.includes('due on')) return '1'
  if (/\b15\b/.test(t) || t.includes('net 15')) return '2'
  if (/\b60\b/.test(t) || t.includes('net 60')) return '4'
  return '3'
}

function dueDate(txnDate: string, payTerms: string | null | undefined) {
  const m = (payTerms ?? '').match(/(\d+)/)
  const days = m ? Number(m[1]) : 30
  const d = new Date(`${txnDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function ensureCustomer(cfg: QbConfig, name: string) {
  const display = name.trim()
  if (!display) throw new Error('customer_name required')
  const q = encodeURIComponent(
    `select * from Customer where DisplayName = '${escapeQl(display)}'`,
  )
  const found = (await qbFetch(cfg, `/query?query=${q}`)) as {
    QueryResponse?: { Customer?: unknown }
  }
  const existing = toArray(found.QueryResponse?.Customer as { Id?: string })[0]
  if (existing?.Id) {
    return { customer_id: existing.Id, customer_name: display, created: false }
  }
  const created = (await qbFetch(cfg, '/customer', {
    method: 'POST',
    body: JSON.stringify({ DisplayName: display }),
  })) as { Customer?: { Id?: string } }
  const id = created.Customer?.Id
  if (!id) throw new Error('Failed to create QBO customer')
  return { customer_id: id, customer_name: display, created: true }
}

async function defaultItem(cfg: QbConfig) {
  // Prefer the live OFA brokerage item when present.
  for (const name of [
    'Brokerage Services - AOG',
    'Brokerage Services',
    'Brokerage',
  ]) {
    const q = encodeURIComponent(
      `select * from Item where Name = '${escapeQl(name)}' and Active = true MAXRESULTS 1`,
    )
    const data = (await qbFetch(cfg, `/query?query=${q}`)) as {
      QueryResponse?: { Item?: unknown }
    }
    const item = toArray(
      data.QueryResponse?.Item as { Id?: string; Name?: string },
    )[0]
    if (item?.Id) return { id: item.Id, name: item.Name ?? name }
  }
  const q = encodeURIComponent(
    `select * from Item where Type = 'Service' and Active = true MAXRESULTS 1`,
  )
  let data = (await qbFetch(cfg, `/query?query=${q}`)) as {
    QueryResponse?: { Item?: unknown }
  }
  let item = toArray(data.QueryResponse?.Item as { Id?: string; Name?: string })[0]
  if (!item?.Id) {
    const q2 = encodeURIComponent(
      `select * from Item where Active = true MAXRESULTS 1`,
    )
    data = (await qbFetch(cfg, `/query?query=${q2}`)) as {
      QueryResponse?: { Item?: unknown }
    }
    item = toArray(data.QueryResponse?.Item as { Id?: string; Name?: string })[0]
  }
  if (!item?.Id) {
    throw new Error(
      'Create at least one active Service item in QuickBooks',
    )
  }
  return { id: item.Id, name: item.Name ?? 'Services' }
}

async function createInvoice(cfg: QbConfig, body: Record<string, unknown>) {
  const customerName = String(body.customer_name ?? '').trim()
  let customerId = body.customer_id ? String(body.customer_id) : ''
  if (!customerId) {
    const c = await ensureCustomer(cfg, customerName)
    customerId = c.customer_id
  }
  const item = await defaultItem(cfg)
  const linesIn = Array.isArray(body.lines) ? body.lines : []
  const poRaw = String(body.po_number ?? '').trim()
  const docNumber = poRaw.replace(/^PO\s*#?\s*/i, '').trim() || `INV-${Date.now()}`
  const txnDate = String(body.txn_date ?? new Date().toISOString().slice(0, 10))
  const payTerms = body.pay_terms != null ? String(body.pay_terms) : 'Net 30'
  const notes = body.notes != null ? String(body.notes) : ''
  const billEmail = String(body.bill_email ?? '').trim().toLowerCase()
  const allowAch = body.allow_online_ach !== false
  const allowCard = body.allow_online_card === true

  const Line = linesIn
    .map((l) => {
      const row = l as { description?: string; amount?: number }
      const amount = Number(row.amount ?? 0)
      if (!(amount > 0)) return null
      return {
        Amount: Math.round(amount * 100) / 100,
        DetailType: 'SalesItemLineDetail',
        Description: String(row.description ?? '').slice(0, 4000),
        SalesItemLineDetail: {
          ItemRef: { value: item.id, name: item.name },
          UnitPrice: Math.round(amount * 100) / 100,
          Qty: 1,
        },
      }
    })
    .filter(Boolean)

  if (!Line.length) throw new Error('Invoice needs at least one line')

  const payload: Record<string, unknown> = {
    CustomerRef: { value: customerId, name: customerName },
    // ACH enables "View and pay" / payment-request email like live OFA invoices.
    AllowOnlineCreditCardPayment: allowCard,
    AllowOnlineACHPayment: allowAch,
    Line,
    TxnDate: txnDate,
    DocNumber: docNumber,
    SalesTermRef: { value: salesTermRef(payTerms) },
    DueDate: dueDate(txnDate, payTerms),
    EmailStatus: 'NotSet',
  }
  if (billEmail.includes('@')) {
    payload.BillEmail = { Address: billEmail }
  }
  if (notes.trim()) {
    payload.CustomerMemo = { value: notes.slice(0, 1000) }
    payload.PrivateNote = notes.slice(0, 4000)
  }

  try {
    const created = (await qbFetch(cfg, '/invoice', {
      method: 'POST',
      body: JSON.stringify(payload),
    })) as { Invoice?: { Id?: string; DocNumber?: string } }
    const inv = created.Invoice
    if (!inv?.Id) throw new Error('QBO create invoice returned no Id')
    return {
      invoice_id: inv.Id,
      doc_number: inv.DocNumber ?? docNumber,
      customer_id: customerId,
      url: `${baseUrl(cfg)}/app/invoice?txnId=${inv.Id}`,
      allow_online_ach: allowAch,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Duplicate Document Number|Duplicate DocNumber/i.test(msg)) {
      // Do not invent a new DocNumber — desk typed PO must stay exact.
      throw new Error(
        `PO #${docNumber} already exists in QuickBooks. Enter a different PO # — we will not auto-+1 or suffix it.`,
      )
    }
    throw e
  }
}

/**
 * Stamp DocNumber (PO) + CustomerMemo (itinerary) + BillEmail before PDF/email.
 * Does not send — callers use Resend branded mail (or send_invoice as fallback).
 */
async function prepareInvoice(cfg: QbConfig, body: Record<string, unknown>) {
  const invoiceId = String(body.invoice_id ?? '').trim()
  if (!invoiceId) throw new Error('invoice_id required')

  const existing = (await qbFetch(cfg, `/invoice/${invoiceId}`)) as {
    Invoice?: {
      Id?: string
      SyncToken?: string
      DocNumber?: string
      CustomerMemo?: { value?: string }
    }
  }
  const inv = existing.Invoice
  if (!inv?.Id || inv.SyncToken == null) {
    throw new Error('Could not load invoice for prepare')
  }

  const poRaw = String(body.po_number ?? body.doc_number ?? '').trim()
  const docNumber = poRaw.replace(/^PO\s*#?\s*/i, '').trim()
  const memo = String(body.customer_memo ?? body.notes ?? '').trim()
  const sendTo = String(body.send_to ?? body.bill_email ?? '')
    .trim()
    .toLowerCase()

  const ccList = (
    Array.isArray(body.cc)
      ? body.cc
      : String(body.cc ?? '')
          .split(/[,;]/)
  )
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => e.includes('@') && e !== sendTo)

  const sparse: Record<string, unknown> = {
    Id: inv.Id,
    SyncToken: inv.SyncToken,
    sparse: true,
    AllowOnlineACHPayment: true,
    AllowOnlineCreditCardPayment: body.allow_online_card === true,
    // Never flip to EmailSent / auto-mail — branded Resend is the only send path.
    EmailStatus: 'NotSet',
  }
  if (docNumber && !/^(INSERT\s*INVOICE|ENTER\s*(PO|INVOICE|TAIL|FBO|ETA)|TBD|TODO|N\/?A)$/i.test(
    docNumber.replace(/^[(\[{]+|[)\]}]+$/g, '').trim(),
  )) {
    sparse.DocNumber = docNumber
  }
  if (memo) {
    sparse.CustomerMemo = { value: memo.slice(0, 1000) }
    sparse.PrivateNote = memo.slice(0, 4000)
  }
  // Do NOT stamp BillEmail here. Some QBO company settings auto-email the
  // blank company template (ENTER TAIL/FBO/ETA) when BillEmail is set — that
  // reaches BCC/info while the intended To never gets the branded Resend mail.
  if (body.stamp_bill_email === true && sendTo.includes('@')) {
    sparse.BillEmail = { Address: sendTo }
    if (ccList.length) {
      sparse.BillEmailCc = { Address: ccList.join(', ') }
    }
  }

  const updated = (await qbFetch(cfg, '/invoice', {
    method: 'POST',
    body: JSON.stringify(sparse),
  })) as { Invoice?: { Id?: string; DocNumber?: string; SyncToken?: string } }

  return {
    invoice_id: invoiceId,
    doc_number:
      updated.Invoice?.DocNumber ??
      (docNumber || inv.DocNumber || ''),
    prepared: true,
  }
}

/**
 * Native QBO payment-request email (PDF + ACH "View and pay").
 * Prefer Resend branded send from the app — this path is fallback only.
 * Always prepares DocNumber + CustomerMemo when provided.
 * POST /invoice/{id}/send?sendTo=
 */
async function sendInvoice(cfg: QbConfig, body: Record<string, unknown>) {
  const invoiceId = String(body.invoice_id ?? '').trim()
  if (!invoiceId) throw new Error('invoice_id required')
  const sendTo = String(body.send_to ?? body.bill_email ?? '')
    .trim()
    .toLowerCase()
  if (!sendTo.includes('@')) throw new Error('send_to email required')

  // Ensure PO + itinerary memo are on the invoice before Intuit emails.
  await prepareInvoice(cfg, body)

  const path = `/invoice/${invoiceId}/send?sendTo=${encodeURIComponent(sendTo)}`
  const sent = await qbFetch(cfg, path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: '',
  })
  const ccList = (
    Array.isArray(body.cc)
      ? body.cc
      : String(body.cc ?? '')
          .split(/[,;]/)
  )
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => e.includes('@') && e !== sendTo)
  return {
    invoice_id: invoiceId,
    sent_to: sendTo,
    cc: ccList,
    result: sent,
  }
}

async function getDashboardStats(cfg: QbConfig) {
  const q = encodeURIComponent(
    `select * from Invoice MAXRESULTS 1000`,
  )
  const data = (await qbFetch(cfg, `/query?query=${q}`)) as {
    QueryResponse?: { Invoice?: unknown }
  }
  const invoices = toArray(
    data.QueryResponse?.Invoice as {
      Id?: string
      DocNumber?: string
      TotalAmt?: number
      Balance?: number
      TxnDate?: string
      DueDate?: string
      CustomerRef?: { name?: string }
    },
  )
  let lifetime_revenue = 0
  let total_outstanding = 0
  let open_count = 0
  let overdue_count = 0
  let paid_count = 0
  const today = new Date().toISOString().slice(0, 10)
  for (const inv of invoices) {
    const total = Number(inv.TotalAmt ?? 0)
    const bal = Number(inv.Balance ?? 0)
    lifetime_revenue += total
    total_outstanding += bal
    if (bal <= 0.009) paid_count++
    else {
      open_count++
      if (inv.DueDate && inv.DueDate < today) overdue_count++
    }
  }
  const open = invoices
    .filter((i) => Number(i.Balance ?? 0) > 0.009)
    .sort((a, b) => String(b.TxnDate).localeCompare(String(a.TxnDate)))
    .slice(0, 5)
    .map((i) => ({
      id: i.Id ?? '',
      doc_number: i.DocNumber ?? '',
      customer: i.CustomerRef?.name ?? '',
      balance: Number(i.Balance ?? 0),
      txn_date: i.TxnDate ?? '',
      due_date: i.DueDate ?? '',
    }))

  let total_expenses: number | null = null
  let net_income: number | null = null
  try {
    const pnl = (await qbFetch(
      cfg,
      '/reports/ProfitAndLoss?date_macro=All',
    )) as {
      Rows?: {
        Row?: Array<{
          group?: string
          Summary?: { ColData?: Array<{ value?: string }> }
          Rows?: { Row?: Array<{ Summary?: { ColData?: Array<{ value?: string }> } }> }
        }>
      }
    }
    const rows = toArray(pnl.Rows?.Row)
    for (const r of rows) {
      if (r.group === 'Expenses' || r.group === 'CostOfGoodsSold') {
        const v = Number(r.Summary?.ColData?.[1]?.value ?? 0)
        total_expenses = (total_expenses ?? 0) + v
      }
      if (r.group === 'NetIncome') {
        net_income = Number(r.Summary?.ColData?.[1]?.value ?? 0)
      }
    }
  } catch {
    /* sandbox P&L often empty */
  }

  return {
    lifetime_revenue: round2(lifetime_revenue),
    total_outstanding: round2(total_outstanding),
    total_paid: round2(lifetime_revenue - total_outstanding),
    open_count,
    overdue_count,
    paid_count,
    total_expenses,
    net_income,
    recent_open_invoices: open,
  }
}

async function getLastPo(cfg: QbConfig, customerName: string) {
  const name = customerName.trim()
  if (!name) return { last_numeric: null }
  const q = encodeURIComponent(
    `select * from Invoice where CustomerRef = '${escapeQl(name)}' ORDERBY TxnDate DESC MAXRESULTS 10`,
  )
  // CustomerRef filter by name is unreliable — pull recent and filter
  const q2 = encodeURIComponent(
    `select * from Invoice ORDERBY TxnDate DESC MAXRESULTS 50`,
  )
  const data = (await qbFetch(cfg, `/query?query=${q2}`)) as {
    QueryResponse?: { Invoice?: unknown }
  }
  const invoices = toArray(
    data.QueryResponse?.Invoice as {
      DocNumber?: string
      CustomerRef?: { name?: string }
      CustomField?: Array<{ Name?: string; StringValue?: string }>
    },
  ).filter(
    (i) =>
      !name ||
      (i.CustomerRef?.name ?? '').toLowerCase() === name.toLowerCase(),
  )
  let max: number | null = null
  for (const inv of invoices) {
    const custom = toArray(inv.CustomField).find(
      (f) => (f.Name ?? '').toLowerCase() === 'po number',
    )?.StringValue
    const raw = custom || inv.DocNumber || ''
    const m = raw.match(/(\d+)/)
    if (m) {
      const n = Number(m[1])
      if (max == null || n > max) max = n
    }
  }
  void q
  return { last_numeric: max }
}

async function getInvoicePdf(cfg: QbConfig, invoiceId: string) {
  if (!invoiceId) throw new Error('invoice_id required')
  const url = `${baseUrl(cfg)}/v3/company/${cfg.realm_id}/invoice/${invoiceId}/pdf`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.access_token}`,
      Accept: 'application/pdf',
    },
  })
  if (!res.ok) {
    throw new Error(`QBO PDF HTTP ${res.status}`)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  // Chunked base64 to avoid stack overflow
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return { pdf_base64: btoa(binary) }
}

async function invoiceStatus(cfg: QbConfig, invoiceId: string) {
  const data = (await qbFetch(cfg, `/invoice/${invoiceId}`)) as {
    Invoice?: { Balance?: number; EmailStatus?: string }
  }
  const bal = Number(data.Invoice?.Balance ?? 0)
  if (bal <= 0.009) return { status: 'paid' }
  if (data.Invoice?.EmailStatus === 'EmailSent') return { status: 'viewed' }
  return { status: 'sent' }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
