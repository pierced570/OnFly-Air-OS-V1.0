/**
 * Branded invoice payment-request email via Resend — QBO PDF attached.
 * Prefer pre-rendered `html` + `subject` from the app (ETA-sheet chrome).
 * Secrets: RESEND_API_KEY, EMAIL_FROM (prefer invoices@onflyair.com)
 * BCC: info@onflyair.com
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
      subject?: string | null
      html?: string | null
      text?: string | null
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
      portal_url?: string | null
    }
    const asList = (v?: string | string[]) =>
      (Array.isArray(v) ? v : [v])
        .map((t) => String(t ?? '').trim().toLowerCase())
        .filter((t) => t.includes('@'))
    const to = asList(body.to)
    const cc = asList(body.cc)
    const bcc = [...new Set([...asList(body.bcc), 'info@onflyair.com'])]
    const poRaw = String(body.po_number ?? '').trim()
    const poDisplay =
      poRaw
        .replace(/^PO\s*#?\s*/i, '')
        .trim()
        .replace(/^[(\[{]+|[)\]}]+$/g, '')
        .trim() ||
      poRaw ||
      'Invoice'
    if (
      !poRaw ||
      /^(INSERT\s*INVOICE|ENTER\s*(PO|INVOICE|TAIL|FBO|ETA)|TBD|TODO|N\/?A)$/i.test(
        poDisplay,
      )
    ) {
      return json(
        { error: 'po_number required — refuse placeholder PO in subject' },
        400,
      )
    }
    const pdf = String(body.pdf_base64 ?? '').trim()
    if (!to.length) return json({ error: 'to required' }, 400)
    if (!pdf) return json({ error: 'pdf_base64 required' }, 400)

    const preHtml = String(body.html ?? '').trim()
    const preSubject = String(body.subject ?? '').trim()
    const preText = String(body.text ?? '').trim()

    const contractUrl =
      String(body.contract_url ?? '').trim() ||
      Deno.env.get('CHARTER_CONTRACT_URL')?.trim() ||
      ''
    const portalUrl = String(body.portal_url ?? '').trim()
    const lane = String(body.lane ?? '').trim()
    const tail = String(body.tail ?? '').trim().toUpperCase()

    const subject =
      preSubject ||
      [
        'OnFly invoice',
        `PO #${poDisplay}`,
        lane || null,
        tail || null,
      ]
        .filter(Boolean)
        .join(' · ')

    const html =
      preHtml ||
      renderInvoiceHtmlFallback({
        po: poDisplay,
        client: body.client_name?.trim(),
        logoUrl: resolveLogoUrl(body.logo_url),
        amountUsd: body.amount_usd ?? null,
        lane: lane || null,
        flightDate: body.flight_date ?? null,
        aircraftType: body.aircraft_type ?? null,
        tail: tail || null,
        itineraryLines: Array.isArray(body.itinerary_lines)
          ? body.itinerary_lines.map(String)
          : [],
        contractUrl: contractUrl || null,
        payUrl: body.pay_url ?? null,
        portalUrl: portalUrl || null,
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
        ...(preText ? { text: preText } : {}),
        attachments: [
          {
            filename: `Invoice-${poDisplay}.pdf`,
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

/** Minimal fallback when the app did not pre-render ETA-sheet HTML. */
function renderInvoiceHtmlFallback(opts: {
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
  portalUrl?: string | null
}): string {
  const poDisplay = escapeHtml(opts.po)
  const client = opts.client?.trim()
  const lane = opts.lane?.trim() || ''
  const headline = [client, lane].filter(Boolean).join(' · ')
  const logo = escapeAttr(opts.logoUrl)
  const amount =
    opts.amountUsd != null && Number.isFinite(opts.amountUsd)
      ? formatUsd(opts.amountUsd)
      : null
  const payUrl = opts.payUrl?.trim()
  const portalUrl = opts.portalUrl?.trim()
  const contractUrl = opts.contractUrl?.trim()
  const tail = opts.tail?.trim().toUpperCase() || null
  const aircraft = opts.aircraftType?.trim() || null
  const itinerary = (opts.itineraryLines ?? []).map((l) => l.trim()).filter(Boolean)

  const payBtn = payUrl
    ? `<a href="${escapeAttr(payUrl)}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px">View and pay →</a>`
    : `<span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px">Open attached PDF to pay</span>`

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;font-family:system-ui,sans-serif;color:#0c0c0e;background:#f4f1ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea">
    <tr><td style="background:#0c0c0e;padding:22px 24px">
      <img src="${logo}" alt="OnFly Air" width="160" style="display:block;max-width:160px;height:auto;border:0" />
      <div style="margin-top:22px;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#c9a227">INVOICE</div>
      <div style="margin-top:8px;font-size:26px;font-weight:700;color:#ffffff">PO #${poDisplay}${lane ? ` · ${escapeHtml(lane)}` : ''}</div>
      ${headline ? `<div style="margin-top:8px;font-size:13px;color:#b8b2a6">${escapeHtml(headline)}</div>` : ''}
    </td></tr>
    <tr><td align="center" style="padding:0 12px">
      <table role="presentation" width="100%" style="max-width:640px;background:#ffffff">
        <tr><td style="padding:22px">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;color:#c9a227">BALANCE DUE</div>
          ${amount ? `<div style="margin-top:8px;font-size:34px;font-weight:700">${escapeHtml(amount)}</div>` : ''}
          <div style="margin-top:16px">${payBtn}</div>
          ${tail || aircraft ? `<div style="margin-top:22px"><div style="font-size:10px;letter-spacing:0.16em;color:#c9a227">AIRCRAFT / TAIL</div><div style="margin-top:6px;font-size:18px;font-weight:700">${escapeHtml([aircraft, tail].filter(Boolean).join(' · '))}</div></div>` : ''}
          ${itinerary.length ? `<div style="margin-top:18px">${itinerary.map((l) => `<div style="font-size:14px;margin:0 0 4px">${escapeHtml(l)}</div>`).join('')}</div>` : ''}
          ${contractUrl ? `<p style="margin-top:18px"><a href="${escapeAttr(contractUrl)}">${escapeHtml(contractUrl)}</a></p>` : ''}
          ${portalUrl ? `<p style="margin-top:18px"><a href="${escapeAttr(portalUrl)}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:8px">Open live tracking portal →</a></p>` : ''}
        </td></tr>
      </table>
    </td></tr>
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
