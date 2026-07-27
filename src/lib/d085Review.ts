/**
 * D085 parse → network match → accept (watch + optional fleet upsert).
 */

import {
  countD085MatchKinds,
  matchD085RowsToNetwork,
  type D085ReviewRow,
} from '@/domain/d085Match'
import { normalizeTail } from '@/domain/d085Parse'
import {
  loadNetwork,
  upsertCachedAircraft,
} from '@/lib/networkData'
import { unifyAircraftType } from '@/lib/aircraftTypeCatalog'
import { parseD085File, type D085ParseResult } from '@/lib/parseD085File'
import { watchTail } from '@/lib/watchedTailsStore'

export type D085ReviewBundle = {
  rows: D085ReviewRow[]
  source: D085ParseResult['source']
  note?: string
  counts: ReturnType<typeof countD085MatchKinds>
}

export async function parseAndMatchD085(
  file: File,
  opts?: { operatorId?: string | null },
): Promise<D085ReviewBundle> {
  const parsed = await parseD085File(file)
  const net = await loadNetwork()
  const rows = matchD085RowsToNetwork(
    parsed.rows,
    net.aircraft.map((a) => ({
      id: a.id,
      tail: a.tail,
      operator_id: a.operator_id,
      operator_name: a.operator_name,
      type_name: a.type_name,
    })),
    { operatorId: opts?.operatorId },
  )
  return {
    rows,
    source: parsed.source,
    note: parsed.note,
    counts: countD085MatchKinds(rows),
  }
}

export type AcceptD085Row = {
  tail: string
  type_name: string
  match_kind: D085ReviewRow['match_kind']
  operator_id: string
  operator_name: string
  base_icao: string | null
}

/** Confirm accepted D085 rows: radar watch + add unmatched into Network cache. */
export function acceptD085Review(rows: AcceptD085Row[]): {
  watched: number
  added: number
} {
  let watched = 0
  let added = 0
  for (const r of rows) {
    const tail = normalizeTail(r.tail)
    if (!tail.startsWith('N')) continue
    const type_name =
      unifyAircraftType(r.type_name) || r.type_name.trim() || 'Unknown'
    watchTail({
      tail,
      type_name,
      operator_name: r.operator_name,
      operator_id: r.operator_id,
      base_icao: r.base_icao,
      source: 'd085',
    })
    watched += 1

    if (r.match_kind === 'new' || r.match_kind === 'conflict') {
      const row = upsertCachedAircraft({
        operator_id: r.operator_id,
        operator_name: r.operator_name,
        tail,
        type_name,
        base_icao: r.base_icao,
      })
      if (row) added += 1
    }
  }
  return { watched, added }
}

/** Convenience when all accepted rows belong to one operator. */
export function acceptD085ForOperator(opts: {
  operator_id: string
  operator_name: string
  base_icao: string | null
  rows: Array<{
    tail: string
    type_name: string
    match_kind: D085ReviewRow['match_kind']
  }>
}): { watched: number; added: number } {
  return acceptD085Review(
    opts.rows.map((r) => ({
      ...r,
      operator_id: opts.operator_id,
      operator_name: opts.operator_name,
      base_icao: opts.base_icao,
    })),
  )
}
