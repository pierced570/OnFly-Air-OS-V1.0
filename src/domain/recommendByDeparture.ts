/**
 * Desk operator recommend — Network → Recommend lists by departure airport.
 * Exact base match first; otherwise closest listed base to origin.
 * Pure TypeScript (no React / Supabase).
 */

import { lookupAirport } from '@/domain/airports'
import {
  normalizePriorityIcao,
  type BasePriorityEntry,
  type BasePriorityList,
} from '@/domain/basePriority'
import { haversineNm } from '@/domain/geo'

export type RecommendDepartureMatch = 'exact' | 'closest' | 'none'

export type RecommendDeparturePick = {
  list: BasePriorityList | null
  match: RecommendDepartureMatch
  /** NM from departure to the list base (0 for exact; null when none). */
  distanceNm: number | null
  /** Ranked entries from the picked list (deduped by operator). */
  entries: BasePriorityEntry[]
}

/** True when two airport codes refer to the same field (KCAK ↔ CAK). */
export function recommendBaseIcaoMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = normalizePriorityIcao(a ?? '')
  const y = normalizePriorityIcao(b ?? '')
  if (!x || !y) return false
  if (x === y) return true
  const sx = x.length === 4 && x.startsWith('K') ? x.slice(1) : x
  const sy = y.length === 4 && y.startsWith('K') ? y.slice(1) : y
  return sx === sy && sx.length >= 3
}

function clientNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
}

function sortEntries(entries: BasePriorityEntry[]): BasePriorityEntry[] {
  return [...entries].sort(
    (a, b) => a.rank - b.rank || a.company_name.localeCompare(b.company_name),
  )
}

/** Prefer confirmed / suggested network id when present. */
export function priorityEntryOperatorId(
  entry: BasePriorityEntry,
): string | null {
  const confirmed = (entry.operator_id ?? '').trim()
  if (confirmed) return confirmed
  const suggested = (entry.suggested_operator_id ?? '').trim()
  return suggested || null
}

function dedupeEntries(entries: BasePriorityEntry[]): BasePriorityEntry[] {
  const seen = new Set<string>()
  const out: BasePriorityEntry[] = []
  for (const e of sortEntries(entries)) {
    const opId = priorityEntryOperatorId(e)
    const key = opId || `name:${e.company_name.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

function pickPreferredList(
  candidates: BasePriorityList[],
  preferredClientName?: string | null,
): BasePriorityList {
  const needle = clientNameKey(preferredClientName)
  if (needle) {
    const hit = candidates.find((l) => clientNameKey(l.client_name) === needle)
    if (hit) return hit
    const loose = candidates.find((l) =>
      clientNameKey(l.client_name).includes(needle),
    )
    if (loose) return loose
  }
  return candidates[0]!
}

/**
 * Pick the Recommend list for a departing airport.
 * 1) Exact base_icao match (prefer matching client name when provided)
 * 2) Else closest geocoded base_icao to the departure field
 */
export function pickRecommendListForDeparture(
  departureIcao: string,
  lists: readonly BasePriorityList[],
  opts?: { preferredClientName?: string | null },
): RecommendDeparturePick {
  const dep = normalizePriorityIcao(departureIcao)
  if (!dep) {
    return { list: null, match: 'none', distanceNm: null, entries: [] }
  }

  const withBase = lists.filter((l) => normalizePriorityIcao(l.base_icao ?? ''))
  const exact = withBase.filter((l) =>
    recommendBaseIcaoMatch(l.base_icao, dep),
  )
  if (exact.length) {
    const list = pickPreferredList(exact, opts?.preferredClientName)
    return {
      list,
      match: 'exact',
      distanceNm: 0,
      entries: dedupeEntries(list.entries),
    }
  }

  const origin = lookupAirport(dep)
  if (!origin) {
    return { list: null, match: 'none', distanceNm: null, entries: [] }
  }

  type Scored = { list: BasePriorityList; nm: number }
  const scored: Scored[] = []
  for (const list of withBase) {
    const icao = normalizePriorityIcao(list.base_icao ?? '')
    if (!icao) continue
    const ap = lookupAirport(icao)
    if (!ap) continue
    const nm = haversineNm(origin.lat, origin.lon, ap.lat, ap.lon)
    if (!Number.isFinite(nm)) continue
    scored.push({ list, nm })
  }
  if (!scored.length) {
    return { list: null, match: 'none', distanceNm: null, entries: [] }
  }

  scored.sort((a, b) => a.nm - b.nm || a.list.client_name.localeCompare(b.list.client_name))
  const closestNm = scored[0]!.nm
  const closestPool = scored
    .filter((s) => Math.abs(s.nm - closestNm) < 0.5)
    .map((s) => s.list)
  const list = pickPreferredList(closestPool, opts?.preferredClientName)
  const picked = scored.find((s) => s.list.id === list.id) ?? scored[0]!

  return {
    list,
    match: 'closest',
    distanceNm: Math.round(picked.nm),
    entries: dedupeEntries(list.entries),
  }
}
