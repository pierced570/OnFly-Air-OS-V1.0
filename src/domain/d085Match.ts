/**
 * Match parsed D085 aircraft rows to existing Network tails.
 * Approve-don't-enter: unmatched / conflicts need human accept.
 */

import {
  normalizeTail,
  type D085AircraftRow,
} from '@/domain/d085Parse'

export type D085NetworkAircraft = {
  id: string
  tail: string
  operator_id: string
  operator_name: string
  type_name: string | null
}

/** How the parsed row relates to the live Network fleet. */
export type D085MatchKind =
  /** Tail already on this operator (or any match when no operator context). */
  | 'linked'
  /** Tail exists under a different operator — confirm before accepting. */
  | 'conflict'
  /** No Network tail — uploader must confirm details to add. */
  | 'new'

export type D085ReviewRow = D085AircraftRow & {
  match_kind: D085MatchKind
  existing_aircraft_id: string | null
  existing_operator_id: string | null
  existing_operator_name: string | null
  existing_type_name: string | null
  match_label: string
  /** Suggested checkbox state before human review. */
  default_accept: boolean
}

export function matchD085RowsToNetwork(
  rows: D085AircraftRow[],
  fleet: D085NetworkAircraft[],
  opts?: { operatorId?: string | null },
): D085ReviewRow[] {
  const byTail = new Map<string, D085NetworkAircraft>()
  for (const a of fleet) {
    const t = normalizeTail(a.tail)
    if (!t || t.startsWith('TBD')) continue
    if (!byTail.has(t)) byTail.set(t, a)
  }

  const operatorId = opts?.operatorId?.trim() || null

  return rows.map((row) => {
    const existing = byTail.get(normalizeTail(row.tail)) ?? null
    if (!existing) {
      return {
        ...row,
        match_kind: 'new' as const,
        existing_aircraft_id: null,
        existing_operator_id: null,
        existing_operator_name: null,
        existing_type_name: null,
        match_label: 'New tail — confirm details to add',
        default_accept: false,
        conflict:
          row.conflict ??
          'Not in Network yet — verify tail & type, then accept',
      }
    }

    const sameOp = operatorId != null && existing.operator_id === operatorId
    const otherOp = operatorId != null && existing.operator_id !== operatorId

    if (otherOp) {
      return {
        ...row,
        match_kind: 'conflict' as const,
        existing_aircraft_id: existing.id,
        existing_operator_id: existing.operator_id,
        existing_operator_name: existing.operator_name,
        existing_type_name: existing.type_name,
        match_label: `Conflict — already listed under ${existing.operator_name}`,
        default_accept: false,
        conflict: `Already on ${existing.operator_name} (${existing.type_name || 'type?'})`,
      }
    }

    // Linked: same operator, or no operator context (Radar / general upload).
    const typeHint = existing.type_name || row.type_name
    return {
      ...row,
      type_name:
        row.type_name === 'Unknown' && existing.type_name
          ? existing.type_name
          : row.type_name,
      matched: row.matched || Boolean(existing.type_name),
      match_kind: 'linked' as const,
      existing_aircraft_id: existing.id,
      existing_operator_id: existing.operator_id,
      existing_operator_name: existing.operator_name,
      existing_type_name: existing.type_name,
      match_label: sameOp
        ? `Matched · ${typeHint || 'on file'}`
        : `Matched · ${existing.operator_name}${typeHint ? ` · ${typeHint}` : ''}`,
      default_accept: true,
      conflict: sameOp || !operatorId ? null : row.conflict,
    }
  })
}

export function countD085MatchKinds(rows: D085ReviewRow[]): {
  linked: number
  conflict: number
  new: number
} {
  let linked = 0
  let conflict = 0
  let neu = 0
  for (const r of rows) {
    if (r.match_kind === 'linked') linked += 1
    else if (r.match_kind === 'conflict') conflict += 1
    else neu += 1
  }
  return { linked, conflict, new: neu }
}
