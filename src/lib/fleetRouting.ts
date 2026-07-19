import { loadNetwork } from '@/lib/networkData'
import type { AircraftCandidateSource } from '@/domain/routing'
import { AIRPORTS, lookupAirport } from '@/domain/airports'
import type { MissionAircraft } from '@/domain/missionFit'

type TypeSpec = {
  type_name: string
  door_w_in?: number | null
  door_h_in?: number | null
  range_nm?: number | null
  max_payload_lbs?: number | null
  cruise_kts?: number | null
  mtow_lbs?: number | null
}

function typeSpecMap(
  specs: Array<Record<string, unknown>>,
): Map<string, TypeSpec> {
  const m = new Map<string, TypeSpec>()
  for (const s of specs) {
    const name = String(s.type_name ?? '')
    if (!name) continue
    m.set(name, {
      type_name: name,
      door_w_in: s.door_w_in == null ? null : Number(s.door_w_in),
      door_h_in: s.door_h_in == null ? null : Number(s.door_h_in),
      range_nm: s.range_nm == null ? null : Number(s.range_nm),
      max_payload_lbs:
        s.max_payload_lbs == null ? null : Number(s.max_payload_lbs),
      cruise_kts: s.cruise_kts == null ? null : Number(s.cruise_kts),
      mtow_lbs: s.mtow_lbs == null ? null : Number(s.mtow_lbs),
    })
  }
  return m
}

export async function loadFleetForRouting(): Promise<AircraftCandidateSource[]> {
  const net = await loadNetwork()
  const specs = typeSpecMap(net.type_specs ?? [])
  return net.aircraft.map((a) => {
    const ap = a.base_icao
      ? (lookupAirport(a.base_icao) ?? AIRPORTS[a.base_icao])
      : null
    const spec = a.type_name ? specs.get(a.type_name) : undefined
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
      cruise_kts: a.cruise_kts ?? spec?.cruise_kts ?? null,
      range_nm: spec?.range_nm ?? null,
      max_payload_lbs: a.max_payload_lbs ?? spec?.max_payload_lbs ?? null,
      mtow_lbs: a.mtow_lbs ?? spec?.mtow_lbs ?? null,
      door_w_in: spec?.door_w_in ?? null,
      door_h_in: spec?.door_h_in ?? null,
      crew: null,
      rate_per_nm: null,
      rate_source: 'assumption' as const,
    }
  })
}

/** Same enrichment for mission-fit board scoring. */
export async function loadFleetForMissionFit(): Promise<MissionAircraft[]> {
  const fleet = await loadFleetForRouting()
  return fleet.map((a) => ({
    id: a.id,
    operator_id: a.operator_id,
    operator_name: a.operator_name,
    tail: a.tail,
    type_name: a.type_name,
    category: a.category,
    engines: a.engines,
    base_icao: a.base_icao,
    base: a.base ? { lat: a.base.lat, lon: a.base.lon } : null,
    max_payload_lbs: a.max_payload_lbs,
    door_w_in: a.door_w_in,
    door_h_in: a.door_h_in,
    mtow_lbs: a.mtow_lbs,
  }))
}
