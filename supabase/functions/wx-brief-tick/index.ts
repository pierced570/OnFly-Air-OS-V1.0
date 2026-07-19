/**
 * Fire due T-3h / T-1h WX briefs → trip_events (+ optional hard-flag note).
 * Schedule every minute in Dashboard alongside checkpoint-tick.
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

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !service) {
    return json({ error: 'Supabase env missing' }, 500)
  }

  const sb = createClient(url, service)

  // Prefer SQL helper (writes trip_events)
  const { data: n, error } = await sb.rpc('fire_due_wx_briefs')
  if (error) {
    console.error('[wx-brief-tick]', error)
    return json({ error: error.message }, 500)
  }

  // Enrich with live METAR when icao present
  const { data: due } = await sb
    .from('wx_brief_schedule')
    .select('*')
    .eq('status', 'fired')
    .gte('fired_at', new Date(Date.now() - 120_000).toISOString())
    .limit(20)

  let enriched = 0
  for (const row of due ?? []) {
    if (!row.icao) continue
    try {
      const wxUrl = `${url}/functions/v1/wx-brief`
      const res = await fetch(wxUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${service}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ icaos: [String(row.icao).toUpperCase()] }),
      })
      if (!res.ok) continue
      const body = await res.json()
      const brief = Array.isArray(body?.briefs) ? body.briefs[0] : body?.[0]
      if (!brief) continue
      const hard =
        brief.flight_category === 'LIFR' || brief.flight_category === 'IFR'
          ? [`${brief.icao} ${brief.flight_category}`]
          : []
      const summary = `${brief.icao} ${brief.flight_category ?? ''} · ${String(brief.raw_metar ?? '').slice(0, 120)}`
      await sb
        .from('wx_brief_schedule')
        .update({ summary, hard_flags: hard })
        .eq('id', row.id)
      enriched++
    } catch (e) {
      console.warn('[wx-brief-tick] enrich failed', e)
    }
  }

  return json({ ok: true, fired: n ?? 0, enriched })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
