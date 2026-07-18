/**
 * Live positions via ADS-B Exchange on RapidAPI.
 * Secret: ADSB_RAPIDAPI_KEY
 * Host: adsbexchange-com1.p.rapidapi.com
 *
 * Deploy: npx supabase functions deploy adsb-positions --project-ref udowzmoswudrqtjebehr
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const HOST = 'adsbexchange-com1.p.rapidapi.com'

type Ac = {
  lat?: number
  lon?: number
  alt_baro?: number | string
  gs?: number
  r?: string
  seen?: number
  seen_pos?: number
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
    const apiKey = Deno.env.get('ADSB_RAPIDAPI_KEY')
    if (!apiKey) return json({ error: 'ADSB_RAPIDAPI_KEY not configured' }, 500)

    const body = (await req.json()) as { tails?: string[] }
    const tails = (body.tails ?? [])
      .map((t) => String(t).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 40)
    if (!tails.length) return json({ positions: [], provider: 'adsbx' })

    const positions = []
    // Sequential with small concurrency to respect RapidAPI rate limits
    for (const tail of tails) {
      positions.push(await fetchTail(apiKey, tail))
    }
    return json({ positions, provider: 'adsbx' })
  } catch (e) {
    console.error('[adsb-positions]', e)
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

async function fetchTail(apiKey: string, tail: string) {
  const reg = encodeURIComponent(tail.replace(/^N/i, 'N').toUpperCase())
  const url = `https://${HOST}/v2/registration/${reg}/`
  const res = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': HOST,
    },
  })
  if (res.status === 403) {
    return {
      tail,
      lat: 0,
      lon: 0,
      alt: 0,
      gs: 0,
      seenAt: new Date(0).toISOString(),
      laddBlocked: true,
      lastTakeoffAt: null,
      lastLandingAt: null,
      phase: 'no_data' as const,
      error: 'RapidAPI not subscribed to ADSBexchange-com1',
    }
  }
  if (!res.ok) {
    return noData(tail)
  }
  const data = (await res.json().catch(() => ({}))) as { ac?: Ac[] }
  const ac = data.ac?.[0]
  if (!ac || ac.lat == null || ac.lon == null) {
    return noData(tail)
  }
  const altRaw = ac.alt_baro
  const alt =
    typeof altRaw === 'number'
      ? altRaw
      : altRaw === 'ground'
        ? 0
        : Number(altRaw) || 0
  const gs = Number(ac.gs) || 0
  const seenSec = Number(ac.seen_pos ?? ac.seen ?? 0)
  const seenAt = new Date(Date.now() - Math.max(0, seenSec) * 1000).toISOString()
  const airborne = alt > 0 || gs > 50
  return {
    tail,
    lat: ac.lat,
    lon: ac.lon,
    alt,
    gs,
    seenAt,
    laddBlocked: false,
    lastTakeoffAt: null,
    lastLandingAt: null,
    phase: airborne ? ('airborne' as const) : ('on_ground' as const),
  }
}

function noData(tail: string) {
  return {
    tail,
    lat: 0,
    lon: 0,
    alt: 0,
    gs: 0,
    seenAt: new Date(0).toISOString(),
    laddBlocked: true,
    lastTakeoffAt: null,
    lastLandingAt: null,
    phase: 'no_data' as const,
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
