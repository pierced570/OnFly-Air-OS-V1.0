import { createAdsbAdapter } from '@/adapters/adsb'
import { deriveFleetStatus, type FleetStatus } from '@/domain/fleetStatus'
import { lookupAirport } from '@/domain/airports'
import { listWatchedTails } from '@/lib/watchedTailsStore'

/** Load all watched tails (network + D085) with ADS-B positions. */
export async function loadFleetStatuses(_limit = 500): Promise<FleetStatus[]> {
  const watched = listWatchedTails()
  if (!watched.length) return []

  const adsb = createAdsbAdapter()
  const positions = await adsb.positions(watched.map((w) => w.tail))
  const byTail = new Map(positions.map((p) => [p.tail.toUpperCase(), p]))

  return watched.map((w) => {
    const pos = byTail.get(w.tail.toUpperCase())
    const baseAp = w.base_icao ? lookupAirport(w.base_icao) : null
    if (!pos) {
      return deriveFleetStatus({
        position: {
          tail: w.tail,
          lat: baseAp?.lat ?? 0,
          lon: baseAp?.lon ?? 0,
          alt: 0,
          gs: 0,
          seenAt: new Date(0).toISOString(),
          laddBlocked: true,
          lastTakeoffAt: null,
          lastLandingAt: null,
          phase: 'no_data',
        },
        base: baseAp
          ? { lat: baseAp.lat, lon: baseAp.lon, icao: baseAp.icao }
          : null,
        operator_name: w.operator_name,
        type_name: w.type_name,
        base_icao: w.base_icao,
        source: w.source,
      })
    }
    return deriveFleetStatus({
      position: pos,
      base: baseAp
        ? { lat: baseAp.lat, lon: baseAp.lon, icao: baseAp.icao }
        : null,
      operator_name: w.operator_name,
      type_name: w.type_name,
      base_icao: w.base_icao,
      source: w.source,
    })
  })
}

export async function fleetStatusByTail(
  tails: string[],
): Promise<Map<string, FleetStatus>> {
  const all = await loadFleetStatuses()
  const map = new Map(all.map((s) => [s.tail, s]))
  // ensure requested tails present even if not watched yet
  for (const t of tails) {
    if (!map.has(t)) {
      const hit = all.find((s) => s.tail.toUpperCase() === t.toUpperCase())
      if (hit) map.set(t, hit)
    }
  }
  return map
}
