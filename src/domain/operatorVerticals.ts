/**
 * Operator vertical board — classify fleet into board columns.
 * Pure TS; no React / Supabase.
 */

export const VERTICAL_IDS = [
  'sep',
  'mep',
  'setp',
  'metp',
  'vlj_light',
  'mid_heavy',
  'cargo',
  'other',
] as const

export type VerticalId = (typeof VERTICAL_IDS)[number]

export const VERTICAL_LABELS: Record<VerticalId, string> = {
  sep: 'Single-Engine Prop',
  mep: 'Multi-Engine Prop',
  setp: 'Single-Engine Turboprop',
  metp: 'Multi-Engine Turboprop',
  vlj_light: 'VLJ / Light Jet',
  mid_heavy: 'Midsize / Heavy Jet',
  cargo: 'Cargo / Heavy Freight',
  other: 'Other / Verify',
}

export type AircraftForVertical = {
  category: string | null
  engines: string | null
  type_name: string | null
  cargo_pax?: string | null
}

/** Map one aircraft into a board vertical. */
export function classifyAircraftVertical(
  ac: AircraftForVertical,
): VerticalId {
  const cat = (ac.category ?? '').toLowerCase()
  const eng = (ac.engines ?? '').toLowerCase()
  const type = (ac.type_name ?? '').toLowerCase()
  const cargo = (ac.cargo_pax ?? '').toLowerCase()

  // Cargo / heavy freight first (even if jet-shaped)
  if (
    cat.includes('cargo') ||
    /cargo only|freight/.test(cargo) ||
    /\b(747|777f|md-?11|dc-?10|atr.?72.?cargo|caravan.?cargo)\b/.test(type)
  ) {
    return 'cargo'
  }

  if (eng.includes('single') && eng.includes('piston')) return 'sep'
  if (eng.includes('multi') && eng.includes('piston')) return 'mep'
  if (eng.includes('single') && eng.includes('turboprop')) return 'setp'
  if (eng.includes('multi') && eng.includes('turboprop')) return 'metp'

  // Category fallbacks when engines incomplete
  if (cat === 'piston') {
    if (eng.includes('single')) return 'sep'
    if (eng.includes('multi')) return 'mep'
    return 'other'
  }
  if (cat === 'turboprop') {
    if (eng.includes('single')) return 'setp'
    if (eng.includes('multi')) return 'metp'
    return 'other'
  }

  if (cat.includes('light jet') || cat.includes('vlj') || /\bvlj\b/.test(type)) {
    return 'vlj_light'
  }
  if (
    cat.includes('midsize') ||
    cat.includes('super-mid') ||
    cat.includes('heavy jet') ||
    cat.includes('large jet')
  ) {
    return 'mid_heavy'
  }

  // Turbine without clear jet category
  if (eng.includes('turbine') && (cat.includes('jet') || !cat)) {
    if (cat.includes('light')) return 'vlj_light'
    return 'mid_heavy'
  }

  return 'other'
}

export type OperatorVerticalCard = {
  operator_id: string
  operator_name: string
  base_icao: string | null
  types: string[]
  tails: string[]
  aircraft_count: number
  nm_from_origin: number | null
  vertical: VerticalId
}

export type VerticalColumn = {
  id: VerticalId
  label: string
  operators: OperatorVerticalCard[]
  operator_count: number
  aircraft_count: number
}

/**
 * Build board columns. An operator appears in every vertical they fly
 * (ranked by distance to origin when provided).
 */
export function buildVerticalBoard(opts: {
  operators: Array<{
    id: string
    name: string
    base_icao: string | null
  }>
  aircraft: Array<{
    operator_id: string
    type_name: string | null
    category: string | null
    engines: string | null
    base_icao: string | null
    tail: string
    cargo_pax?: string | null
  }>
  origin?: { lat: number; lon: number } | null
  nmFrom?: (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => number
  lookupBase?: (icao: string) => { lat: number; lon: number } | null
}): VerticalColumn[] {
  const byOp = new Map(opts.operators.map((o) => [o.id, o]))
  const buckets = new Map<
    VerticalId,
    Map<string, OperatorVerticalCard>
  >()
  for (const id of VERTICAL_IDS) buckets.set(id, new Map())

  for (const ac of opts.aircraft) {
    const op = byOp.get(ac.operator_id)
    if (!op) continue
    const vid = classifyAircraftVertical(ac)
    const col = buckets.get(vid)!
    let card = col.get(op.id)
    if (!card) {
      let nm: number | null = null
      if (opts.origin && opts.nmFrom && opts.lookupBase && op.base_icao) {
        const base = opts.lookupBase(op.base_icao)
        if (base) {
          nm = Math.round(
            opts.nmFrom(opts.origin.lat, opts.origin.lon, base.lat, base.lon),
          )
        }
      }
      card = {
        operator_id: op.id,
        operator_name: op.name,
        base_icao: op.base_icao,
        types: [],
        tails: [],
        aircraft_count: 0,
        nm_from_origin: nm,
        vertical: vid,
      }
      col.set(op.id, card)
    }
    card.aircraft_count += 1
    if (ac.tail && !card.tails.includes(ac.tail)) card.tails.push(ac.tail)
    const t = (ac.type_name ?? '').trim()
    if (t && !card.types.includes(t)) card.types.push(t)
  }

  return VERTICAL_IDS.map((id) => {
    const ops = [...(buckets.get(id)?.values() ?? [])].sort((a, b) => {
      const an = a.nm_from_origin
      const bn = b.nm_from_origin
      if (an != null && bn != null && an !== bn) return an - bn
      if (an != null && bn == null) return -1
      if (an == null && bn != null) return 1
      return a.operator_name.localeCompare(b.operator_name)
    })
    return {
      id,
      label: VERTICAL_LABELS[id],
      operators: ops,
      operator_count: ops.length,
      aircraft_count: ops.reduce((n, o) => n + o.aircraft_count, 0),
    }
  })
}
