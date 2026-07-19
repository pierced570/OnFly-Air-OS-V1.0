/**
 * Proxy METAR/TAF from aviationweather.gov (no API key).
 * Avoids browser CORS so Briefing / Trip WX stays live.
 *
 * Deploy: npx supabase functions deploy wx-brief --project-ref <ref>
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

    const body = (await req.json()) as { icao?: string }
    const code = String(body.icao ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    if (!code || code.length < 3) {
      return json({ error: 'icao required' }, 400)
    }

    const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(code)}&format=json`
    const tafUrl = `https://aviationweather.gov/api/data/taf?ids=${encodeURIComponent(code)}&format=json`
    const [mRes, tRes] = await Promise.all([fetch(metarUrl), fetch(tafUrl)])

    let metar: unknown = null
    let taf: unknown = null
    if (mRes.ok) {
      const rows = await mRes.json()
      metar = Array.isArray(rows) ? rows[0] ?? null : rows
    }
    if (tRes.ok) {
      const rows = await tRes.json()
      taf = Array.isArray(rows) ? rows[0] ?? null : rows
    }

    return json({
      icao: code,
      metar,
      taf,
      source: 'aviationweather',
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
