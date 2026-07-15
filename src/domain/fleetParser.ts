/**
 * Pure fleet CSV parsing — no React, no Supabase.
 * Flag-don't-exclude: blanks → null + needs_info entries.
 * FET relevance recomputed from mtow_lbs (do not trust CSV fet_status).
 */

export const FET_EXEMPT_MTOW_LBS = 6000

export type NeedsInfoItem = {
  field: string
  note: string
}

export type ParsedAircraft = {
  operator: string
  tail: string
  type_name: string | null
  category: string | null
  engines: string | null
  cargo_pax: string | null
  seats: number | null
  base_icao: string | null
  crew: string | null
  cruise_kts: number | null
  range_nm: number | null
  max_payload_lbs: number | null
  mtow_lbs: number | null
  door_type: string | null
  door_w_in: number | null
  door_h_in: number | null
  cabin_l_ft: number | null
  cabin_w_ft: number | null
  cabin_h_ft: number | null
  cabin_vol_cuft: number | null
  liability_limit: number | null
  hull_value: number | null
  trips_logged: number | null
  avg_op_per_nm_circuit: number | null
  med_assumed_op_per_nm: number | null
  est_op_per_hr: number | null
  notes: string | null
  spec_source: string | null
  csv_fet_status: string | null
  fet_applies: boolean | null
  fet_mismatch: boolean
  needs_info: NeedsInfoItem[]
  rate_source: 'history' | 'assumption' | null
}

export type FleetParseResult = {
  operators: string[]
  aircraft: ParsedAircraft[]
  typeNames: string[]
  icaos: string[]
  needsInfoTasks: Array<{
    entity: 'aircraft' | 'operator'
    operator: string
    tail: string | null
    field: string
    note: string
  }>
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (c === ',' && !inQuotes) {
      row.push(cur)
      cur = ''
      continue
    }
    if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
      continue
    }
    cur += c
  }
  if (cur.length || row.length) {
    row.push(cur)
    if (row.some((cell) => cell.length > 0)) rows.push(row)
  }
  return rows
}

function blankToNull(v: string | undefined): string | null {
  if (v == null) return null
  const t = v.trim()
  return t === '' ? null : t
}

function toNum(v: string | null): number | null {
  if (v == null) return null
  const cleaned = v.replace(/,/g, '').replace(/\$/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function toInt(v: string | null): number | null {
  const n = toNum(v)
  return n == null ? null : Math.round(n)
}

/** Normalize base ICAO — handle values like "KJER/KTWF" */
export function normalizeIcao(raw: string | null): {
  icao: string | null
  needsInfo: NeedsInfoItem | null
} {
  if (!raw) return { icao: null, needsInfo: { field: 'base_icao', note: 'missing base ICAO' } }
  if (raw.includes('/')) {
    const first = raw.split('/')[0]!.trim()
    return {
      icao: first || null,
      needsInfo: {
        field: 'base_icao',
        note: `ambiguous multi-airport base "${raw}" — using ${first}`,
      },
    }
  }
  return { icao: raw.toUpperCase(), needsInfo: null }
}

export function fetAppliesFromMtow(mtowLbs: number | null): boolean | null {
  if (mtowLbs == null) return null
  return mtowLbs > FET_EXEMPT_MTOW_LBS
}

export function csvFetImpliesApplies(csvFet: string | null): boolean | null {
  if (!csvFet) return null
  const lower = csvFet.toLowerCase()
  if (lower.includes('exempt')) return false
  if (lower.includes('fet applies') || lower.includes('applies')) return true
  return null
}

const REQUIRED_AIRCRAFT_FIELDS: Array<{ key: keyof ParsedAircraft; field: string }> = [
  { key: 'type_name', field: 'type_name' },
  { key: 'base_icao', field: 'base_icao' },
  { key: 'cruise_kts', field: 'cruise_kts' },
  { key: 'mtow_lbs', field: 'mtow_lbs' },
  { key: 'max_payload_lbs', field: 'max_payload_lbs' },
]

export function parseFleetCsv(csvText: string): FleetParseResult {
  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    return { operators: [], aircraft: [], typeNames: [], icaos: [], needsInfoTasks: [] }
  }
  const header = rows[0]!.map((h) => h.trim())
  const idx = (name: string) => header.indexOf(name)

  const col = {
    operator: idx('operator'),
    tail: idx('tail_number'),
    type: idx('aircraft_type'),
    category: idx('category'),
    engines: idx('engines'),
    cargo_pax: idx('cargo_pax'),
    seats: idx('seats'),
    base_icao: idx('base_icao'),
    crew: idx('crew'),
    cruise_kts: idx('cruise_kts'),
    range_nm: idx('range_nm'),
    max_payload_lbs: idx('max_payload_lbs'),
    mtow_lbs: idx('mtow_lbs'),
    fet_status: idx('fet_status'),
    door_type: idx('door_type'),
    door_w_in: idx('door_w_in'),
    door_h_in: idx('door_h_in'),
    cabin_l_ft: idx('cabin_l_ft'),
    cabin_w_ft: idx('cabin_w_ft'),
    cabin_h_ft: idx('cabin_h_ft'),
    cabin_vol_cuft: idx('cabin_vol_cuft'),
    trips_logged: idx('trips_logged'),
    avg_op: idx('avg_op_per_nm_circuit'),
    med_op: idx('med_assumed_op_per_nm'),
    est_hr: idx('est_op_per_hr'),
    liability: idx('liability_limit'),
    hull: idx('hull_value'),
    notes: idx('notes'),
    spec_source: idx('spec_source'),
  }

  const get = (r: string[], i: number) => blankToNull(i >= 0 ? r[i] : undefined)

  const operators = new Set<string>()
  const typeNames = new Set<string>()
  const icaos = new Set<string>()
  const aircraft: ParsedAircraft[] = []
  const needsInfoTasks: FleetParseResult['needsInfoTasks'] = []
  const TBD_COUNTS = new Map<string, number>()

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    const operator = get(r, col.operator)
    if (!operator) continue
    operators.add(operator)

    let tail = get(r, col.tail) ?? 'TBD'
    if (tail.toUpperCase() === 'TBD') {
      const n = (TBD_COUNTS.get(operator) ?? 0) + 1
      TBD_COUNTS.set(operator, n)
      // Unique key for upsert: each TBD row is individual
      tail = `TBD-${n}`
    }

    const icaoRaw = get(r, col.base_icao)
    const { icao, needsInfo: icaoNeed } = normalizeIcao(icaoRaw)
    if (icao) icaos.add(icao)

    const type_name = get(r, col.type)
    if (type_name) typeNames.add(type_name)

    const mtow_lbs = toInt(get(r, col.mtow_lbs))
    const csv_fet_status = get(r, col.fet_status)
    const fet_applies = fetAppliesFromMtow(mtow_lbs)
    const csvImplies = csvFetImpliesApplies(csv_fet_status)
    const fet_mismatch =
      fet_applies != null && csvImplies != null && fet_applies !== csvImplies

    const avg_op = toNum(get(r, col.avg_op))
    const med_op = toNum(get(r, col.med_op))
    let rate_source: ParsedAircraft['rate_source'] = null
    if (avg_op != null) rate_source = 'history'
    else if (med_op != null) rate_source = 'assumption'

    const ac: ParsedAircraft = {
      operator,
      tail,
      type_name,
      category: get(r, col.category),
      engines: get(r, col.engines),
      cargo_pax: get(r, col.cargo_pax),
      seats: toInt(get(r, col.seats)),
      base_icao: icao,
      crew: get(r, col.crew),
      cruise_kts: toInt(get(r, col.cruise_kts)),
      range_nm: toInt(get(r, col.range_nm)),
      max_payload_lbs: toInt(get(r, col.max_payload_lbs)),
      mtow_lbs,
      door_type: get(r, col.door_type),
      door_w_in: toNum(get(r, col.door_w_in)),
      door_h_in: toNum(get(r, col.door_h_in)),
      cabin_l_ft: toNum(get(r, col.cabin_l_ft)),
      cabin_w_ft: toNum(get(r, col.cabin_w_ft)),
      cabin_h_ft: toNum(get(r, col.cabin_h_ft)),
      cabin_vol_cuft: toNum(get(r, col.cabin_vol_cuft)),
      liability_limit: toNum(get(r, col.liability)),
      hull_value: toNum(get(r, col.hull)),
      trips_logged: toInt(get(r, col.trips_logged)),
      avg_op_per_nm_circuit: avg_op,
      med_assumed_op_per_nm: med_op,
      est_op_per_hr: toNum(get(r, col.est_hr)),
      notes: get(r, col.notes),
      spec_source: get(r, col.spec_source),
      csv_fet_status,
      fet_applies,
      fet_mismatch,
      needs_info: [],
      rate_source,
    }

    if (icaoNeed) ac.needs_info.push(icaoNeed)
    if (get(r, col.tail)?.toUpperCase() === 'TBD' || !get(r, col.tail)) {
      ac.needs_info.push({ field: 'tail', note: 'TBD tail — verify actual registration' })
    }
    if (fet_mismatch) {
      ac.needs_info.push({
        field: 'fet_status',
        note: `CSV fet_status "${csv_fet_status}" mismatches recomputed MTOW ${mtow_lbs}`,
      })
    }
    if (mtow_lbs == null) {
      ac.needs_info.push({ field: 'mtow_lbs', note: 'missing MTOW — FET relevance unknown' })
    }

    for (const { key, field } of REQUIRED_AIRCRAFT_FIELDS) {
      if (ac[key] == null && !ac.needs_info.some((n) => n.field === field)) {
        ac.needs_info.push({ field, note: `missing ${field}` })
      }
    }

    // Soft-flag sparse commercial fields
    for (const field of ['crew', 'cargo_pax', 'liability_limit', 'hull_value'] as const) {
      if (ac[field] == null) {
        ac.needs_info.push({ field, note: `missing ${field}` })
      }
    }

    for (const n of ac.needs_info) {
      needsInfoTasks.push({
        entity: 'aircraft',
        operator,
        tail,
        field: n.field,
        note: n.note,
      })
    }

    aircraft.push(ac)
  }

  return {
    operators: [...operators].sort(),
    aircraft,
    typeNames: [...typeNames].sort(),
    icaos: [...icaos].sort(),
    needsInfoTasks,
  }
}

/** Build type_specs rows from distinct types (median/mode of numeric fields). */
export function buildTypeSpecs(aircraft: ParsedAircraft[]) {
  const byType = new Map<string, ParsedAircraft[]>()
  for (const ac of aircraft) {
    if (!ac.type_name) continue
    const list = byType.get(ac.type_name) ?? []
    list.push(ac)
    byType.set(ac.type_name, list)
  }
  const pickNum = (list: ParsedAircraft[], key: keyof ParsedAircraft): number | null => {
    const vals = list
      .map((a) => a[key])
      .filter((v): v is number => typeof v === 'number')
    if (!vals.length) return null
    vals.sort((a, b) => a - b)
    return vals[Math.floor(vals.length / 2)] ?? null
  }
  const pickStr = (list: ParsedAircraft[], key: keyof ParsedAircraft): string | null => {
    const counts = new Map<string, number>()
    for (const a of list) {
      const v = a[key]
      if (typeof v === 'string' && v) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    let best: string | null = null
    let n = 0
    for (const [k, c] of counts) {
      if (c > n) {
        best = k
        n = c
      }
    }
    return best
  }

  return [...byType.entries()].map(([type_name, list]) => ({
    type_name,
    cruise_kts: pickNum(list, 'cruise_kts'),
    range_nm: pickNum(list, 'range_nm'),
    max_payload_lbs: pickNum(list, 'max_payload_lbs'),
    mtow_lbs: pickNum(list, 'mtow_lbs'),
    seats: pickNum(list, 'seats'),
    door_type: pickStr(list, 'door_type'),
    door_w_in: pickNum(list, 'door_w_in'),
    door_h_in: pickNum(list, 'door_h_in'),
    cabin_l_ft: pickNum(list, 'cabin_l_ft'),
    cabin_w_ft: pickNum(list, 'cabin_w_ft'),
    cabin_h_ft: pickNum(list, 'cabin_h_ft'),
    cabin_vol_cuft: pickNum(list, 'cabin_vol_cuft'),
  }))
}
