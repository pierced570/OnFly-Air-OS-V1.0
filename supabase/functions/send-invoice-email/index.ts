/**
 * Branded invoice email via Resend — PDF attachment from QBO.
 * Secrets: RESEND_API_KEY, EMAIL_FROM (prefer invoices@onflyair.com)
 * BCC: info@onflyair.com
 *
 * Never use QBO's /invoice/{id}/send — this is the only delivery path.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from =
      Deno.env.get('INVOICE_EMAIL_FROM')?.trim() ||
      Deno.env.get('EMAIL_FROM')?.trim() ||
      'OnFly Air <invoices@onflyair.com>'
    if (!apiKey) return json({ error: 'RESEND_API_KEY not configured' }, 500)

    const body = (await req.json()) as {
      to?: string | string[]
      po_number?: string
      pdf_base64?: string
      client_name?: string
    }
    const to = (Array.isArray(body.to) ? body.to : [body.to])
      .map((t) => String(t ?? '').trim().toLowerCase())
      .filter((t) => t.includes('@'))
    const po = String(body.po_number ?? '').trim() || 'Invoice'
    const pdf = String(body.pdf_base64 ?? '').trim()
    if (!to.length) return json({ error: 'to required' }, 400)
    if (!pdf) return json({ error: 'pdf_base64 required' }, 400)

    const client = body.client_name?.trim()
    const subject = `Invoice #${po} - OnFly Air`
    const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;color:#0c0c0e;background:#f7f2e3;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5dfd0;border-radius:8px;overflow:hidden">
    <div style="background:#0c0c0e;padding:20px;text-align:center">
      <img src="https://onflyair.com/wp-content/uploads/2024/02/onflyair-ff-01.png" alt="OnFly Air" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0" />
    </div>
    <div style="padding:24px">
      <h1 style="font-size:20px;margin:0 0 12px">Invoice #${escapeHtml(po)}</h1>
      <p style="margin:0 0 12px;line-height:1.5;color:#2a2a2e">
        ${client ? `Hi ${escapeHtml(client)},` : 'Hello,'}
        please find your OnFly Air invoice attached as a PDF.
      </p>
      <p style="margin:0;font-size:14px;color:#6b6560">
        Questions? Reply to this email or contact accounts at info@onflyair.com.
      </p>
    </div>
  </div>
</body></html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        bcc: ['info@onflyair.com'],
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
