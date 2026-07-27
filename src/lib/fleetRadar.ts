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

/**
 * Load watched tails with positions.
 * - Alert-tracked tails: live poll (when ADS-B real)
 * - Everyone else: cached last-known from seed / prior alerts
 */
export async function loadFleetStatuses(_limit = 500): Promise<FleetStatus[]> {
  await hydrateRadarTracks()
  const watched = listWatchedTails()
  if (!watched.length) return []

  const tracks = listRadarTracks()
  const alertTails = tracks.filter((t) => t.alertEnabled).map((t) => t.tail)
  const adsb = createAdsbAdapter()
  const live =
    alertTails.length > 0
      ? await adsb.positions(alertTails)
      : ([] as AdsbPosition[])
  const liveByTail = new Map(live.map((p) => [p.tail.toUpperCase(), p]))

  return watched.map((w) => {
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
  })
}

export async function fleetStatusByTail(
  tails: string[],
): Promise<Map<string, FleetStatus>> {
  const all = await loadFleetStatuses()
  const map = new Map(all.map((s) => [s.tail, s]))
  for (const t of tails) {
    if (!map.has(t)) {
      const hit = all.find((s) => s.tail.toUpperCase() === t.toUpperCase())
      if (hit) map.set(t, hit)
    }
  }
  return map
}
