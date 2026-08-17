/**
 * Desk aircraft search — tails + types from the network AC database.
 */

import { normalizeAircraftTail } from '@/domain/aircraftTail'
import {
  ensureDeskOperatorsLoaded,
  listDeskOperators,
} from '@/lib/deskOperatorSearch'
import { getCachedNetwork, loadNetwork } from '@/lib/networkData'
import type { AircraftRow } from '@/lib/types'
import { aircraftTypeOptions, unifyAircraftType } from '@/lib/aircraftTypeCatalog'

export type DeskAircraftHit = {
  aircraft_id: string
  operator_id: string
  operator_name: string
  tail: string
  type_name: string | null
  base_icao: string | null
  /** Per-tail MTOW — drives §4281 FET exemption when known. */
  mtow_lbs: number | null
  active: boolean
}

export async function ensureDeskAircraftLoaded(): Promise<void> {
  await ensureDeskOperatorsLoaded()
  if (!getCachedNetwork()) await loadNetwork()
}

function operatorIdForName(name: string): string | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  const op = listDeskOperators().find(
    (o) => o.name.trim().toLowerCase() === n,
  )
  return op?.id ?? null
}

/** All aircraft rows (active preferred first within an operator). */
export function listDeskAircraft(opts?: {
  operatorName?: string | null
  operatorId?: string | null
  typeName?: string | null
  activeOnly?: boolean
}): DeskAircraftHit[] {
  const net = getCachedNetwork()
  if (!net?.aircraft?.length) return []

  const opId =
    opts?.operatorId?.trim() ||
    (opts?.operatorName ? operatorIdForName(opts.operatorName) : null)
  const typeNeedle = (opts?.typeName ?? '').trim()
  const typeNeedleNorm = typeNeedle
    ? (unifyAircraftType(typeNeedle) || typeNeedle).toLowerCase()
    : ''
  const activeOnly = opts?.activeOnly !== false

  const rows = net.aircraft.filter((a) => {
    if (activeOnly && a.active === false) return false
    if (opId && a.operator_id !== opId) return false
    if (typeNeedleNorm) {
      const raw = (a.type_name ?? '').trim()
      if (!raw) return false
      const norm = (unifyAircraftType(raw) || raw).toLowerCase()
      if (norm !== typeNeedleNorm && raw.toLowerCase() !== typeNeedle.toLowerCase()) {
        return false
      }
    }
    return Boolean((a.tail ?? '').trim())
  })

  rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const ta = (a.tail ?? '').localeCompare(b.tail ?? '', undefined, {
      sensitivity: 'base',
    })
    if (ta) return ta
    return (a.type_name ?? '').localeCompare(b.type_name ?? '', undefined, {
      sensitivity: 'base',
    })
  })

  return rows.map(toHit)
}

function toHit(a: AircraftRow): DeskAircraftHit {
  return {
    aircraft_id: a.id,
    operator_id: a.operator_id,
    operator_name: a.operator_name,
    tail: normalizeAircraftTail(a.tail || ''),
    type_name: a.type_name?.trim() || null,
    base_icao: a.base_icao,
    mtow_lbs:
      a.mtow_lbs != null && Number.isFinite(Number(a.mtow_lbs))
        ? Number(a.mtow_lbs)
        : null,
    active: a.active !== false,
  }
}

/** Search tails — optional operator / type scope. */
export function searchDeskAircraftTails(
  query: string,
  opts?: {
    operatorName?: string | null
    operatorId?: string | null
    typeName?: string | null
    limit?: number
  },
): DeskAircraftHit[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '')
  const limit = opts?.limit ?? 40
  const pool = listDeskAircraft({
    operatorName: opts?.operatorName,
    operatorId: opts?.operatorId,
    typeName: opts?.typeName,
  })
  if (!q) return pool.slice(0, limit)

  const hits: DeskAircraftHit[] = []
  for (const a of pool) {
    const hay = [a.tail, a.type_name, a.base_icao, a.operator_name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
    if (!hay.includes(q) && !a.tail.toLowerCase().includes(q)) continue
    hits.push(a)
    if (hits.length >= limit) break
  }
  return hits
}

/**
 * Distinct aircraft types for the desk picker.
 * Prefer fleet types for the selected operator; fall back to full catalog.
 */
export function searchDeskAircraftTypes(
  query: string,
  opts?: {
    operatorName?: string | null
    operatorId?: string | null
    limit?: number
  },
): string[] {
  const q = query.trim().toLowerCase()
  const limit = opts?.limit ?? 40
  const fleet = listDeskAircraft({
    operatorName: opts?.operatorName,
    operatorId: opts?.operatorId,
  })
  const fromFleet = new Set<string>()
  for (const a of fleet) {
    const t = (a.type_name ?? '').trim()
    if (t) fromFleet.add(unifyAircraftType(t) || t)
  }

  const scoped = fromFleet.size
    ? [...fromFleet]
    : aircraftTypeOptions()

  const sorted = scoped.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
  if (!q) return sorted.slice(0, limit)
  return sorted.filter((t) => t.toLowerCase().includes(q)).slice(0, limit)
}

export function findDeskAircraftByTail(
  tail: string,
  opts?: { operatorName?: string | null; operatorId?: string | null },
): DeskAircraftHit | null {
  const needle = normalizeAircraftTail(tail)
  if (!needle) return null
  return (
    listDeskAircraft({
      operatorName: opts?.operatorName,
      operatorId: opts?.operatorId,
      activeOnly: false,
    }).find((a) => a.tail === needle) ?? null
  )
}
