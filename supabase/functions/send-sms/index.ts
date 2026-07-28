/**
 * Outbound SMS via RingCentral JWT auth.
 * Secrets (any alias works):
 *   RINGCENTRAL_CLIENT_ID | RC_CLIENT_ID
 *   RINGCENTRAL_CLIENT_SECRET | RC_CLIENT_SECRET
 *   RINGCENTRAL_JWT | RC_JWT
 *   RINGCENTRAL_SMS_FROM | RC_FROM_OFFERS
 * Optional:
 *   RINGCENTRAL_SERVER_URL (default https://platform.ringcentral.com)
 *
 * Deploy:
 *   npx tsx scripts/deploy-send-sms.ts
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Body = {
  to: string
  body: string
  from?: string
}

function envFirst(...names: string[]): string | undefined {
  for (const n of names) {
    const v = Deno.env.get(n)?.trim()
    if (v) return v
  }
  return undefined
}

/** Normalize to E.164 for US numbers; pass through if already +… */
function toE164(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '')
    return digits.length >= 10 ? `+${digits}` : null
  }
  const d = s.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  if (d.length >= 10 && d.length <= 15) return `+${d}`
  return null
}

let cachedToken: { access: string; expiresAt: number } | null = null

async function rcAccessToken(
  server: string,
  clientId: string,
  clientSecret: string,
  jwt: string,
): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.access
  }

  const basic = btoa(`${clientId}:${clientSecret}`)
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  })
  const res = await fetch(`${server}/restapi/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })
  const result = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
    message?: string
  }
  if (!res.ok || !result.access_token) {
    throw new Error(
      result.error_description ||
        result.message ||
        result.error ||
        `RingCentral token failed (${res.status})`,
    )
  }
  const ttlSec = typeof result.expires_in === 'number' ? result.expires_in : 3600
  cachedToken = {
    access: result.access_token,
    expiresAt: now + ttlSec * 1000,
  }
  return result.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'POST required' }, 405)
    }
    if (!req.headers.get('Authorization')) {
      return json({ error: 'Missing Authorization' }, 401)
    }

    // HARD KILL — no RingCentral SMS until this block is removed deliberately.
    console.warn('[send-sms] HARD KILL — all outbound SMS blocked')
    return json(
      {
        error: 'SMS hard-killed. RingCentral sends are disabled.',
        disabled: true,
      },
      503,
    )

    const clientId = envFirst('RINGCENTRAL_CLIENT_ID', 'RC_CLIENT_ID')
    const clientSecret = envFirst(
      'RINGCENTRAL_CLIENT_SECRET',
      'RC_CLIENT_SECRET',
    )
    const jwt = envFirst('RINGCENTRAL_JWT', 'RC_JWT')
    const defaultFrom = envFirst('RINGCENTRAL_SMS_FROM', 'RC_FROM_OFFERS')
    const server = (
      envFirst('RINGCENTRAL_SERVER_URL', 'RC_SERVER_URL') ??
      'https://platform.ringcentral.com'
    ).replace(/\/$/, '')

    if (!clientId || !clientSecret || !jwt || !defaultFrom) {
      return json(
        {
          error:
            'RingCentral not configured — set RINGCENTRAL_CLIENT_ID/SECRET/JWT and RINGCENTRAL_SMS_FROM',
        },
        500,
      )
    }

    const body = (await req.json()) as Body
    const text = String(body.body ?? '').trim()
    if (!text) return json({ error: 'body required' }, 400)
    if (text.length > 1000) {
      return json({ error: 'body exceeds 1000 characters' }, 400)
    }

    const to = toE164(String(body.to ?? ''))
    if (!to) return json({ error: 'Valid to phone required (E.164)' }, 400)

    const from = toE164(String(body.from ?? defaultFrom))
    if (!from) {
      return json({ error: 'Valid from phone required (RINGCENTRAL_SMS_FROM)' }, 500)
    }

    const token = await rcAccessToken(server, clientId, clientSecret, jwt)
    const res = await fetch(
      `${server}/restapi/v1.0/account/~/extension/~/sms`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: { phoneNumber: from },
          to: [{ phoneNumber: to }],
          text,
        }),
      },
    )

    const result = (await res.json().catch(() => ({}))) as {
      id?: number | string
      messageStatus?: string
      errorCode?: string
      message?: string
      errors?: { message?: string }[]
    }

    if (!res.ok) {
      console.error('[send-sms] RingCentral error', res.status, result)
      const detail =
        result.message ||
        result.errors?.[0]?.message ||
        result.errorCode ||
        result
      return json(
        { error: 'RingCentral SMS failed', detail, status: res.status },
        502,
      )
    }

    const id = result.id != null ? String(result.id) : `rc-${Date.now()}`
    return json({
      id,
      provider: 'ringcentral',
      status: result.messageStatus ?? 'Queued',
      to,
      from,
    })
  } catch (e) {
    console.error('[send-sms]', e)
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
