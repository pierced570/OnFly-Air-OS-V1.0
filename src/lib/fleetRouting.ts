import { loadNetwork } from '@/lib/networkData'
import type { AircraftCandidateSource } from '@/domain/routing'
import { AIRPORTS, lookupAirport } from '@/domain/airports'
import type { MissionAircraft } from '@/domain/missionFit'
import type { AircraftRow } from '@/lib/types'

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

/**
 * Prefer live block rate (`rates_block` → `rate_per_nm`), then history avg
 * $/NM, then assumed market $/NM from the fleet CSV fixture.
 */
export function rateFromAircraft(
  a: Pick<
    AircraftRow,
    | 'rate_per_nm'
    | 'avg_op_per_nm_circuit'
    | 'med_assumed_op_per_nm'
    | 'rate_source'
  >,
): {
  rate_per_nm: number | null
  rate_source: AircraftCandidateSource['rate_source']
} {
  const block = a.rate_per_nm == null ? null : Number(a.rate_per_nm)
  // `rate_per_nm` is only written from rates_block (or sheet edits) — not from
  // history/assumed fixture columns — so a finite value means block rate.
  if (
    block != null &&
    Number.isFinite(block) &&
    a.rate_source !== 'history' &&
    a.rate_source !== 'assumption'
  ) {
    return { rate_per_nm: block, rate_source: 'block_rate' }
  }
  if (
    a.avg_op_per_nm_circuit != null &&
    Number.isFinite(a.avg_op_per_nm_circuit)
  ) {
    return { rate_per_nm: a.avg_op_per_nm_circuit, rate_source: 'history' }
  }
  if (
    a.med_assumed_op_per_nm != null &&
    Number.isFinite(a.med_assumed_op_per_nm)
  ) {
    return {
      rate_per_nm: a.med_assumed_op_per_nm,
      rate_source:
        a.rate_source === 'history' || a.rate_source === 'assumption'
          ? a.rate_source
          : 'assumption',
    }
  }
  if (block != null && Number.isFinite(block)) {
    return {
      rate_per_nm: block,
      rate_source: a.rate_source === 'history' ? 'history' : 'assumption',
    }
  }
  return { rate_per_nm: null, rate_source: null }
}

export async function loadFleetForRouting(): Promise<AircraftCandidateSource[]> {
  const net = await loadNetwork()
  const specs = typeSpecMap(net.type_specs ?? [])
  return net.aircraft.map((a) => {
    const ap = a.base_icao
      ? (lookupAirport(a.base_icao) ?? AIRPORTS[a.base_icao])
      : null
    const spec = a.type_name ? specs.get(a.type_name) : undefined
    const { rate_per_nm, rate_source } = rateFromAircraft(a)
    return {
      id: a.id,
      operator_id: a.operator_id,
      operator_name: a.operator_name,
      tail: a.tail,
      type_name: a.type_name,
      category: a.category,
      engines: a.engines,
      cargo_pax: a.cargo_pax ?? null,
      seats: a.seats,
      base_icao: a.base_icao,
      base: ap
        ? { lat: ap.lat, lon: ap.lon, icao: ap.icao, tz: ap.tz }
        : undefined,
      cruise_kts: a.cruise_kts ?? spec?.cruise_kts ?? null,
      range_nm: a.range_nm ?? spec?.range_nm ?? null,
      max_payload_lbs: a.max_payload_lbs ?? spec?.max_payload_lbs ?? null,
      mtow_lbs: a.mtow_lbs ?? spec?.mtow_lbs ?? null,
      door_w_in: a.door_w_in ?? spec?.door_w_in ?? null,
      door_h_in: a.door_h_in ?? spec?.door_h_in ?? null,
      crew: a.crew ?? null,
      insurance_expiry: a.insurance_expiry ?? null,
      rate_per_nm,
      rate_source,
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
