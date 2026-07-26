/* resolveJsonModule: allow importing fixtures as modules */
export type NeedsInfoItem = { field: string; note: string }

export type OperatorRow = {
  id: string
  name: string
  base_icao: string | null
  needs_info: NeedsInfoItem[]
  aircraft_count: number
  /** Primary ops contact — editable in Network sheet */
  contact_name?: string | null
  contact_cell?: string | null
  contact_email?: string | null
  ops_email?: string | null
  notes?: string | null
  /**
   * Where quote / availability links go: sms | email | both.
   * Default both when unset.
   */
  quote_link_channel?: 'sms' | 'email' | 'both' | null
}

export type AircraftRow = {
  id: string
  operator_id: string
  operator_name: string
  tail: string
  type_name: string | null
  category: string | null
  engines: string | null
  cargo_pax?: string | null
  crew?: string | null
  base_icao: string | null
  cruise_kts: number | null
  range_nm?: number | null
  mtow_lbs: number | null
  max_payload_lbs: number | null
  seats: number | null
  door_type?: string | null
  door_w_in?: number | null
  door_h_in?: number | null
  cabin_l_ft?: number | null
  cabin_w_ft?: number | null
  cabin_h_ft?: number | null
  cabin_vol_cuft?: number | null
  insurance_expiry?: string | null
  /** Live block rate from rates_block when present. */
  rate_per_nm?: number | null
  /** History $/NM from CSV avg_op_per_nm_circuit when present. */
  avg_op_per_nm_circuit?: number | null
  /** Assumed market $/NM from CSV med_assumed_op_per_nm. */
  med_assumed_op_per_nm?: number | null
  rate_source?: 'history' | 'assumption' | 'block_rate' | null
  notes?: string | null
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
