/**
 * Live positions / seed / FlightAware alerts via AeroAPI (preferred) or RapidAPI ADSBX.
 *
 * Secrets (never VITE_*):
 *   FLIGHTAWARE_AEROAPI_KEY  — AeroAPI Standard+
 *   ADSB_ALERT_WEBHOOK_URL   — public URL for PUT /alerts/endpoint (optional until alerts)
 *   ADSB_RAPIDAPI_KEY        — legacy fallback only
 *   ADSB_PROVIDER            — flightaware | adsbx (default: flightaware if FA key present)
 *
 * Deploy: npx supabase functions deploy adsb-positions --project-ref <ref>
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const FA_BASE = 'https://aeroapi.flightaware.com/aeroapi'
const RAPID_HOST = 'adsbexchange-com1.p.rapidapi.com'

type Ac = {
  lat?: number
  lon?: number
  alt_baro?: number | string
  gs?: number
  r?: string
  seen?: number
  seen_pos?: number
}

type FaAirportRef = {
  code?: string | null
  code_icao?: string | null
  timezone?: string | null
}

type FaFlight = {
  ident?: string
  registration?: string
  fa_flight_id?: string
  actual_off?: string | null
  actual_on?: string | null
  estimated_off?: string | null
  estimated_on?: string | null
  last_position?: {
    latitude?: number
    longitude?: number
    altitude?: number | null
    groundspeed?: number | null
    timestamp?: string
  } | null
  status?: string
  /** AeroAPI: flight restricted from public viewing (LADD / owner block). */
  blocked?: boolean
  origin?: FaAirportRef | null
  destination?: FaAirportRef | null
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

    const body = (await req.json()) as {
      action?: string
      tails?: string[]
      tail?: string
    }
    const action = String(body.action ?? 'positions').toLowerCase()

    if (action === 'alert_set' || action === 'alert_clear') {
      const tail = String(body.tail ?? '')
        .trim()
        .toUpperCase()
      if (!tail) return json({ ok: false, error: 'tail required' }, 400)
      return json(await handleAlert(tail, action === 'alert_set'))
    }

    const tails = (body.tails ?? [])
      .map((t) => String(t).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 40)
    if (!tails.length) {
      return json({ positions: [], provider: providerName() })
    }

    const provider = providerName()
    const positions =
      provider === 'flightaware'
        ? await seedOrPositionsFa(tails, action === 'seed')
        : await positionsRapid(tails)

    return json({ positions, provider })
  } catch (e) {
    console.error('[adsb-positions]', e)
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})

function providerName(): 'flightaware' | 'adsbx' {
  const forced = (Deno.env.get('ADSB_PROVIDER') ?? '').toLowerCase()
  if (forced === 'adsbx') return 'adsbx'
  if (forced === 'flightaware') return 'flightaware'
  if (Deno.env.get('FLIGHTAWARE_AEROAPI_KEY')) return 'flightaware'
  if (Deno.env.get('ADSB_RAPIDAPI_KEY')) return 'adsbx'
  return 'flightaware'
}

function faKey(): string | null {
  return Deno.env.get('FLIGHTAWARE_AEROAPI_KEY')?.trim() || null
}

async function seedOrPositionsFa(tails: string[], seed: boolean) {
  const key = faKey()
  if (!key) {
    return tails.map((t) => ({
      ...noData(t),
      error: 'FLIGHTAWARE_AEROAPI_KEY not configured',
    }))
  }
  const out = []
  for (const tail of tails) {
    out.push(await fetchFaTail(key, tail, seed))
  }
  return out
}

function isUsRegistration(tail: string): boolean {
  return /^N[0-9A-Z]+$/i.test(tail)
}

async function fetchFaTail(key: string, tail: string, seed: boolean) {
  const q = isUsRegistration(tail)
    ? '?max_pages=1&ident_type=registration'
    : '?max_pages=1'
  const url = `${FA_BASE}/flights/${encodeURIComponent(tail)}${q}`
  const res = await fetch(url, {
    headers: { 'x-apikey': key, Accept: 'application/json' },
  })
  if (res.status === 401 || res.status === 403) {
    return {
      ...noData(tail),
      error: 'FlightAware auth failed — check AeroAPI key / tier',
    }
  }
  if (!res.ok) return noData(tail)
  const data = (await res.json().catch(() => ({}))) as {
    flights?: FaFlight[]
  }
  let flight = data.flights?.[0]

  // Seed fallback: last known historical flight when no recent board entry.
  if (!flight && seed && isUsRegistration(tail)) {
    flight = await fetchFaLastFlight(key, tail)
  }
  if (!flight) {
    // Empty board ≠ LADD. Do not call /aircraft/{ident}/blocked here — that
    // doubles AeroAPI spend on every seed for parked / idle tails. Blocked is
    // only set from flight.blocked when a flight object is returned.
    return noData(tail)
  }

  const status = String(flight.status ?? '').toLowerCase()
  const airborneHint =
    status.includes('en route') ||
    status.includes('airborne') ||
    (!flight.actual_on && Boolean(flight.actual_off))
  const flightBlocked = flight.blocked === true

  let lat = flight.last_position?.latitude
  let lon = flight.last_position?.longitude
  let alt = Number(flight.last_position?.altitude ?? 0) || 0
  let gs = Number(flight.last_position?.groundspeed ?? 0) || 0
  let seenAt = flight.last_position?.timestamp
    ? new Date(flight.last_position.timestamp).toISOString()
    : null

  // En route often omits last_position on the flights list — fetch live point.
  if ((lat == null || lon == null) && airborneHint && flight.fa_flight_id) {
    const live = await fetchFaFlightPosition(key, flight.fa_flight_id)
    if (live) {
      lat = live.lat
      lon = live.lon
      alt = live.alt
      gs = live.gs
      seenAt = live.seenAt
    }
  }

  // Parked / arrived: use destination (or origin) airport coords as last-known.
  if ((lat == null || lon == null) && seed) {
    const icao =
      airportCode(flight.destination) || airportCode(flight.origin)
    if (icao) {
      const ap = await fetchFaAirport(key, icao)
      if (ap) {
        lat = ap.lat
        lon = ap.lon
        alt = 0
        gs = 0
        seenAt =
          flight.actual_on ||
          flight.actual_off ||
          flight.estimated_on ||
          new Date().toISOString()
      }
    }
  }

  const originIcao = airportCode(flight.origin)
  const destinationIcao = airportCode(flight.destination)
  const takeoffIsActual = Boolean(flight.actual_off)
  const landingIsActual = Boolean(flight.actual_on)
  const lastTakeoffAt =
    flight.actual_off ?? flight.estimated_off ?? null
  const lastLandingAt =
    flight.actual_on ?? flight.estimated_on ?? null

  if (lat == null || lon == null) {
    // Missing fix (parked / old flight / API gap) is not LADD — only flight.blocked is.
    return {
      ...noData(tail),
      lastTakeoffAt,
      lastLandingAt,
      takeoffIsActual,
      landingIsActual,
      originIcao,
      destinationIcao,
      laddBlocked: flightBlocked,
    }
  }

  const airborne =
    airborneHint || alt > 500 || gs > 50
  return {
    tail,
    lat,
    lon,
    alt,
    gs,
    seenAt: seenAt ?? new Date().toISOString(),
    // Even with a fix, honor AeroAPI blocked flag (rare for Standard keys).
    laddBlocked: flightBlocked,
    lastTakeoffAt,
    lastLandingAt,
    takeoffIsActual,
    landingIsActual,
    originIcao,
    destinationIcao,
    phase: airborne ? ('airborne' as const) : ('on_ground' as const),
  }
}

function airportCode(ap?: FaAirportRef | null): string | null {
  const code = (ap?.code_icao || ap?.code || '').toUpperCase()
  return code || null
}

async function fetchFaLastFlight(
  key: string,
  tail: string,
): Promise<FaFlight | null> {
  const res = await fetch(
    `${FA_BASE}/history/aircraft/${encodeURIComponent(tail)}/last_flight`,
    { headers: { 'x-apikey': key, Accept: 'application/json' } },
  )
  if (!res.ok) return null
  const data = (await res.json().catch(() => ({}))) as { flights?: FaFlight[] }
  return data.flights?.[0] ?? null
}

async function fetchFaFlightPosition(
  key: string,
  faFlightId: string,
): Promise<{
  lat: number
  lon: number
  alt: number
  gs: number
  seenAt: string
} | null> {
  const res = await fetch(
    `${FA_BASE}/flights/${encodeURIComponent(faFlightId)}/position`,
    { headers: { 'x-apikey': key, Accept: 'application/json' } },
  )
  if (!res.ok) return null
  const data = (await res.json().catch(() => ({}))) as {
    latitude?: number
    longitude?: number
    altitude?: number | null
    groundspeed?: number | null
    timestamp?: string
    last_position?: {
      latitude?: number
      longitude?: number
      altitude?: number | null
      groundspeed?: number | null
      timestamp?: string
    } | null
    waypoints?: number[]
  }
  const lp = data.last_position
  let lat = lp?.latitude ?? data.latitude
  let lon = lp?.longitude ?? data.longitude
  // Position payload sometimes only has waypoint polyline [lat,lon,...]
  if ((lat == null || lon == null) && Array.isArray(data.waypoints)) {
    const w = data.waypoints
    if (w.length >= 2) {
      // Prefer last pair
      const i = w.length - (w.length % 2 === 0 ? 2 : 3)
      const a = w[Math.max(0, i)]
      const b = w[Math.max(0, i) + 1]
      if (typeof a === 'number' && typeof b === 'number') {
        lat = a
        lon = b
      }
    }
  }
  if (lat == null || lon == null) return null
  return {
    lat,
    lon,
    alt: Number(lp?.altitude ?? data.altitude ?? 0) || 0,
    gs: Number(lp?.groundspeed ?? data.groundspeed ?? 0) || 0,
    seenAt: (lp?.timestamp || data.timestamp)
      ? new Date(String(lp?.timestamp || data.timestamp)).toISOString()
      : new Date().toISOString(),
  }
}

async function fetchFaAirport(
  key: string,
  icao: string,
): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(`${FA_BASE}/airports/${encodeURIComponent(icao)}`, {
    headers: { 'x-apikey': key, Accept: 'application/json' },
  })
  if (!res.ok) return null
  const data = (await res.json().catch(() => ({}))) as {
    latitude?: number
    longitude?: number
  }
  if (data.latitude == null || data.longitude == null) return null
  return { lat: data.latitude, lon: data.longitude }
}

async function handleAlert(tail: string, enable: boolean) {
  const key = faKey()
  if (!key) {
    return {
      ok: false,
      tail,
      enabled: enable,
      error: 'FLIGHTAWARE_AEROAPI_KEY not configured',
    }
  }

  if (!enable) {
    const existing = await findAlertId(key, tail)
    if (existing != null) {
      const del = await fetch(`${FA_BASE}/alerts/${existing}`, {
        method: 'DELETE',
        headers: { 'x-apikey': key },
      })
      if (!del.ok && del.status !== 404) {
        const text = await del.text().catch(() => '')
        return {
          ok: false,
          tail,
          enabled: false,
          error: `Delete alert failed: ${del.status} ${text}`,
        }
      }
    }
    return { ok: true, tail, enabled: false, alertId: null }
  }

  await ensureAlertEndpoint(key)

  const existing = await findAlertId(key, tail)
  if (existing != null) {
    return { ok: true, tail, enabled: true, alertId: String(existing) }
  }

  const res = await fetch(`${FA_BASE}/alerts`, {
    method: 'POST',
    headers: {
      'x-apikey': key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ident: tail,
      max_weekly: 200,
      events: {
        departure: true,
        arrival: true,
        cancelled: true,
        diverted: true,
        filed: false,
        out: false,
        off: true,
        on: true,
        in: false,
        hold_start: false,
        hold_end: false,
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return {
      ok: false,
      tail,
      enabled: true,
      error: `Create alert failed: ${res.status} ${text}`,
    }
  }
  const created = (await res.json().catch(() => ({}))) as { id?: number }
  return {
    ok: true,
    tail,
    enabled: true,
    alertId: created.id != null ? String(created.id) : null,
  }
}

async function ensureAlertEndpoint(key: string) {
  const webhook = Deno.env.get('ADSB_ALERT_WEBHOOK_URL')?.trim()
  if (!webhook) return
  const get = await fetch(`${FA_BASE}/alerts/endpoint`, {
    headers: { 'x-apikey': key, Accept: 'application/json' },
  })
  if (get.ok) {
    const cur = (await get.json().catch(() => ({}))) as {
      url?: string | null
    }
    if (cur.url === webhook) return
  }
  await fetch(`${FA_BASE}/alerts/endpoint`, {
    method: 'PUT',
    headers: {
      'x-apikey': key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ url: webhook }),
  })
}

async function findAlertId(
  key: string,
  tail: string,
): Promise<number | null> {
  const res = await fetch(`${FA_BASE}/alerts?max_pages=5`, {
    headers: { 'x-apikey': key, Accept: 'application/json' },
  })
  if (!res.ok) return null
  const data = (await res.json().catch(() => ({}))) as {
    alerts?: Array<{ id?: number; ident?: string | null; user_ident?: string | null }>
  }
  const hit = (data.alerts ?? []).find((a) => {
    const idents = [a.ident, a.user_ident]
      .filter(Boolean)
      .map((s) => String(s).toUpperCase())
    return idents.includes(tail)
  })
  return hit?.id ?? null
}

async function positionsRapid(tails: string[]) {
  const apiKey = Deno.env.get('ADSB_RAPIDAPI_KEY')
  if (!apiKey) {
    return tails.map((t) => ({
      ...noData(t),
      error: 'ADSB_RAPIDAPI_KEY not configured',
    }))
  }
  const positions = []
  for (const tail of tails) {
    positions.push(await fetchRapidTail(apiKey, tail))
  }
  return positions
}

async function fetchRapidTail(apiKey: string, tail: string) {
  const reg = encodeURIComponent(tail.replace(/^N/i, 'N').toUpperCase())
  const url = `https://${RAPID_HOST}/v2/registration/${reg}/`
  const res = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': RAPID_HOST,
    },
  })
  if (res.status === 403) {
    return {
      ...noData(tail),
      error: 'RapidAPI not subscribed to ADSBexchange-com1',
    }
  }
  if (!res.ok) return noData(tail)
  const data = (await res.json().catch(() => ({}))) as { ac?: Ac[] }
  const ac = data.ac?.[0]
  if (!ac || ac.lat == null || ac.lon == null) return noData(tail)
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
    // No fix / empty board ≠ LADD. Only AeroAPI `blocked` marks laddBlocked.
    laddBlocked: false,
    lastTakeoffAt: null,
    lastLandingAt: null,
    takeoffIsActual: false,
    landingIsActual: false,
    originIcao: null as string | null,
    destinationIcao: null as string | null,
    phase: 'no_data' as const,
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
