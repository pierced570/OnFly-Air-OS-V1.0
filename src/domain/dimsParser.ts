/**
 * Dims parser — "3 skids 48x40x60 @ 800ea" → piece rows.
 * Always return parsed result for approval (Law 3).
 * Length unit is selectable (in / ft); stored values are always inches.
 */

export type DimLengthUnit = 'in' | 'ft'

export type Piece = {
  /** Canonical inches for door-fit / routing. */
  l_in: number
  w_in: number
  h_in: number
  weight_lbs: number
  count: number
  stackable: boolean
  /** Unit the dispatcher entered (before conversion). */
  input_unit?: DimLengthUnit
  raw?: string
}

export type DimsParseResult = {
  pieces: Piece[]
  confidence: 'high' | 'medium' | 'low'
  notes: string[]
  /** Effective unit used for numbers that had no suffix. */
  unit: DimLengthUnit
}

const DIM =
  /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i
const COUNT = /^(\d+)\s+(skids?|crates?|pallets?|boxes?|pieces?|pcs?|drums?)/i
const WEIGHT_AT = /@\s*(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)?\s*(?:ea|each)?/i
const WEIGHT_EACH =
  /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\s*(?:each|ea)/i

/** Explicit unit after the L×W×H triple (overrides the UI toggle). */
function unitFromPart(part: string): DimLengthUnit | null {
  const afterDims = part.match(
    /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z"']+)/i,
  )
  const token = (afterDims?.[4] ?? '').toLowerCase()
  if (!token) {
    if (/\b(feet|foot|ft)\b/i.test(part)) return 'ft'
    if (/\b(inches|inch|in)\b/i.test(part)) return 'in'
    return null
  }
  if (/^(ft|feet|foot|')$/.test(token)) return 'ft'
  if (/^(in|inch|inches|"|″)$/.test(token)) return 'in'
  return null
}

function toInches(n: number, unit: DimLengthUnit): number {
  const v = unit === 'ft' ? n * 12 : n
  // Keep one decimal for fractional feet (e.g. 4.5 ft → 54 in)
  return Math.round(v * 10) / 10
}

function fromInches(n: number, unit: DimLengthUnit): number {
  if (unit === 'ft') return Math.round((n / 12) * 100) / 100
  return n
}

/** Preview string — shows entered unit and inches when feet. */
export function formatPieceDims(
  p: Pick<Piece, 'l_in' | 'w_in' | 'h_in' | 'input_unit'>,
  displayUnit?: DimLengthUnit,
): string {
  const unit = displayUnit ?? p.input_unit ?? 'in'
  if (unit === 'ft') {
    const l = fromInches(p.l_in, 'ft')
    const w = fromInches(p.w_in, 'ft')
    const h = fromInches(p.h_in, 'ft')
    return `${l}×${w}×${h} ft (${p.l_in}×${p.w_in}×${p.h_in} in)`
  }
  return `${p.l_in}×${p.w_in}×${p.h_in} in`
}

/** Pull L/W/H (+ qty/weight) from a free-text dims line for the triple boxes. */
export function parseDimsTriple(text: string): {
  l: string
  w: string
  h: string
  count: number
  weight: string
} {
  const empty = { l: '', w: '', h: '', count: 1, weight: '' }
  const trimmed = text.trim()
  if (!trimmed) return empty
  const dim = trimmed.match(DIM)
  if (!dim) return empty
  const cMatch = trimmed.match(COUNT)
  const wMatch = trimmed.match(WEIGHT_AT) || trimmed.match(WEIGHT_EACH)
  return {
    l: dim[1] ?? '',
    w: dim[2] ?? '',
    h: dim[3] ?? '',
    count: cMatch ? Number(cMatch[1]) : 1,
    weight: wMatch?.[1] ?? '',
  }
}

/** Build a parseable dims line from the L×W×H boxes. */
export function composeDimsLine(opts: {
  count: number
  l: string
  w: string
  h: string
  weightLbs?: number | null
  unit?: DimLengthUnit
}): string {
  const l = opts.l.trim()
  const w = opts.w.trim()
  const h = opts.h.trim()
  if (!l || !w || !h) {
    // Partial entry — still emit what we have so the boxes stay controlled.
    if (!l && !w && !h) return ''
    return [l, w, h].filter(Boolean).join('x')
  }
  const count = Math.max(1, Math.floor(opts.count) || 1)
  const unitSuffix = opts.unit === 'ft' ? ' ft' : ''
  const head =
    count > 1 ? `${count} skids ${l}x${w}x${h}${unitSuffix}` : `${l}x${w}x${h}${unitSuffix}`
  const wt = opts.weightLbs
  if (wt != null && Number.isFinite(wt) && wt > 0) {
    return `${head} @ ${wt}ea`
  }
  return head
}

export function parseDims(
  text: string,
  opts?: { unit?: DimLengthUnit },
): DimsParseResult {
  const defaultUnit: DimLengthUnit = opts?.unit ?? 'in'
  const notes: string[] = []
  const trimmed = text.trim()
  if (!trimmed) {
    return { pieces: [], confidence: 'low', notes: ['empty input'], unit: defaultUnit }
  }

  const parts = trimmed.split(/[;\n]+/).map((p) => p.trim()).filter(Boolean)
  const pieces: Piece[] = []

  for (const part of parts) {
    const dim = part.match(DIM)
    if (!dim) {
      notes.push(`no dims found in: "${part}"`)
      continue
    }
    const unit = unitFromPart(part) ?? defaultUnit
    const l_in = toInches(Number(dim[1]), unit)
    const w_in = toInches(Number(dim[2]), unit)
    const h_in = toInches(Number(dim[3]), unit)
    if (unit === 'ft') {
      notes.push(`converted ${dim[1]}×${dim[2]}×${dim[3]} ft → inches`)
    }

    let count = 1
    const cMatch = part.match(COUNT)
    if (cMatch) count = Number(cMatch[1])

    let weight_lbs = 0
    const wMatch = part.match(WEIGHT_AT) || part.match(WEIGHT_EACH)
    if (wMatch) {
      weight_lbs = Number(wMatch[1])
    } else {
      notes.push(`weight missing/assumed 0 for: "${part}"`)
    }

    pieces.push({
      l_in,
      w_in,
      h_in,
      weight_lbs,
      count,
      stackable: false,
      input_unit: unit,
      raw: part,
    })
  }

  const confidence =
    pieces.length > 0 && notes.every((n) => !n.startsWith('no dims'))
      ? notes.some((n) => n.includes('weight'))
        ? 'medium'
        : 'high'
      : pieces.length
        ? 'medium'
        : 'low'

  return { pieces, confidence, notes, unit: defaultUnit }
}

export function totalWeightLbs(pieces: Piece[]): number {
  return pieces.reduce((s, p) => s + p.weight_lbs * p.count, 0)
}

export function maxPieceDims(pieces: Piece[]): {
  l_in: number
  w_in: number
  h_in: number
} {
  return pieces.reduce(
    (m, p) => ({
      l_in: Math.max(m.l_in, p.l_in),
      w_in: Math.max(m.w_in, p.w_in),
      h_in: Math.max(m.h_in, p.h_in),
    }),
    { l_in: 0, w_in: 0, h_in: 0 },
  )
}
