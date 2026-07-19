/**
 * QuickBooks OAuth 2.0 — connect + callback + disconnect.
 * Secrets: QB_CLIENT_ID, QB_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY
 * Optional: QB_REDIRECT_URI, QB_ENVIRONMENT (sandbox|production)
 *
 * Deploy with verify_jwt = false for Intuit callback GET.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const COMPANY_ID = 'onfly'
const INTEGRATION = 'quickbooks'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  // Intuit redirect: GET .../quickbooks-auth/callback?code=&realmId=&state=
  if (url.pathname.endsWith('/callback') || url.searchParams.has('code')) {
    return handleCallback(req, url)
  }

  try {
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
    const body = (await req.json()) as {
      action?: string
      redirect_to?: string
      company_id?: string
    }
    const action = body.action ?? 'connect'
    if (action === 'connect') return handleConnect(body.redirect_to)
    if (action === 'disconnect') return handleDisconnect(body.company_id)
    return json({ error: `Unknown action ${action}` }, 400)
  } catch (e) {
    console.error('[quickbooks-auth]', e)
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

function clientId() {
  const id = Deno.env.get('QB_CLIENT_ID')?.trim()
  if (!id) throw new Error('QB_CLIENT_ID not configured')
  return id
}

function clientSecret() {
  const s = Deno.env.get('QB_CLIENT_SECRET')?.trim()
  if (!s) throw new Error('QB_CLIENT_SECRET not configured')
  return s
}

function redirectUri() {
  return (
    Deno.env.get('QB_REDIRECT_URI')?.trim() ||
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/quickbooks-auth/callback`
  )
}

function environment(): 'sandbox' | 'production' {
  const e = (Deno.env.get('QB_ENVIRONMENT') ?? 'sandbox').toLowerCase()
  return e === 'production' ? 'production' : 'sandbox'
}

function admin() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase service role not configured')
  return createClient(url, key)
}

async function handleConnect(redirectTo?: string) {
  try {
    const state = btoa(
      JSON.stringify({
        redirect_to: redirectTo || '/',
        company_id: COMPANY_ID,
        env: environment(),
      }),
    )
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      state,
    })
    const url = `https://appcenter.intuit.com/connect/oauth2?${params}`
    return json({ url })
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
}

async function handleCallback(req: Request, url: URL) {
  const code = url.searchParams.get('code')
  const realmId = url.searchParams.get('realmId')
  const stateRaw = url.searchParams.get('state')
  let redirectTo = '/'
  let env = environment()
  try {
    if (stateRaw) {
      const st = JSON.parse(atob(stateRaw)) as {
        redirect_to?: string
        env?: string
      }
      if (st.redirect_to) redirectTo = st.redirect_to
      if (st.env === 'production' || st.env === 'sandbox') env = st.env
    }
  } catch {
    /* ignore */
  }

  if (!code || !realmId) {
    return htmlRedirect(redirectTo, 'qb=missing_code')
  }

  try {
    const basic = btoa(`${clientId()}:${clientSecret()}`)
    const tokenRes = await fetch(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri(),
        }),
      },
    )
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error('[qb-auth] token exchange', tokens)
      return htmlRedirect(redirectTo, 'qb=token_failed')
    }

    const expiresAt = new Date(
      Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
    ).toISOString()

    const sb = admin()
    const config = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      realm_id: realmId,
      environment: env,
    }
    const { error } = await sb.from('integration_configs').upsert(
      {
        company_id: COMPANY_ID,
        integration_type: INTEGRATION,
        is_connected: true,
        config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,integration_type' },
    )
    if (error) {
      console.error('[qb-auth] persist', error)
      return htmlRedirect(redirectTo, 'qb=persist_failed')
    }
    return htmlRedirect(redirectTo, 'qb=connected')
  } catch (e) {
    console.error('[qb-auth] callback', e)
    return htmlRedirect(redirectTo, 'qb=error')
  }
}

async function handleDisconnect(companyId?: string) {
  const sb = admin()
  const { error } = await sb
    .from('integration_configs')
    .upsert(
      {
        company_id: companyId || COMPANY_ID,
        integration_type: INTEGRATION,
        is_connected: false,
        config: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,integration_type' },
    )
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

function htmlRedirect(to: string, query: string) {
  const sep = to.includes('?') ? '&' : '?'
  const loc = `${to}${sep}${query}`
  return new Response(null, {
    status: 302,
    headers: { Location: loc, ...corsHeaders },
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
