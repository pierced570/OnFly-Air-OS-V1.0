import { createAdsbAdapter, type AdsbPosition } from '@/adapters/adsb'
import { deriveFleetStatus, type FleetStatus } from '@/domain/fleetStatus'
import { lookupAirport } from '@/domain/airports'
import {
  getRadarTrack,
  hydrateRadarTracks,
  listRadarTracks,
} from '@/lib/radarTrackingStore'
import { listWatchedTails } from '@/lib/watchedTailsStore'

function knownToPosition(
  tail: string,
  known: NonNullable<ReturnType<typeof getRadarTrack>>['lastKnown'],
): AdsbPosition | null {
  if (!known) return null
  return {
    tail,
    lat: known.lat,
    lon: known.lon,
    alt: known.alt,
    gs: known.gs,
    seenAt: known.seenAt,
    laddBlocked: known.laddBlocked,
    lastTakeoffAt: known.lastTakeoffAt,
    lastLandingAt: known.lastLandingAt,
    phase: known.phase,
  }
}

function statusForTail(
  w: {
    tail: string
    type_name?: string | null
    operator_name?: string
    base_icao?: string | null
    source?: string
  },
  liveByTail: Map<string, AdsbPosition>,
): FleetStatus {
  const track = getRadarTrack(w.tail)
  const livePos = liveByTail.get(w.tail.toUpperCase())
  const cached = knownToPosition(w.tail, track?.lastKnown ?? null)
  const pos =
    livePos && !livePos.laddBlocked
      ? livePos
      : cached ??
        livePos ?? {
          tail: w.tail,
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

  const baseAp = w.base_icao ? lookupAirport(w.base_icao) : null
  return deriveFleetStatus({
    position: pos,
    base: baseAp
      ? { lat: baseAp.lat, lon: baseAp.lon, icao: baseAp.icao }
      : null,
    operator_name: w.operator_name,
    type_name: w.type_name,
    base_icao: w.base_icao,
    source: w.source,
    alertTracked: Boolean(track?.alertEnabled),
  })
}

/**
 * Load fleet statuses.
 * - `watched` (default): full network watch list (routing chips / Network page)
 * - `tracked`: alert-enabled tails only (Fleet Radar map + tracking list)
 */
export async function loadFleetStatuses(
  _limit = 500,
  opts?: { scope?: 'tracked' | 'watched' },
): Promise<FleetStatus[]> {
  await hydrateRadarTracks()
  const scope = opts?.scope ?? 'watched'
  const watched = listWatchedTails()
  const tracks = listRadarTracks()
  const alertTails = tracks.filter((t) => t.alertEnabled).map((t) => t.tail)
  const adsb = createAdsbAdapter()
  const live =
    alertTails.length > 0
      ? await adsb.positions(alertTails)
      : ([] as AdsbPosition[])
  const liveByTail = new Map(live.map((p) => [p.tail.toUpperCase(), p]))
  const watchedByTail = new Map(watched.map((w) => [w.tail.toUpperCase(), w]))

  if (scope === 'watched') {
    if (!watched.length) return []
    return watched.map((w) => statusForTail(w, liveByTail))
  }

  // Tracked: alert-enabled tails (network meta when known)
  return alertTails.map((tail) => {
    const w = watchedByTail.get(tail.toUpperCase())
    return statusForTail(
      w ?? {
        tail,
        type_name: null,
        operator_name: '—',
        base_icao: null,
        source: 'manual',
      },
      liveByTail,
    )
  })
}

export async function fleetStatusByTail(
  tails: string[],
): Promise<Map<string, FleetStatus>> {
  // Routing / shortlist need network-wide radar chips — not just alert-tracked.
  const all = await loadFleetStatuses(500, { scope: 'watched' })
  const map = new Map(all.map((s) => [s.tail, s]))
  for (const t of tails) {
    if (!map.has(t)) {
      const hit = all.find((s) => s.tail.toUpperCase() === t.toUpperCase())
      if (hit) map.set(t, hit)
    }
  }
  return map
}
