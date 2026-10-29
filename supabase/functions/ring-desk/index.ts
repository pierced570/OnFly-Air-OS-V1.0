/**
 * Ring the OnFly desk line (858) via RingCentral RingOut — alert only.
 *
 * Product goal: hard quote → **+18585297860 rings**. Nothing else matters.
 *
 * RingCentral’s RingOut API still requires a second `to` number (must differ
 * from 858). That leg is API ballast — set RINGCENTRAL_RINGOUT_CONNECT_TO to
 * any other company DID / auto-attendant / voicemail. It is not a staff-cell
 * feature and is never shown to clients.
 *
 * Secrets (aliases OK):
 *   RINGCENTRAL_CLIENT_ID | RC_CLIENT_ID
 *   RINGCENTRAL_CLIENT_SECRET | RC_CLIENT_SECRET
 *   RINGCENTRAL_JWT | RC_JWT
 *   RINGCENTRAL_DESK_RING_TO — defaults to +18585297860 (the number that rings)
 *   RINGCENTRAL_RINGOUT_CONNECT_TO — any non-858 number RC accepts
 * Optional:
 *   RINGCENTRAL_SMS_FROM | RC_FROM_OFFERS — caller ID / fallback connect-to
 *   RINGCENTRAL_SERVER_URL
 *   RINGCENTRAL_RINGOUT_PLAY_PROMPT — true|false (default true)
 *   DESK_RING_DISABLED — true to soft-kill
 *
 * Deploy: npm run deploy:ring-desk
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Body = {
  /** Logged only — never spoken (RingOut has no TTS). */
  reason?: string
}

function envFirst(...names: string[]): string | undefined {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim()
    if (value) return value
  }
  return undefined
}

function toE164(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  if (value.startsWith('+')) {
    const digits = value.slice(1).replace(/\D/g, '')
    return digits.length >= 10 ? `+${digits}` : null
  }

  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`
  }
  return null
}

function envBool(name: string, fallback: boolean): boolean {
  const value = (Deno.env.get(name) ?? '').trim().toLowerCase()
  if (!value) return fallback
  if (['true', '1', 'yes'].includes(value)) return true
  if (['false', '0', 'no'].includes(value)) return false
  return fallback
}

let cachedToken: {
  access: string
  expiresAt: number
} | null = null

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

  const response = await fetch(`${server}/restapi/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  })

  const result = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
    message?: string
  }

  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description ||
        result.message ||
        result.error ||
        `RingCentral authentication failed (${response.status})`,
    )
  }

  cachedToken = {
    access: result.access_token,
    expiresAt: now + (result.expires_in ?? 3600) * 1000,
  }

  return result.access_token
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'POST required' }, 405)
  }

  if (!request.headers.get('Authorization')) {
    return json({ error: 'Missing Authorization' }, 401)
  }

  try {
    if (envBool('DESK_RING_DISABLED', false)) {
      console.warn('[ring-desk] blocked — DESK_RING_DISABLED is on')
      return json(
        {
          error: 'Desk ring disabled by DESK_RING_DISABLED.',
          disabled: true,
        },
        503,
      )
    }

    const clientId = envFirst('RINGCENTRAL_CLIENT_ID', 'RC_CLIENT_ID')
    const clientSecret = envFirst(
      'RINGCENTRAL_CLIENT_SECRET',
      'RC_CLIENT_SECRET',
    )
    const jwt = envFirst('RINGCENTRAL_JWT', 'RC_JWT')

    const server = (
      envFirst('RINGCENTRAL_SERVER_URL', 'RC_SERVER_URL') ??
      'https://platform.ringcentral.com'
    ).replace(/\/$/, '')

    if (!clientId || !clientSecret || !jwt) {
      return json(
        {
          error:
            'Missing RingCentral client ID, client secret, or JWT. Secret names must be exact (RINGCENTRAL_CLIENT_ID / RINGCENTRAL_CLIENT_SECRET / RINGCENTRAL_JWT) — spaces in the name will not load.',
        },
        500,
      )
    }

    const body = (await request.json().catch(() => ({}))) as Body

    // 858 is the only number we care about ringing. Secrets only — ignore body.
    const desk = toE164(
      envFirst('RINGCENTRAL_DESK_RING_TO', 'RC_DESK_RING_TO') ??
        '+18585297860',
    )

    const smsFrom = envFirst('RINGCENTRAL_SMS_FROM', 'RC_FROM_OFFERS')

    // RingCentral requires a different `to` — not a product feature.
    const connectTo = toE164(
      envFirst(
        'RINGCENTRAL_RINGOUT_CONNECT_TO',
        'RC_RINGOUT_CONNECT_TO',
      ) ??
        (smsFrom && toE164(smsFrom) !== desk ? smsFrom : '') ??
        '',
    )

    if (!desk) {
      return json(
        { error: 'RINGCENTRAL_DESK_RING_TO must be a valid E.164 number.' },
        500,
      )
    }

    if (!connectTo) {
      return json(
        {
          error:
            'RingCentral RingOut needs a second number different from 858. Set RINGCENTRAL_RINGOUT_CONNECT_TO to any other company DID, auto-attendant, or voicemail (API requirement only — the alert is 858 ringing).',
        },
        500,
      )
    }

    if (desk === connectTo) {
      return json(
        {
          error:
            'RINGCENTRAL_RINGOUT_CONNECT_TO must differ from +18585297860 (RingCentral rejects same from/to). Use any other company number.',
        },
        500,
      )
    }

    const playPrompt = envBool('RINGCENTRAL_RINGOUT_PLAY_PROMPT', true)
    const callerId = toE164(smsFrom ?? '')
    const token = await rcAccessToken(server, clientId, clientSecret, jwt)

    const payload: Record<string, unknown> = {
      from: { phoneNumber: desk },
      to: { phoneNumber: connectTo },
      playPrompt,
    }

    if (callerId) {
      payload.callerId = { phoneNumber: callerId }
    }

    console.info(
      '[ring-desk]',
      typeof body.reason === 'string' ? body.reason.slice(0, 80) : 'portal',
      desk,
      '→',
      connectTo,
    )

    const response = await fetch(
      `${server}/restapi/v1.0/account/~/extension/~/ring-out`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    )

    const result = (await response.json().catch(() => ({}))) as {
      id?: string | number
      status?: { callStatus?: string }
      errorCode?: string
      message?: string
      errors?: { message?: string }[]
    }

    if (!response.ok) {
      console.error('[ring-desk] RingCentral error', response.status, result)
      let detail =
        result.message ||
        result.errors?.[0]?.message ||
        result.errorCode ||
        'Unknown RingCentral error'
      const detailText =
        typeof detail === 'string' ? detail : JSON.stringify(detail)
      if (
        /\[RingOut\] permission|RingOut/i.test(detailText) &&
        /permission/i.test(detailText)
      ) {
        detail = `${detailText} — Developer Console → App Permissions → enable RingOut, then re-issue JWT and update RINGCENTRAL_JWT.`
      }
      return json(
        {
          error: 'RingCentral RingOut failed',
          detail,
          status: response.status,
        },
        502,
      )
    }

    return json({
      id: result.id != null ? String(result.id) : `rc-ring-${Date.now()}`,
      provider: 'ringcentral',
      status: result.status?.callStatus ?? 'InProgress',
      desk,
      connectTo,
      playPrompt,
    })
  } catch (error) {
    console.error('[ring-desk]', error)
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    )
  }
})
