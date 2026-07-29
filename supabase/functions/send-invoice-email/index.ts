/**
 * Branded invoice email via Resend — PDF attachment from QBO.
 * Secrets: RESEND_API_KEY, EMAIL_FROM (prefer invoices@onflyair.com)
 * Optional: APP_PUBLIC_URL / INVOICE_LOGO_URL for header logo
 * BCC: info@onflyair.com
 *
 * Never use QBO's /invoice/{id}/send — create in QB, deliver with this template.
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

    const client = body.client_name?.trim()
    const logoUrl = resolveLogoUrl(body.logo_url)
    const subject = `Invoice #${po} - OnFly Air`
    const html = renderInvoiceHtml({ po, client, logoUrl })

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
  // Prefer production app brand asset — never a gated *.vercel.app URL.
  const base = /\.vercel\.app$/i.test(app) ? DEFAULT_APP : app
  return `${base}/brand/onfly-logo.png`
}

function renderInvoiceHtml(opts: {
  po: string
  client?: string
  logoUrl: string
}): string {
  const po = escapeHtml(opts.po)
  const greet = opts.client
    ? `Hi ${escapeHtml(opts.client)},`
    : 'Hello,'
  const logo = escapeAttr(opts.logoUrl)
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;font-family:system-ui,sans-serif;color:#0c0c0e;background:#f7f2e3">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e3;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5dfd0;border-radius:8px;overflow:hidden">
        <tr>
          <td style="background:#0c0c0e;padding:22px 24px;text-align:center">
            <img src="${logo}" alt="OnFly Air" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0" />
            <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:0.18em;color:#c9a227;font-weight:700;margin-top:10px">ONFLY AIR</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;background:#ffffff">
            <h1 style="font-size:20px;margin:0 0 12px;color:#0c0c0e">Invoice #${po}</h1>
            <p style="margin:0 0 12px;line-height:1.5;color:#2a2a2e">
              ${greet}
              please find your OnFly Air invoice attached as a PDF.
            </p>
            <p style="margin:0;font-size:14px;color:#6b6560">
              Questions? Reply to this email or contact accounts at
              <a href="mailto:info@onflyair.com" style="color:#1a56db">info@onflyair.com</a>.
            </p>
          </td>
        </tr>
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
