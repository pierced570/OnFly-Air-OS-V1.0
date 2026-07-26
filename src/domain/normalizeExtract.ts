/**
 * Coerce LLM / heuristic trip extracts into a stable ExtractedRequest shape.
 * Preserves string content (no character stripping beyond trim on scalars).
 */

export type NormalizedTripExtract = {
  pieces_text?: string
  origin_text?: string
  destination_text?: string
  ready_local?: string
  deadline_local?: string
  hazmat?: boolean
  pax_count?: number
  payload_kind?: 'cargo' | 'pax' | 'both'
  client_name?: string
  asap?: boolean
  notes?: string
  raw: string
  /** Where the filled fields came from */
  parse_source?: 'claude' | 'heuristic' | 'claude+heuristic' | 'demo'
}

function asString(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') {
    const t = v.trim()
    return t.length ? t : undefined
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (['true', 'yes', 'y', '1', 'asap', 'aog'].includes(t)) return true
    if (['false', 'no', 'n', '0'].includes(t)) return false
  }
  if (typeof v === 'number') return v !== 0
  return undefined
}

function asPax(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v)
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return undefined
}

function asKind(v: unknown): NormalizedTripExtract['payload_kind'] | undefined {
  const s = asString(v)?.toLowerCase()
  if (s === 'cargo' || s === 'pax' || s === 'both') return s
  return undefined
}

/** Normalize a loose model/heuristic object; never drops raw call-pad text. */
export function normalizeTripExtract(
  input: unknown,
  rawText: string,
): NormalizedTripExtract {
  const o =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return {
    client_name: asString(o.client_name),
    pieces_text: asString(o.pieces_text),
    origin_text: asString(o.origin_text),
    destination_text: asString(o.destination_text),
    ready_local: asString(o.ready_local),
    deadline_local: asString(o.deadline_local),
    hazmat: asBool(o.hazmat),
    asap: asBool(o.asap),
    pax_count: asPax(o.pax_count),
    payload_kind: asKind(o.payload_kind),
    notes: asString(o.notes),
    raw: rawText,
  }
}

export function mergeTripExtract(
  primary: NormalizedTripExtract,
  fallback: NormalizedTripExtract,
): NormalizedTripExtract {
  const filled = (k: keyof NormalizedTripExtract) => {
    const v = primary[k]
    if (v === undefined || v === null || v === '') return fallback[k]
    return v
  }
  const primaryHadLane = Boolean(
    primary.origin_text?.trim() && primary.destination_text?.trim(),
  )
  const usedFallback =
    !primaryHadLane ||
    (!primary.client_name && fallback.client_name) ||
    (primary.asap == null && fallback.asap != null) ||
    (!primary.pieces_text && fallback.pieces_text)

  return {
    raw: primary.raw || fallback.raw,
    origin_text: filled('origin_text') as string | undefined,
    destination_text: filled('destination_text') as string | undefined,
    pieces_text: filled('pieces_text') as string | undefined,
    client_name: filled('client_name') as string | undefined,
    ready_local: filled('ready_local') as string | undefined,
    deadline_local: filled('deadline_local') as string | undefined,
    asap: (primary.asap ?? fallback.asap) as boolean | undefined,
    hazmat: (primary.hazmat ?? fallback.hazmat) as boolean | undefined,
    pax_count: (primary.pax_count ?? fallback.pax_count) as number | undefined,
    payload_kind:
      (primary.payload_kind ?? fallback.payload_kind ?? 'cargo') as
        | 'cargo'
        | 'pax'
        | 'both',
    notes: [fallback.notes, primary.notes].filter(Boolean).join('; ') || undefined,
    parse_source: usedFallback ? 'claude+heuristic' : 'claude',
  }
}
