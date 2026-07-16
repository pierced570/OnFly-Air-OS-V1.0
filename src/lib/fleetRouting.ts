import { loadNetwork } from '@/lib/networkData'
import type { AircraftCandidateSource } from '@/domain/routing'
import { AIRPORTS, lookupAirport } from '@/domain/airports'

export async function loadFleetForRouting(): Promise<AircraftCandidateSource[]> {
  const net = await loadNetwork()
  return net.aircraft.map((a) => {
    const ap = a.base_icao ? lookupAirport(a.base_icao) ?? AIRPORTS[a.base_icao] : null
    return {
      id: a.id,
      operator_id: a.operator_id,
      operator_name: a.operator_name,
      tail: a.tail,
      type_name: a.type_name,
      category: a.category,
      engines: a.engines,
      cargo_pax: null,
      seats: a.seats,
      base_icao: a.base_icao,
      base: ap
        ? { lat: ap.lat, lon: ap.lon, icao: ap.icao, tz: ap.tz }
        : undefined,
      cruise_kts: a.cruise_kts,
      range_nm: null,
      max_payload_lbs: a.max_payload_lbs,
      mtow_lbs: a.mtow_lbs,
      door_w_in: null,
      door_h_in: null,
      crew: null,
      rate_per_nm: null,
      rate_source: 'assumption' as const,
    }
  })
}
