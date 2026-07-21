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
  /** First type name for type sort. */
  primary_type: string
  /** Max seats across tails in this column card. */
  max_seats: number | null
  /** Max payload lbs when known. */
  max_payload_lbs: number | null
  /** Cargo / pax capability from fleet cargo_pax tags. */
  payload_capability: PayloadCapability
  /** Mission fit (lower better) when cargo dims provided */
  fit_score?: number | null
  fit_door?: 'fits' | 'no_fit' | 'unknown' | null
  fit_hard_fail?: boolean
  fit_label?: 'best_fit' | 'closest' | 'best_payload' | null
  fit_reasons?: string[]
}

export type PayloadCapability = 'cargo' | 'pax' | 'both' | 'unknown'

export type NetworkSortKey =
  | 'distance'
  | 'mission_fit'
  | 'type'
  | 'pax_seats'
  | 'payload'
  | 'fleet_size'
  | 'name'

export const NETWORK_SORT_LABELS: Record<NetworkSortKey, string> = {
  distance: 'Distance',
  mission_fit: 'Mission fit',
  type: 'Aircraft type',
  pax_seats: 'Pax seats',
  payload: 'Payload lbs',
  fleet_size: 'Fleet size',
  name: 'Name',
}

/** Derive cargo / pax / both from the fleet cargo_pax field. */
export function payloadCapability(
  cargoPax: string | null | undefined,
): PayloadCapability {
  const raw = (cargoPax ?? '').trim().toLowerCase()
  if (!raw) return 'unknown'
  const cargo =
    /\bcargo\b/.test(raw) || /\bfreight\b/.test(raw) || raw === 'c'
  const pax =
    /\bpax\b/.test(raw) ||
    /\bpass/.test(raw) ||
    raw === 'p' ||
    /\bpax only\b/.test(raw)
  if (/\bcargo only\b/.test(raw) || /\bfreight only\b/.test(raw)) return 'cargo'
  if (/\bpax only\b/.test(raw) || /\bpassenger only\b/.test(raw)) return 'pax'
  if (cargo && pax) return 'both'
  if (cargo) return 'cargo'
  if (pax) return 'pax'
  if (/both|combo|mixed|c\/p|p\/c/.test(raw)) return 'both'
  return 'unknown'
}

function mergeCapability(
  a: PayloadCapability,
  b: PayloadCapability,
): PayloadCapability {
  if (a === 'unknown') return b
  if (b === 'unknown') return a
  if (a === b) return a
  return 'both'
}

export function compareOperatorCards(
  a: OperatorVerticalCard,
  b: OperatorVerticalCard,
  sortBy: NetworkSortKey,
): number {
  const byName = () => a.operator_name.localeCompare(b.operator_name)

  if (sortBy === 'mission_fit') {
    const ah = a.fit_hard_fail ? 1 : 0
    const bh = b.fit_hard_fail ? 1 : 0
    if (ah !== bh) return ah - bh
    const as = a.fit_score ?? 999
    const bs = b.fit_score ?? 999
    if (as !== bs) return as - bs
    // tie-break distance then name
    const an = a.nm_from_origin
    const bn = b.nm_from_origin
    if (an != null && bn != null && an !== bn) return an - bn
    return byName()
  }

  if (sortBy === 'distance') {
    const an = a.nm_from_origin
    const bn = b.nm_from_origin
    if (an != null && bn != null && an !== bn) return an - bn
    if (an != null && bn == null) return -1
    if (an == null && bn != null) return 1
    return byName()
  }

  if (sortBy === 'type') {
    const at = a.primary_type || a.types[0] || ''
    const bt = b.primary_type || b.types[0] || ''
    const c = at.localeCompare(bt)
    if (c !== 0) return c
    return byName()
  }

  if (sortBy === 'pax_seats') {
    const as = a.max_seats ?? -1
    const bs = b.max_seats ?? -1
    if (as !== bs) return bs - as // more seats first
    return byName()
  }

  if (sortBy === 'payload') {
    const ap = a.max_payload_lbs ?? -1
    const bp = b.max_payload_lbs ?? -1
    if (ap !== bp) return bp - ap
    return byName()
  }

  if (sortBy === 'fleet_size') {
    if (a.aircraft_count !== b.aircraft_count) {
      return b.aircraft_count - a.aircraft_count
    }
    return byName()
  }

  return byName()
}

export function sortOperatorCards(
  cards: OperatorVerticalCard[],
  sortBy: NetworkSortKey,
): OperatorVerticalCard[] {
  return [...cards].sort((a, b) => compareOperatorCards(a, b, sortBy))
}

export function cardMatchesPayloadFilter(
  card: OperatorVerticalCard,
  filter: 'all' | PayloadCapability,
): boolean {
  if (filter === 'all') return true
  if (filter === 'unknown') return card.payload_capability === 'unknown'
  if (filter === 'both') {
    return card.payload_capability === 'both'
  }
  // cargo / pax: include "both"
  if (filter === 'cargo') {
    return (
      card.payload_capability === 'cargo' ||
      card.payload_capability === 'both'
    )
  }
  if (filter === 'pax') {
    return (
      card.payload_capability === 'pax' || card.payload_capability === 'both'
    )
  }
  return true
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
 * (ranked by the selected sort key).
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
    seats?: number | null
    max_payload_lbs?: number | null
  }>
  origin?: { lat: number; lon: number } | null
  nmFrom?: (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => number
  lookupBase?: (icao: string) => { lat: number; lon: number } | null
  /** Optional mission-fit rows keyed by operator_id */
  fitByOperator?: Map<
    string,
    {
      score: number
      door: 'fits' | 'no_fit' | 'unknown'
      hard_fail: boolean
      label?: 'best_fit' | 'closest' | 'best_payload'
      reasons: string[]
      nm_from_origin: number | null
    }
  >
  /** Default: mission_fit when fit map present, else distance. */
  sortBy?: NetworkSortKey
  /** Filter cards by cargo/pax capability. */
  payloadFilter?: 'all' | PayloadCapability
}): VerticalColumn[] {
  const byOp = new Map(opts.operators.map((o) => [o.id, o]))
  const buckets = new Map<
    VerticalId,
    Map<string, OperatorVerticalCard>
  >()
  for (const id of VERTICAL_IDS) buckets.set(id, new Map())
  const fitMap = opts.fitByOperator
  const useFit = Boolean(fitMap?.size)
  const sortBy: NetworkSortKey =
    opts.sortBy ??
    (useFit ? 'mission_fit' : opts.origin ? 'distance' : 'name')
  const payloadFilter = opts.payloadFilter ?? 'all'

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
      const fit = fitMap?.get(op.id)
      card = {
        operator_id: op.id,
        operator_name: op.name,
        base_icao: op.base_icao,
        types: [],
        tails: [],
        aircraft_count: 0,
        nm_from_origin: fit?.nm_from_origin ?? nm,
        vertical: vid,
        primary_type: '',
        max_seats: null,
        max_payload_lbs: null,
        payload_capability: 'unknown',
        fit_score: fit?.score ?? null,
        fit_door: fit?.door ?? null,
        fit_hard_fail: fit?.hard_fail ?? false,
        fit_label: fit?.label ?? null,
        fit_reasons: fit?.reasons ?? [],
      }
      col.set(op.id, card)
    }
    card.aircraft_count += 1
    if (ac.tail && !card.tails.includes(ac.tail)) card.tails.push(ac.tail)
    const t = (ac.type_name ?? '').trim()
    if (t && !card.types.includes(t)) card.types.push(t)
    if (!card.primary_type && t) card.primary_type = t
    if (ac.seats != null && Number.isFinite(ac.seats)) {
      card.max_seats =
        card.max_seats == null
          ? ac.seats
          : Math.max(card.max_seats, ac.seats)
    }
    if (ac.max_payload_lbs != null && Number.isFinite(ac.max_payload_lbs)) {
      card.max_payload_lbs =
        card.max_payload_lbs == null
          ? ac.max_payload_lbs
          : Math.max(card.max_payload_lbs, ac.max_payload_lbs)
    }
    card.payload_capability = mergeCapability(
      card.payload_capability,
      payloadCapability(ac.cargo_pax),
    )
  }

  return VERTICAL_IDS.map((id) => {
    const ops = sortOperatorCards(
      [...(buckets.get(id)?.values() ?? [])].filter((c) =>
        cardMatchesPayloadFilter(c, payloadFilter),
      ),
      sortBy,
    )
    return {
      id,
      label: VERTICAL_LABELS[id],
      operators: ops,
      operator_count: ops.length,
      aircraft_count: ops.reduce((n, o) => n + o.aircraft_count, 0),
    }
  })
}

