/**
 * Client + base priority call lists — Network → Recommend.
 * Pure TypeScript.
 */

export type PriorityMatchStatus = 'confirmed' | 'suggested' | 'unmatched'

export type PriorityCallLine = {
  label: string
  phone: string
}

export type PriorityCaps = {
  pax: boolean
  cargo: boolean
  hazmat: boolean
  medevac: boolean
  hrs24: boolean
}

export type BasePriorityEntry = {
  id: string
  rank: number
  company_name: string
  operator_id: string | null
  match_status: PriorityMatchStatus
  match_score?: number
  match_candidate_name?: string
  /** Best fuzzy hit id — apply only after desk confirms. */
  suggested_operator_id?: string | null
  general_email: string
  contact_phone: string
  company_phone: string
  phone_24hr: string
  call_lines: PriorityCallLine[]
  notes: string
  caps: PriorityCaps
  call_out_time: string
  usefulness: number | null
  approval_tier: string
  operator_base_icao: string
  /** CSV fleet snapshot — network tails trump when operator confirmed. */
  fleet_types_csv: string
  aircraft_locations_csv: string
}

export type BasePriorityList = {
  id: string
  client_name: string
  /** null = special list (Heavy Cargo Carriers). */
  base_icao: string | null
  base_label: string
  entries: BasePriorityEntry[]
}

const CORP_SUFFIX =
  /\b(llc|l\.l\.c|inc|incorporated|ltd|limited|co|company|corp|corporation|aviation|air|airlines?|charter|services?)\b/gi

/** Normalize operator / company names for matching. */
export function normalizeOperatorName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(CORP_SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(s: string): string {
  return normalizeOperatorName(s).replace(/\s+/g, '')
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeOperatorName(s).split(' ').filter((t) => t.length > 1))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      )
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j] ?? 0
  }
  return prev[b.length] ?? 99
}

export type OperatorMatchCandidate = { id: string; name: string }

export type OperatorMatchHit = OperatorMatchCandidate & {
  score: number
  kind: 'exact' | 'prefix' | 'includes' | 'fuzzy'
}

/**
 * Fuzzy-match a CSV company to network operators.
 * Score 0–100. Callers treat ≥72 as suggested; never auto-confirm.
 */
export function matchOperators(
  query: string,
  operators: OperatorMatchCandidate[],
  limit = 5,
): OperatorMatchHit[] {
  const q = normalizeOperatorName(query)
  if (!q) return []
  const qc = compact(query)
  const qTokens = tokenSet(query)
  const hits: OperatorMatchHit[] = []

  for (const op of operators) {
    const n = normalizeOperatorName(op.name)
    const nc = compact(op.name)
    if (!n) continue

    let score = -1
    let kind: OperatorMatchHit['kind'] = 'fuzzy'

    if (n === q || nc === qc) {
      score = 100
      kind = 'exact'
    } else if (n.startsWith(q) || q.startsWith(n)) {
      score = 88
      kind = 'prefix'
    } else if (n.includes(q) || q.includes(n)) {
      score = 78
      kind = 'includes'
    } else {
      const jac = jaccard(qTokens, tokenSet(op.name))
      const dist = editDistance(qc.slice(0, 24), nc.slice(0, 24))
      const maxLen = Math.max(qc.length, nc.length, 1)
      const editScore = Math.max(0, 1 - dist / maxLen)
      const combined = jac * 0.65 + editScore * 0.35
      if (combined >= 0.55) {
        score = Math.round(55 + combined * 40)
        kind = 'fuzzy'
      }
    }

    if (score >= 72) {
      hits.push({ ...op, score, kind })
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit)
}

/** Parse "Label: phone | phone — Label" style Extra Contacts. */
export function parseExtraContacts(raw: string): PriorityCallLine[] {
  const text = (raw ?? '').trim()
  if (!text) return []
  const parts = text.split(/\s*\|\s*/)
  const out: PriorityCallLine[] = []
  const phoneRe = /(\+?1?[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?:\s*(?:ext|x)\.?\s*\d+)?)/i

  for (const part of parts) {
    const p = part.trim()
    if (!p) continue
    // "Label: phone" or "Label - phone"
    const colon = p.match(/^(.+?)\s*[:–—-]\s*(.+)$/)
    if (colon) {
      const left = colon[1]!.trim()
      const right = colon[2]!.trim()
      const leftPhone = left.match(phoneRe)
      const rightPhone = right.match(phoneRe)
      if (rightPhone && !leftPhone) {
        out.push({ label: left, phone: rightPhone[1]!.trim() })
        continue
      }
      if (leftPhone && !rightPhone) {
        out.push({ label: right || 'Phone', phone: leftPhone[1]!.trim() })
        continue
      }
    }
    const m = p.match(phoneRe)
    if (m) {
      const phone = m[1]!.trim()
      const label = p.replace(m[0], '').replace(/^[\s:–—-]+|[\s:–—-]+$/g, '').trim() || 'Phone'
      out.push({ label, phone })
    }
  }

  // Dedupe by phone digits
  const seen = new Set<string>()
  const deduped: PriorityCallLine[] = []
  for (const line of out) {
    const key = line.phone.replace(/\D/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(line)
  }
  return deduped
}

export function truthyYes(v: string | undefined): boolean {
  return /^(1|true|yes|y)$/i.test((v ?? '').trim())
}

export function listIdFor(client: string, baseIcao: string | null): string {
  const c = client.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const b = (baseIcao ?? 'none').trim().toUpperCase() || 'NONE'
  return `${c}__${b}`
}

/** Rename Floating Fleet → Heavy Cargo Carriers on import. */
export function canonicalClientName(rawLabel: string): {
  client_name: string
  base_label: string
} {
  const label = rawLabel.trim()
  if (/^floating\s+fleet$/i.test(label)) {
    return { client_name: 'Heavy Cargo Carriers', base_label: 'Heavy Cargo Carriers' }
  }
  if (label.includes(' - ')) {
    const [client, rest] = label.split(' - ', 2)
    return { client_name: client!.trim(), base_label: (rest ?? '').trim() || label }
  }
  return { client_name: label, base_label: label }
}

export function normalizePriorityIcao(raw: string): string | null {
  const u = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!u || u === '----' || u === 'N/A' || u === 'NONE') return null
  return u
}
