/**
 * D085 aircraft listing parse — pure normalize / match helpers.
 * LLM extraction lives behind LlmAdapter; human verifies before commit.
 */

export type D085AircraftRow = {
  tail: string
  type_name: string
  /** Type found in local type-spec library (or obvious match). */
  matched: boolean
  conflict: string | null
}

const TAIL_RE = /\bN[0-9]{1,5}[A-Z]{0,2}\b/gi

export function normalizeTail(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function extractTailsFromText(text: string): string[] {
  const found = text.match(TAIL_RE) ?? []
  const uniq = new Set(found.map(normalizeTail).filter((t) => t.length >= 2))
  return [...uniq]
}

/** Normalize LLM / heuristic rows; flag unknown types for human verify. */
export function normalizeD085Rows(
  rows: Array<{ tail?: string; type_name?: string; type?: string }>,
  knownTypes: Set<string>,
): D085AircraftRow[] {
  const out: D085AircraftRow[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const tail = normalizeTail(String(r.tail ?? ''))
    if (!tail.startsWith('N') || tail.length < 2) continue
    if (seen.has(tail)) continue
    seen.add(tail)
    const type_name = String(r.type_name ?? r.type ?? '').trim() || 'Unknown'
    const known = [...knownTypes].some(
      (t) => t.toLowerCase() === type_name.toLowerCase(),
    )
    const fuzzy = [...knownTypes].some(
      (t) =>
        type_name.length >= 4 &&
        (t.toLowerCase().includes(type_name.toLowerCase()) ||
          type_name.toLowerCase().includes(t.toLowerCase().slice(0, 8))),
    )
    const matched = known || fuzzy
    out.push({
      tail,
      type_name,
      matched,
      conflict: matched ? null : 'Unknown type — verify / pick manually',
    })
  }
  return out
}

/** Fixture rows when no text / LLM unavailable — still needs human verify. */
export function fixtureD085Rows(): D085AircraftRow[] {
  return [
    { tail: 'N123AB', type_name: 'King Air 200', matched: true, conflict: null },
    { tail: 'N456CD', type_name: 'Cessna 208', matched: true, conflict: null },
    {
      tail: 'N789EF',
      type_name: 'Unknown Type X',
      matched: false,
      conflict: 'Unknown type — pick manually',
    },
  ]
}
