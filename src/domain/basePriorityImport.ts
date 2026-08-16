/**
 * Parse common-bases-priority CSV → BasePriorityList drafts (pure).
 */

import {
  canonicalClientName,
  listIdFor,
  matchOperators,
  normalizePriorityIcao,
  parseExtraContacts,
  truthyYes,
  type BasePriorityEntry,
  type BasePriorityList,
  type OperatorMatchCandidate,
} from './basePriority'

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      cur.push(field)
      field = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(field)
      field = ''
      if (cur.some((c) => c.trim())) rows.push(cur)
      cur = []
      continue
    }
    field += ch
  }
  if (field.length || cur.length) {
    cur.push(field)
    if (cur.some((c) => c.trim())) rows.push(cur)
  }
  if (!rows.length) return []
  const header = rows[0]!.map((h) => h.trim())
  return rows.slice(1).map((cols) => {
    const row: Record<string, string> = {}
    header.forEach((h, i) => {
      row[h] = (cols[i] ?? '').trim()
    })
    return row
  })
}

function numOrNull(v: string): number | null {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `e-${Math.random().toString(36).slice(2, 10)}`
}

export function listsFromBasePriorityCsv(
  csvText: string,
  operators: OperatorMatchCandidate[] = [],
): BasePriorityList[] {
  const raw = parseCsv(csvText)
  const byId = new Map<string, BasePriorityList>()

  for (const r of raw) {
    const type = (r.Type ?? r.type ?? '').trim().toLowerCase()
    const labelRaw = (r['Base Label'] ?? '').trim()
    if (!labelRaw) continue
    const { client_name, base_label } = canonicalClientName(labelRaw)
    const base_icao = normalizePriorityIcao(r['Base ICAO'] ?? '')
    // Heavy Cargo Carriers always null ICAO
    const icao =
      client_name === 'Heavy Cargo Carriers' ? null : base_icao
    const id = listIdFor(client_name, icao)

    if (!byId.has(id)) {
      byId.set(id, {
        id,
        client_name,
        base_icao: icao,
        base_label:
          client_name === 'Heavy Cargo Carriers'
            ? 'Heavy Cargo Carriers'
            : base_label || icao || client_name,
        entries: [],
      })
    }
    const list = byId.get(id)!

    if (type === 'base') continue
    if (type !== 'call' && type !== '') continue
    // CSV has "  call" with leading spaces — already trimmed type

    const company = (r.Company ?? '').trim()
    if (!company) continue

    const call_lines = parseExtraContacts(r['Extra Contacts'] ?? '')
    const hits = matchOperators(company, operators, 3)
    const best = hits[0]
    const match_status =
      best && best.score >= 72
        ? ('suggested' as const)
        : ('unmatched' as const)

    const rank = Math.max(1, Math.round(numOrNull(r['Call Order'] ?? '') ?? list.entries.length + 1))

    const entry: BasePriorityEntry = {
      id: newEntryId(),
      rank,
      company_name: company,
      operator_id: null, // never auto-confirm
      match_status,
      match_score: best?.score,
      match_candidate_name: best?.name,
      suggested_operator_id: best?.id ?? null,
      general_email: (r['General Email'] ?? '').trim(),
      contact_phone: (r['Contact Phone'] ?? '').trim(),
      company_phone: (r['Company Number'] ?? '').trim(),
      phone_24hr: (r['24hr Phone'] ?? '').trim(),
      call_lines,
      notes: (r['Operator Notes'] ?? '').trim(),
      caps: {
        pax: truthyYes(r.Pax),
        cargo: truthyYes(r.Cargo),
        hazmat: truthyYes(r.Hazmat),
        medevac: truthyYes(r.Medivac),
        hrs24: truthyYes(r['24hr Ops']),
      },
      call_out_time: (r['Call-Out Time'] ?? '').trim(),
      usefulness: numOrNull(r.Usefulness ?? ''),
      approval_tier: (r['Approval Tier'] ?? '').trim(),
      operator_base_icao: (r['Operator Base'] ?? '').trim().toUpperCase(),
      fleet_types_csv: (r['Fleet Types'] ?? '').trim(),
      aircraft_locations_csv: (r['Aircraft Locations (tails @ base)'] ?? '').trim(),
    }

    list.entries.push(entry)
  }

  const lists = [...byId.values()].map((list) => ({
    ...list,
    entries: list.entries
      .sort((a, b) => a.rank - b.rank || a.company_name.localeCompare(b.company_name))
      .map((e, i) => ({ ...e, rank: i + 1 })),
  }))

  return lists.sort((a, b) => {
    if (a.client_name !== b.client_name) {
      return a.client_name.localeCompare(b.client_name)
    }
    return (a.base_icao ?? '').localeCompare(b.base_icao ?? '')
  })
}
