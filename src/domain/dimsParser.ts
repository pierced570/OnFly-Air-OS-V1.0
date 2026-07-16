/**
 * Dims parser — "3 skids 48x40x60 @ 800ea" → piece rows.
 * Always return parsed result for approval (Law 3).
 */

export type Piece = {
  l_in: number
  w_in: number
  h_in: number
  weight_lbs: number
  count: number
  stackable: boolean
  raw?: string
}

export type DimsParseResult = {
  pieces: Piece[]
  confidence: 'high' | 'medium' | 'low'
  notes: string[]
}

const DIM =
  /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i
const COUNT = /^(\d+)\s+(skids?|crates?|pallets?|boxes?|pieces?|pcs?|drums?)/i
const WEIGHT_AT = /@\s*(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)?\s*(?:ea|each)?/i
const WEIGHT_EACH =
  /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\s*(?:each|ea)/i

export function parseDims(text: string): DimsParseResult {
  const notes: string[] = []
  const trimmed = text.trim()
  if (!trimmed) {
    return { pieces: [], confidence: 'low', notes: ['empty input'] }
  }

  // Split on ; or newlines for multi-line
  const parts = trimmed.split(/[;\n]+/).map((p) => p.trim()).filter(Boolean)
  const pieces: Piece[] = []

  for (const part of parts) {
    const dim = part.match(DIM)
    if (!dim) {
      notes.push(`no dims found in: "${part}"`)
      continue
    }
    const l_in = Number(dim[1])
    const w_in = Number(dim[2])
    const h_in = Number(dim[3])

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

  return { pieces, confidence, notes }
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
