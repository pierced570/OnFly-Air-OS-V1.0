/**
 * Branded invoice payment-request email via Resend — QBO PDF attached.
 * Secrets: RESEND_API_KEY, EMAIL_FROM (prefer invoices@onflyair.com)
 * Optional: APP_PUBLIC_URL / INVOICE_LOGO_URL for header logo
 * Optional: CHARTER_CONTRACT_URL for Jotform sign link
 * BCC: info@onflyair.com
 *
 * Real QB mode uses native QBO /invoice/{id}/send (View and pay).
 * This function powers mock demos + Resend fallback with matching OFA UI.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_APP = 'https://ofaops.onflyair.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
    if (!req.headers.get('Authorization')) {
      return json({ error: 'Missing Authorization' }, 401)
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from =
      Deno.env.get('INVOICE_EMAIL_FROM')?.trim() ||
      Deno.env.get('EMAIL_FROM')?.trim() ||
      'OnFly Air <invoices@onflyair.com>'
    if (!apiKey) return json({ error: 'RESEND_API_KEY not configured' }, 500)

    const body = (await req.json()) as {
      to?: string | string[]
      cc?: string | string[]
      bcc?: string | string[]
      po_number?: string
      pdf_base64?: string
      client_name?: string
      logo_url?: string
      amount_usd?: number | null
      lane?: string | null
      flight_date?: string | null
      aircraft_type?: string | null
      tail?: string | null
      itinerary_lines?: string[] | null
      contract_url?: string | null
      pay_url?: string | null
    }
    const asList = (v?: string | string[]) =>
      (Array.isArray(v) ? v : [v])
        .map((t) => String(t ?? '').trim().toLowerCase())
        .filter((t) => t.includes('@'))
    const to = asList(body.to)
    const cc = asList(body.cc)
    const bcc = [...new Set([...asList(body.bcc), 'info@onflyair.com'])]
    const po = String(body.po_number ?? '').trim() || 'Invoice'
    const pdf = String(body.pdf_base64 ?? '').trim()
    if (!to.length) return json({ error: 'to required' }, 400)
    if (!pdf) return json({ error: 'pdf_base64 required' }, 400)

    const contractUrl =
      String(body.contract_url ?? '').trim() ||
      Deno.env.get('CHARTER_CONTRACT_URL')?.trim() ||
      ''

    const subject = 'Invoice payment request from OnFly Air LLC'
    const html = renderInvoiceHtml({
      po,
      client: body.client_name?.trim(),
      logoUrl: resolveLogoUrl(body.logo_url),
      amountUsd: body.amount_usd ?? null,
      lane: body.lane ?? null,
      flightDate: body.flight_date ?? null,
      aircraftType: body.aircraft_type ?? null,
      tail: body.tail ?? null,
      itineraryLines: Array.isArray(body.itinerary_lines)
        ? body.itinerary_lines.map(String)
        : [],
      contractUrl: contractUrl || null,
      payUrl: body.pay_url ?? null,
    })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        ...(cc.length ? { cc } : {}),
        bcc,
        subject,
        html,
        attachments: [
          {
            filename: `Invoice-${po}.pdf`,
            content: pdf,
          },
        ],
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      return json(
        {
          error: 'Resend failed',
          detail: (result as { message?: string }).message ?? res.status,
        },
        502,
      )
    }
    return json({ id: (result as { id?: string }).id ?? 'sent' })
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

function resolveLogoUrl(override?: string): string {
  const fromBody = String(override ?? '').trim()
  if (fromBody.startsWith('https://') || fromBody.startsWith('http://')) {
    return fromBody
  }
  const envLogo = Deno.env.get('INVOICE_LOGO_URL')?.trim()
  if (envLogo) return envLogo
  const app = (
    Deno.env.get('APP_PUBLIC_URL')?.trim() ||
    Deno.env.get('VITE_APP_URL')?.trim() ||
    DEFAULT_APP
  ).replace(/\/$/, '')
  const base = /\.vercel\.app$/i.test(app) ? DEFAULT_APP : app
  return `${base}/brand/onfly-logo.png`
}

function formatUsd(amount: number): string {
  const n = Math.round(amount * 100) / 100
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })
}

function renderInvoiceHtml(opts: {
  po: string
  client?: string
  logoUrl: string
  amountUsd?: number | null
  lane?: string | null
  flightDate?: string | null
  aircraftType?: string | null
  tail?: string | null
  itineraryLines?: string[]
  contractUrl?: string | null
  payUrl?: string | null
}): string {
  const poDisplay = escapeHtml(
    opts.po.replace(/^PO\s*#?\s*/i, '').trim() || opts.po,
  )
  const client = opts.client?.trim()
  const lane = opts.lane?.trim() || ''
  const headline = [client, lane].filter(Boolean).join(' · ')
  const logo = escapeAttr(opts.logoUrl)
  const amount =
    opts.amountUsd != null && Number.isFinite(opts.amountUsd)
      ? formatUsd(opts.amountUsd)
      : null
  const payUrl = opts.payUrl?.trim()
  const contractUrl = opts.contractUrl?.trim()
  const tail = opts.tail?.trim().toUpperCase() || null
  const aircraft = opts.aircraftType?.trim() || null
  const flightDate = opts.flightDate?.trim() || null
  const itinerary = (opts.itineraryLines ?? []).map((l) => l.trim()).filter(Boolean)

  const achButton = payUrl
    ? `<a href="${escapeAttr(payUrl)}" style="display:inline-block;padding:8px 14px;border:1px solid #cfcfcf;border-radius:6px;background:#ffffff;color:#0c0c0e;text-decoration:none;font-size:13px;font-weight:600">ACH</a>`
    : `<span style="display:inline-block;padding:8px 14px;border:1px solid #cfcfcf;border-radius:6px;background:#ffffff;color:#0c0c0e;font-size:13px;font-weight:600">ACH</span>`

  const itineraryHtml = itinerary.length
    ? itinerary
        .map(
          (line) =>
            `<div style="margin:0 0 4px;color:#0c0c0e;font-size:14px;line-height:1.45">${escapeHtml(line)}</div>`,
        )
        .join('')
    : lane
      ? `<div style="margin:0 0 4px;color:#0c0c0e;font-size:14px;line-height:1.45">${escapeHtml(lane)}</div>`
      : ''

  const summaryRows: Array<[string, string]> = []
  if (flightDate) summaryRows.push(['Date', flightDate])
  if (lane) summaryRows.push(['Route', lane])
  if (aircraft || tail) {
    summaryRows.push([
      'Aircraft',
      [aircraft, tail ? `(${tail})` : null].filter(Boolean).join(' '),
    ])
  }
  if (poDisplay) summaryRows.push(['PO #', poDisplay])

  const summaryHtml = summaryRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse">
        ${summaryRows
          .map(
            ([label, value], i) => `
          <tr>
            <td style="padding:10px 0;border-top:1px solid ${i === 0 ? '#e5e5e5' : '#ececec'};color:#6b6560;font-size:14px;width:40%">${escapeHtml(label)}</td>
            <td style="padding:10px 0;border-top:1px solid ${i === 0 ? '#e5e5e5' : '#ececec'};color:#0c0c0e;font-size:14px;text-align:right;font-weight:600">${escapeHtml(value)}</td>
          </tr>`,
          )
          .join('')}
        <tr><td colspan="2" style="border-top:1px solid #e5e5e5;padding:0;height:1px;font-size:0;line-height:0">&nbsp;</td></tr>
      </table>`
    : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;font-family:system-ui,sans-serif;color:#0c0c0e;background:#f4f4f5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:0">
    <tr>
      <td style="background:#0c0c0e;padding:28px 24px;text-align:center">
        <img src="${logo}" alt="OnFly Air" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0" />
      </td>
    </tr>
    <tr><td align="center" style="padding:28px 16px 8px">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
        <tr>
          <td style="padding:8px 28px 28px;background:#ffffff">
            <h1 style="font-size:22px;margin:0 0 10px;color:#2a2a2e;font-weight:700;line-height:1.3">Invoice payment request from OnFly Air LLC</h1>
            ${headline ? `<p style="margin:0 0 4px;font-size:14px;color:#6b6560;line-height:1.5">${escapeHtml(headline)}</p>` : ''}
            <p style="margin:0 0 16px;font-size:14px;color:#6b6560;line-height:1.5">PO #${poDisplay}</p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.5">
              <a href="${payUrl ? escapeAttr(payUrl) : '#'}" style="color:#1a56db;font-weight:700;text-decoration:underline">Open the attached PDF invoice to access your payment options.</a>
            </p>
            ${amount ? `<div style="font-size:34px;font-weight:700;color:#0c0c0e;margin:0 0 18px;line-height:1.1">${escapeHtml(amount)}</div>` : ''}
            <div style="margin:0 0 8px;font-size:13px;color:#6b6560">Online payment options:</div>
            <div style="margin:0 0 24px">${achButton}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f4;border-radius:10px;margin:0 0 22px">
              <tr><td style="padding:18px 18px 16px">
                ${tail ? `<div style="font-size:12px;color:#6b6560;margin:0 0 4px">Tail Number</div><div style="font-size:22px;font-weight:700;color:#0c0c0e;margin:0 0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${escapeHtml(tail)}</div>` : ''}
                <div style="font-size:12px;color:#6b6560;margin:0 0 8px">Trip Itinerary</div>
                ${itineraryHtml}
              </td></tr>
            </table>
            ${
              contractUrl
                ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0c0c0e">Please sign charter contract linked below:</p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.5;word-break:break-all">
              <a href="${escapeAttr(contractUrl)}" style="color:#1a56db;text-decoration:underline">${escapeHtml(contractUrl)}</a>
            </p>`
                : ''
            }
            ${summaryHtml}
          </td>
        </tr>
      </table>
    </td></tr>
    <tr>
      <td align="center" style="padding:20px 16px 32px;background:#ececee">
        <p style="margin:0 0 6px;font-size:13px;color:#6b6560">OnFly Air LLC — Charter Brokerage</p>
        <p style="margin:0;font-size:13px;color:#6b6560">
          For questions, reply to this email or contact
          <a href="mailto:info@onflyair.com" style="color:#1a56db;text-decoration:underline">info@onflyair.com</a>
        </p>
      </td>
    </tr>
  </table>
</body></html>`
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
