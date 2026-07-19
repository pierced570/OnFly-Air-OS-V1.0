/* resolveJsonModule: allow importing fixtures as modules */
export type NeedsInfoItem = { field: string; note: string }

export type OperatorRow = {
  id: string
  name: string
  base_icao: string | null
  needs_info: NeedsInfoItem[]
  aircraft_count: number
}

export type AircraftRow = {
  id: string
  operator_id: string
  operator_name: string
  tail: string
  type_name: string | null
  category: string | null
  engines: string | null
  base_icao: string | null
  cruise_kts: number | null
  mtow_lbs: number | null
  max_payload_lbs: number | null
  seats: number | null
  fet_applies: boolean | null
  needs_info: NeedsInfoItem[]
  active: boolean
}

export type NetworkFixture = {
  importedAt: string
  operators: OperatorRow[]
  aircraft: AircraftRow[]
  airports: Array<{ icao: string; name: string; lat: number; lon: number; tz: string }>
  type_specs: Array<Record<string, unknown>>
  counts: { operators: number; aircraft: number; airports: number; needs_info_tasks: number }
}
