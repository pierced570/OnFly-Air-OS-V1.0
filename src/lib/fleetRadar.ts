import type { AdsbPosition } from '@/adapters/adsb'
import { createAdsbAdapter } from '@/adapters/adsb'
import { deriveFleetStatus, type FleetStatus } from '@/domain/fleetStatus'
import { lookupAirport } from '@/domain/airports'
import { loadNetwork } from '@/lib/networkData'

export type EnrichedPosition = AdsbPosition & {
  laddBlocked?: boolean
  lastFlewAt?: string | null
}

/** Load trial tails (~20) with bases and derive fleet_status chips. */
export async function loadFleetStatuses(limit = 20): Promise<FleetStatus[]> {
  const net = await loadNetwork()
  const aircraft = net.aircraft
    .filter((a) => a.active && !a.tail.startsWith('TBD'))
    .slice(0, limit)

  const adsb = createAdsbAdapter()
  const positions = (await adsb.positions(
    aircraft.map((a) => a.tail),
  )) as EnrichedPosition[]

  const byTail = new Map(positions.map((p) => [p.tail, p]))
  return aircraft.map((a) => {
    const pos = byTail.get(a.tail)
    const baseAp = a.base_icao ? lookupAirport(a.base_icao) : null
    if (!pos) {
      return deriveFleetStatus({
        position: {
          tail: a.tail,
          lat: baseAp?.lat ?? 0,
          lon: baseAp?.lon ?? 0,
          alt: 0,
          gs: 0,
          seenAt: new Date(0).toISOString(),
          laddBlocked: true,
          lastFlewAt: null,
        },
        base: baseAp
          ? { lat: baseAp.lat, lon: baseAp.lon, icao: baseAp.icao }
          : null,
        operator_name: a.operator_name,
        type_name: a.type_name,
        base_icao: a.base_icao,
      })
    }
    return deriveFleetStatus({
      position: pos,
      base: baseAp
        ? { lat: baseAp.lat, lon: baseAp.lon, icao: baseAp.icao }
        : null,
      operator_name: a.operator_name,
      type_name: a.type_name,
      base_icao: a.base_icao,
    })
  })
}

export async function fleetStatusByTail(
  tails: string[],
): Promise<Map<string, FleetStatus>> {
  const all = await loadFleetStatuses(Math.max(20, tails.length))
  const map = new Map(all.map((s) => [s.tail, s]))
  return map
}
