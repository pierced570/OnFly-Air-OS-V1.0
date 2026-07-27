/**
 * Outbound email via Resend.
 * Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "OnFly Air <ops@onflyair.com>")
 *
 * Deploy:
 *   npx tsx scripts/deploy-send-email.ts
 *   # or:
 *   npx supabase functions deploy send-email --project-ref udowzmoswudrqtjebehr
 *   npx supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="OnFly Air <ops@onflyair.com>" --project-ref udowzmoswudrqtjebehr
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Body = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  reply_to?: string
  cc?: string | string[]
  bcc?: string | string[]
}

function normalizeEmails(raw: string | string[] | undefined): string[] {
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw])
    .map((t) => String(t ?? '').trim().toLowerCase())
    .filter((t) => t.includes('@'))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'POST required' }, 405)
    }

    // Gateway verify_jwt requires a valid Supabase JWT (anon or user).
    if (!req.headers.get('Authorization')) {
      return json({ error: 'Missing Authorization' }, 401)
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from =
      Deno.env.get('EMAIL_FROM') ?? 'OnFly Air <onboarding@resend.dev>'
    if (!apiKey) {
      return json({ error: 'RESEND_API_KEY not configured' }, 500)
    }

    const body = (await req.json()) as Body
    const to = normalizeEmails(body.to)
    if (!to.length || !body.subject?.trim()) {
      return json({ error: 'to and subject required' }, 400)
    }
    if (!body.html && !body.text) {
      return json({ error: 'html or text required' }, 400)
    }
    const toSet = new Set(to)
    const cc = normalizeEmails(body.cc).filter((e) => !toSet.has(e))
    const bcc = normalizeEmails(body.bcc).filter(
      (e) => !toSet.has(e) && !cc.includes(e),
    )

    const payload: Record<string, unknown> = {
      from,
      to,
      subject: body.subject.trim(),
    }
    if (body.html) payload.html = body.html
    if (body.text) payload.text = body.text
    if (body.reply_to) payload.reply_to = body.reply_to
    if (cc.length) payload.cc = cc
    if (bcc.length) payload.bcc = bcc

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[send-email] Resend error', res.status, result)
      return json(
        {
          error: 'Resend failed',
          detail: (result as { message?: string })?.message ?? result,
          status: res.status,
        },
        502,
      )
    }

    return json({
      id: (result as { id?: string }).id as string,
      provider: 'resend',
    })
  } catch (e) {
    console.error('[send-email]', e)
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
