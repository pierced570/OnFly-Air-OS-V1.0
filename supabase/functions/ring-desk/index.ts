/**
 * Ring the OnFly desk line via RingCentral RingOut (no Twilio).
 *
 * RingOut is 2-legged: first the desk number rings (`from`), then after answer
 * RC connects to `to` (staff cell / IVR / auto-attendant).
 *
 * Secrets (aliases OK):
 *   RINGCENTRAL_CLIENT_ID | RC_CLIENT_ID
 *   RINGCENTRAL_CLIENT_SECRET | RC_CLIENT_SECRET
 *   RINGCENTRAL_JWT | RC_JWT
 *   RINGCENTRAL_DESK_RING_TO — number that rings first (default +18585297860)
 *   RINGCENTRAL_RINGOUT_CONNECT_TO — second leg (required if != desk)
 * Optional:
 *   RINGCENTRAL_SMS_FROM | RC_FROM_OFFERS — fallback connect-to if different from desk
 *   RINGCENTRAL_SERVER_URL
 *   RINGCENTRAL_RINGOUT_PLAY_PROMPT — true|false (default true)
 *   DESK_RING_DISABLED — true to soft-kill
 *
 * Deploy: npm run deploy:ring-desk
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Body = {
  /** Override desk ring number (E.164). */
  desk?: string
  /** Override second-leg connect number (E.164). */
  connectTo?: string
  /** Shown on second leg caller ID when allowed. */
  callerId?: string
  playPrompt?: boolean
  /** Logged only — never spoken (RingOut has no TTS). */
  reason?: string
}

function envFirst(...names: string[]): string | undefined {
  for (const n of names) {
    const v = Deno.env.get(n)?.trim()
    if (v) return v
  }
  return undefined
}

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

function envBool(name: string, fallback: boolean): boolean {
  const raw = (Deno.env.get(name) ?? '').trim().toLowerCase()
  if (!raw) return fallback
  if (raw === 'true' || raw === '1' || raw === 'yes') return true
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  return fallback
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

    const kill = (Deno.env.get('DESK_RING_DISABLED') ?? '').trim().toLowerCase()
    if (kill === 'true' || kill === '1' || kill === 'yes') {
      console.warn('[ring-desk] blocked — DESK_RING_DISABLED is on')
      return json(
        {
          error:
            'Desk ring disabled (DESK_RING_DISABLED). Set DESK_RING_DISABLED=false to resume.',
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
            'RingCentral not configured — set RINGCENTRAL_CLIENT_ID/SECRET/JWT',
        },
        500,
      )
    }

    const body = (await req.json().catch(() => ({}))) as Body
    const defaultDesk =
      envFirst('RINGCENTRAL_DESK_RING_TO', 'RC_DESK_RING_TO') ??
      '+18585297860'
    const smsFrom = envFirst('RINGCENTRAL_SMS_FROM', 'RC_FROM_OFFERS')
    const defaultConnect =
      envFirst('RINGCENTRAL_RINGOUT_CONNECT_TO', 'RC_RINGOUT_CONNECT_TO') ??
      smsFrom

    const desk = toE164(String(body.desk ?? defaultDesk))
    if (!desk) {
      return json(
        { error: 'Valid desk number required (RINGCENTRAL_DESK_RING_TO)' },
        500,
      )
    }

    const connectTo = toE164(String(body.connectTo ?? defaultConnect ?? ''))
    if (!connectTo) {
      return json(
        {
          error:
            'Valid RINGCENTRAL_RINGOUT_CONNECT_TO required — second leg after desk answers (staff cell or IVR). Cannot equal the desk number.',
        },
        500,
      )
    }
    if (connectTo === desk) {
      return json(
        {
          error:
            'RINGCENTRAL_RINGOUT_CONNECT_TO must differ from the desk ring number (RingOut rejects same from/to).',
        },
        500,
      )
    }

    const playPrompt =
      typeof body.playPrompt === 'boolean'
        ? body.playPrompt
        : envBool('RINGCENTRAL_RINGOUT_PLAY_PROMPT', true)

    const callerIdRaw = body.callerId
      ? toE164(String(body.callerId))
      : toE164(smsFrom ?? '') || undefined

    const token = await rcAccessToken(server, clientId, clientSecret, jwt)

    const payload: Record<string, unknown> = {
      from: { phoneNumber: desk },
      to: { phoneNumber: connectTo },
      playPrompt,
    }
    if (callerIdRaw) payload.callerId = { phoneNumber: callerIdRaw }

    console.info(
      '[ring-desk]',
      body.reason?.slice(0, 80) ?? 'portal',
      'desk',
      desk,
      '→',
      connectTo,
    )

    const res = await fetch(
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

    const result = (await res.json().catch(() => ({}))) as {
      id?: string | number
      status?: { callStatus?: string }
      errorCode?: string
      message?: string
      errors?: { message?: string }[]
    }

    if (!res.ok) {
      console.error('[ring-desk] RingCentral error', res.status, result)
      let detail =
        result.message ||
        result.errors?.[0]?.message ||
        result.errorCode ||
        result
      const detailText =
        typeof detail === 'string' ? detail : JSON.stringify(detail)
      if (/\[RingOut\] permission|RingOut/i.test(detailText) && /permission/i.test(detailText)) {
        detail =
          `${detailText} — In RingCentral Developer Console → App Permissions → enable RingOut, then re-issue JWT and update RINGCENTRAL_JWT.`
      }
      return json(
        { error: 'RingCentral RingOut failed', detail, status: res.status },
        502,
      )
    }

    const id = result.id != null ? String(result.id) : `rc-ring-${Date.now()}`
    return json({
      id,
      provider: 'ringcentral',
      status: result.status?.callStatus ?? 'InProgress',
      desk,
      connectTo,
      playPrompt,
    })
  } catch (e) {
    console.error('[ring-desk]', e)
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
