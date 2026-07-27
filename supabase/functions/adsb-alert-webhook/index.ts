/**
 * FlightAware AeroAPI alert webhook — updates last-known when a tracked tail moves.
 * Set ADSB_ALERT_WEBHOOK_URL to this function's public URL, then enable alerts from Radar.
 *
 * Deploy: npx supabase functions deploy adsb-alert-webhook --project-ref <ref>
 * (verify_jwt = false so FlightAware can POST without a user JWT)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

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
    if (req.method !== 'POST') {
      return json({ error: 'POST required' }, 405)
    }

    const payload = await req.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return json({ error: 'invalid json' }, 400)
    }

    const p = payload as Record<string, unknown>
    const flight = (p.flight ?? p) as Record<string, unknown>
    const tail = String(
      flight.registration ?? flight.ident ?? p.ident ?? '',
    )
      .trim()
      .toUpperCase()
    if (!tail) return json({ ok: true, skipped: 'no tail' })

    const lp = (flight.last_position ?? p.last_position) as
      | Record<string, unknown>
      | undefined
    const lat = num(lp?.latitude ?? flight.latitude ?? p.latitude)
    const lon = num(lp?.longitude ?? flight.longitude ?? p.longitude)
    const alt = num(lp?.altitude ?? flight.altitude) ?? 0
    const gs = num(lp?.groundspeed ?? flight.groundspeed) ?? 0
    const event = String(p.event_code ?? p.event ?? flight.status ?? '')
      .toLowerCase()
    const now = new Date().toISOString()
    const phase =
      event.includes('off') ||
      event.includes('depart') ||
      event.includes('enroute') ||
      gs > 50
        ? 'airborne'
        : event.includes('on') || event.includes('arriv')
          ? 'on_ground'
          : gs > 50
            ? 'airborne'
            : 'on_ground'

    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) {
      console.warn('[adsb-alert-webhook] missing service role')
      return json({ ok: true, logged: true, tail, persisted: false })
    }

    const sb = createClient(url, key)
    const patch: Record<string, unknown> = {
      tail,
      updated_at: now,
      ladd_blocked: lat == null || lon == null,
      phase,
    }
    if (lat != null && lon != null) {
      patch.last_lat = lat
      patch.last_lon = lon
      patch.last_alt = alt
      patch.last_gs = gs
      patch.last_seen_at = now
    }
    if (event.includes('off') || event.includes('depart')) {
      patch.last_takeoff_at = now
    }
    if (event.includes('on') || event.includes('arriv')) {
      patch.last_landing_at = now
    }

    const { error } = await sb.from('radar_tracked_tails').upsert(patch, {
      onConflict: 'tail',
    })
    if (error) {
      console.error('[adsb-alert-webhook]', error.message)
      return json({ ok: false, error: error.message }, 500)
    }
    return json({ ok: true, tail, phase })
  } catch (e) {
    console.error('[adsb-alert-webhook]', e)
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
