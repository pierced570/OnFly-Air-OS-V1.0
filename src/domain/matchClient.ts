/**
 * Match free-text scratchpad client names to the directory.
 * Pure — no React / store imports.
 */

export type ClientMatchCandidate = {
  id: string
  name: string
}

export type ClientMatchHit = ClientMatchCandidate & {
  score: number
  kind: 'exact' | 'prefix' | 'includes' | 'fuzzy'
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(s: string): string {
  return norm(s).replace(/\s+/g, '')
}

/** Rank directory clients against a typed / parsed name. */
export function matchClients(
  query: string,
  clients: ClientMatchCandidate[],
  limit = 8,
): ClientMatchHit[] {
  const q = norm(query)
  if (!q) return []
  const qc = compact(q)
  const hits: ClientMatchHit[] = []

  for (const c of clients) {
    const n = norm(c.name)
    const nc = compact(c.name)
    if (!n) continue

    let score = -1
    let kind: ClientMatchHit['kind'] = 'fuzzy'

    if (n === q || nc === qc) {
      score = 100
      kind = 'exact'
    } else if (n.startsWith(q) || nc.startsWith(qc)) {
      score = 80
      kind = 'prefix'
    } else if (n.includes(q) || nc.includes(qc)) {
      score = 60
      kind = 'includes'
    } else if (q.length >= 2 && (n.includes(q[0]!) || qc.length >= 3)) {
      // light token overlap
      const qTokens = q.split(' ')
      const nTokens = new Set(n.split(' '))
      const overlap = qTokens.filter((t) => nTokens.has(t)).length
      if (overlap > 0) {
        score = 40 + overlap * 10
        kind = 'fuzzy'
      }
    }

    if (score >= 0) hits.push({ ...c, score, kind })
  }

  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit)
}

/** Best single match when confidence is high enough to auto-select. */
export function bestClientMatch(
  query: string,
  clients: ClientMatchCandidate[],
): ClientMatchHit | null {
  const hits = matchClients(query, clients, 3)
  const top = hits[0]
  if (!top) return null
  if (top.kind === 'exact' || top.kind === 'prefix') return top
  if (top.kind === 'includes' && top.score >= 60 && hits.length === 1) return top
  return null
}
