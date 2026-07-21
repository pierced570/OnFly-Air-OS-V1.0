/**
 * Network spreadsheet rows — pure merge of aircraft + type_specs + contact overlays.
 * One row per tail (backend sheet view). Adding operators stays on the Admin wizard.
 */

import type { AircraftRow, NeedsInfoItem, OperatorRow } from '@/lib/types'

export type NetworkSheetAircraftPatch = {
  door_type?: string | null
  door_w_in?: number | null
  door_h_in?: number | null
  cabin_l_ft?: number | null
  cabin_w_ft?: number | null
  cabin_h_ft?: number | null
  cabin_vol_cuft?: number | null
  max_payload_lbs?: number | null
  mtow_lbs?: number | null
  cruise_kts?: number | null
  range_nm?: number | null
  seats?: number | null
  base_icao?: string | null
  cargo_pax?: string | null
  active?: boolean
  notes?: string | null
}

export type NetworkSheetOperatorPatch = {
  contact_name?: string | null
  contact_cell?: string | null
  contact_email?: string | null
  ops_email?: string | null
  base_icao?: string | null
  notes?: string | null
}

export type TypeSpecLite = {
  type_name: string
  door_type?: string | null
  door_w_in?: number | null
  door_h_in?: number | null
  cabin_l_ft?: number | null
  cabin_w_ft?: number | null
  cabin_h_ft?: number | null
  cabin_vol_cuft?: number | null
  max_payload_lbs?: number | null
  mtow_lbs?: number | null
  cruise_kts?: number | null
  range_nm?: number | null
  seats?: number | null
}

export type NetworkSheetRow = {
  aircraft_id: string
  operator_id: string
  operator_name: string
  tail: string
  type_name: string | null
  category: string | null
  engines: string | null
  cargo_pax: string | null
  base_icao: string | null
  cruise_kts: number | null
  range_nm: number | null
  mtow_lbs: number | null
  max_payload_lbs: number | null
  seats: number | null
  door_type: string | null
  door_w_in: number | null
  door_h_in: number | null
  cabin_l_ft: number | null
  cabin_w_ft: number | null
  cabin_h_ft: number | null
  cabin_vol_cuft: number | null
  active: boolean
  /** Spec came from type library (not per-tail verified). */
  door_from_type_spec: boolean
  contact_name: string | null
  contact_cell: string | null
  contact_email: string | null
  ops_email: string | null
  operator_notes: string | null
  aircraft_notes: string | null
  needs_info: NeedsInfoItem[]
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

export function typeSpecMap(
  specs: Array<Record<string, unknown>> | TypeSpecLite[],
): Map<string, TypeSpecLite> {
  const m = new Map<string, TypeSpecLite>()
  for (const s of specs) {
    const name = String((s as TypeSpecLite).type_name ?? '')
    if (!name) continue
    const row = s as Record<string, unknown>
    m.set(name, {
      type_name: name,
      door_type: str(row.door_type),
      door_w_in: num(row.door_w_in),
      door_h_in: num(row.door_h_in),
      cabin_l_ft: num(row.cabin_l_ft),
      cabin_w_ft: num(row.cabin_w_ft),
      cabin_h_ft: num(row.cabin_h_ft),
      cabin_vol_cuft: num(row.cabin_vol_cuft),
      max_payload_lbs: num(row.max_payload_lbs),
      mtow_lbs: num(row.mtow_lbs),
      cruise_kts: num(row.cruise_kts),
      range_nm: num(row.range_nm),
      seats: num(row.seats),
    })
  }
  return m
}

/** Prefer per-tail value, then type_spec, then null. */
function pickNum(
  tail: number | null | undefined,
  spec: number | null | undefined,
): { value: number | null; fromSpec: boolean } {
  if (tail != null && Number.isFinite(tail)) return { value: tail, fromSpec: false }
  if (spec != null && Number.isFinite(spec)) return { value: spec, fromSpec: true }
  return { value: null, fromSpec: false }
}

function pickStr(
  tail: string | null | undefined,
  spec: string | null | undefined,
): { value: string | null; fromSpec: boolean } {
  if (tail != null && String(tail).trim()) return { value: String(tail).trim(), fromSpec: false }
  if (spec != null && String(spec).trim()) return { value: String(spec).trim(), fromSpec: true }
  return { value: null, fromSpec: false }
}

export function buildNetworkSheetRows(opts: {
  operators: OperatorRow[]
  aircraft: AircraftRow[]
  type_specs: Array<Record<string, unknown>> | TypeSpecLite[]
  aircraftPatches?: Record<string, NetworkSheetAircraftPatch>
  operatorPatches?: Record<string, NetworkSheetOperatorPatch>
}): NetworkSheetRow[] {
  const specs = typeSpecMap(opts.type_specs)
  const opById = new Map(opts.operators.map((o) => [o.id, o]))
  const aPatches = opts.aircraftPatches ?? {}
  const oPatches = opts.operatorPatches ?? {}

  const rows: NetworkSheetRow[] = []
  for (const a of opts.aircraft) {
    const op = opById.get(a.operator_id)
    const spec = a.type_name ? specs.get(a.type_name) : undefined
    const ap = aPatches[a.id] ?? {}
    const opPatch = oPatches[a.operator_id] ?? {}

    const doorW = pickNum(
      ap.door_w_in !== undefined ? ap.door_w_in : a.door_w_in,
      spec?.door_w_in,
    )
    const doorH = pickNum(
      ap.door_h_in !== undefined ? ap.door_h_in : a.door_h_in,
      spec?.door_h_in,
    )
    const doorType = pickStr(
      ap.door_type !== undefined ? ap.door_type : a.door_type,
      spec?.door_type,
    )

    rows.push({
      aircraft_id: a.id,
      operator_id: a.operator_id,
      operator_name: a.operator_name || op?.name || '',
      tail: a.tail,
      type_name: a.type_name,
      category: a.category,
      engines: a.engines,
      cargo_pax:
        ap.cargo_pax !== undefined
          ? ap.cargo_pax
          : (a.cargo_pax ?? null),
      base_icao:
        ap.base_icao !== undefined
          ? ap.base_icao
          : (a.base_icao ?? opPatch.base_icao ?? op?.base_icao ?? null),
      cruise_kts: pickNum(
        ap.cruise_kts !== undefined ? ap.cruise_kts : a.cruise_kts,
        spec?.cruise_kts,
      ).value,
      range_nm: pickNum(
        ap.range_nm !== undefined ? ap.range_nm : a.range_nm,
        spec?.range_nm,
      ).value,
      mtow_lbs: pickNum(
        ap.mtow_lbs !== undefined ? ap.mtow_lbs : a.mtow_lbs,
        spec?.mtow_lbs,
      ).value,
      max_payload_lbs: pickNum(
        ap.max_payload_lbs !== undefined
          ? ap.max_payload_lbs
          : a.max_payload_lbs,
        spec?.max_payload_lbs,
      ).value,
      seats: pickNum(
        ap.seats !== undefined ? ap.seats : a.seats,
        spec?.seats,
      ).value,
      door_type: doorType.value,
      door_w_in: doorW.value,
      door_h_in: doorH.value,
      cabin_l_ft: pickNum(
        ap.cabin_l_ft !== undefined ? ap.cabin_l_ft : a.cabin_l_ft,
        spec?.cabin_l_ft,
      ).value,
      cabin_w_ft: pickNum(
        ap.cabin_w_ft !== undefined ? ap.cabin_w_ft : a.cabin_w_ft,
        spec?.cabin_w_ft,
      ).value,
      cabin_h_ft: pickNum(
        ap.cabin_h_ft !== undefined ? ap.cabin_h_ft : a.cabin_h_ft,
        spec?.cabin_h_ft,
      ).value,
      cabin_vol_cuft: pickNum(
        ap.cabin_vol_cuft !== undefined
          ? ap.cabin_vol_cuft
          : a.cabin_vol_cuft,
        spec?.cabin_vol_cuft,
      ).value,
      active: ap.active !== undefined ? ap.active : a.active,
      door_from_type_spec: doorW.fromSpec || doorH.fromSpec || doorType.fromSpec,
      contact_name:
        opPatch.contact_name !== undefined
          ? opPatch.contact_name
          : (op?.contact_name ?? null),
      contact_cell:
        opPatch.contact_cell !== undefined
          ? opPatch.contact_cell
          : (op?.contact_cell ?? null),
      contact_email:
        opPatch.contact_email !== undefined
          ? opPatch.contact_email
          : (op?.contact_email ?? null),
      ops_email:
        opPatch.ops_email !== undefined
          ? opPatch.ops_email
          : (op?.ops_email ?? null),
      operator_notes:
        opPatch.notes !== undefined ? opPatch.notes : (op?.notes ?? null),
      aircraft_notes:
        ap.notes !== undefined ? ap.notes : (a.notes ?? null),
      needs_info: a.needs_info ?? [],
    })
  }

  return rows.sort((a, b) => {
    const op = a.operator_name.localeCompare(b.operator_name)
    if (op !== 0) return op
    return a.tail.localeCompare(b.tail)
  })
}
