/**
 * Recommended calls by ICAO — local until a DB table lands.
 * Desk adds a location, then an ordered operator call list.
 */

import {
  isValidRecommendIcao,
  moveOperatorInOrder,
  normalizeRecommendIcao,
  recommendIcaoMatch,
  type LocationRecommendList,
  type LocationRecommendOperator,
} from '@/domain/locationRecommend'

const KEY = 'onfly.locationRecommend.v1'
const listeners = new Set<() => void>()
let rows: LocationRecommendList[] = load()
let snapshot: LocationRecommendList[] = sortRows(rows)

function sortRows(list: LocationRecommendList[]): LocationRecommendList[] {
  return [...list].sort((a, b) => a.icao.localeCompare(b.icao))
}

function load(): LocationRecommendList[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LocationRecommendList[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(sanitizeRow)
      .filter((r): r is LocationRecommendList => r != null)
  } catch {
    return []
  }
}

function sanitizeRow(raw: unknown): LocationRecommendList | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<LocationRecommendList>
  const icao = normalizeRecommendIcao(r.icao)
  if (!isValidRecommendIcao(icao)) return null
  const ops = Array.isArray(r.operators)
    ? r.operators
        .map((o) => {
          if (!o || typeof o !== 'object') return null
          const id = String(
            (o as LocationRecommendOperator).operator_id ?? '',
          ).trim()
          const name = String((o as LocationRecommendOperator).name ?? '').trim()
          if (!id || !name) return null
          return { operator_id: id, name } satisfies LocationRecommendOperator
        })
        .filter((o): o is LocationRecommendOperator => o != null)
    : []
  // Dedupe by operator_id, keep first occurrence (order).
  const seen = new Set<string>()
  const operators: LocationRecommendOperator[] = []
  for (const o of ops) {
    if (seen.has(o.operator_id)) continue
    seen.add(o.operator_id)
    operators.push(o)
  }
  return {
    icao,
    operators,
    updated_at:
      typeof r.updated_at === 'string' && r.updated_at
        ? r.updated_at
        : new Date().toISOString(),
  }
}

function persist() {
  snapshot = sortRows(rows)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(rows))
    }
  } catch {
    /* ignore */
  }
  for (const l of listeners) l()
}

export function subscribeLocationRecommend(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listLocationRecommends(): LocationRecommendList[] {
  return snapshot
}

export function getLocationRecommend(
  icao: string,
): LocationRecommendList | null {
  const needle = normalizeRecommendIcao(icao)
  if (!needle) return null
  return rows.find((r) => recommendIcaoMatch(r.icao, needle)) ?? null
}

/** Create empty list for ICAO, or return existing (matched with K-prefix). */
export function upsertLocationRecommend(icaoRaw: string): LocationRecommendList {
  const icao = normalizeRecommendIcao(icaoRaw)
  if (!isValidRecommendIcao(icao)) {
    throw new Error('Enter a valid ICAO (3–4 characters)')
  }
  const existing = getLocationRecommend(icao)
  if (existing) return existing
  const now = new Date().toISOString()
  const row: LocationRecommendList = {
    icao,
    operators: [],
    updated_at: now,
  }
  rows = [row, ...rows]
  persist()
  return row
}

export function removeLocationRecommend(icao: string): void {
  const needle = normalizeRecommendIcao(icao)
  rows = rows.filter((r) => !recommendIcaoMatch(r.icao, needle))
  persist()
}

export function setLocationRecommendOperators(
  icao: string,
  operators: LocationRecommendOperator[],
): LocationRecommendList {
  const row = getLocationRecommend(icao)
  if (!row) throw new Error('Location not found')
  const seen = new Set<string>()
  const next: LocationRecommendOperator[] = []
  for (const o of operators) {
    const id = o.operator_id.trim()
    const name = o.name.trim()
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    next.push({ operator_id: id, name })
  }
  row.operators = next
  row.updated_at = new Date().toISOString()
  persist()
  return row
}

export function addLocationRecommendOperator(
  icao: string,
  operator: LocationRecommendOperator,
): LocationRecommendList {
  const row = getLocationRecommend(icao)
  if (!row) throw new Error('Location not found')
  const id = operator.operator_id.trim()
  const name = operator.name.trim()
  if (!id || !name) throw new Error('Operator required')
  if (row.operators.some((o) => o.operator_id === id)) {
    return row
  }
  row.operators = [...row.operators, { operator_id: id, name }]
  row.updated_at = new Date().toISOString()
  persist()
  return row
}

export function removeLocationRecommendOperator(
  icao: string,
  operatorId: string,
): LocationRecommendList {
  const row = getLocationRecommend(icao)
  if (!row) throw new Error('Location not found')
  row.operators = row.operators.filter((o) => o.operator_id !== operatorId)
  row.updated_at = new Date().toISOString()
  persist()
  return row
}

export function moveLocationRecommendOperator(
  icao: string,
  index: number,
  direction: -1 | 1,
): LocationRecommendList {
  const row = getLocationRecommend(icao)
  if (!row) throw new Error('Location not found')
  row.operators = moveOperatorInOrder(row.operators, index, direction)
  row.updated_at = new Date().toISOString()
  persist()
  return row
}

export function __resetLocationRecommendForTests(): void {
  rows = []
  persist()
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
