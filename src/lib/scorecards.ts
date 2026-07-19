/**
 * Operator scorecards — prefers DB materialized view, falls back to fixture.
 */

export type OperatorScorecard = {
  name: string
  response_rate_pct: number
  median_response_min: number
  trips_completed: number
  on_time_pct: number
  percentile_response: number
  operator_id?: string
}

export type ScorecardsFile = {
  operators: OperatorScorecard[]
}

import raw from '@/fixtures/scorecards.json'
import { canPersist, db, safeQuery } from '@/lib/db/client'

const fixture = raw as ScorecardsFile

/** Mutable live scorecards — starts as fixture, replaced by MV when available. */
export const scorecards: ScorecardsFile = {
  operators: [...fixture.operators],
}

let loaded = false

export async function loadScorecards(): Promise<ScorecardsFile> {
  if (loaded) return scorecards
  if (!canPersist()) {
    loaded = true
    return scorecards
  }
  const rows = await safeQuery<Record<string, unknown>[]>(
    'operator_scorecards',
    () =>
      db()
        .from('operator_scorecards')
        .select('operator_id,name,trips_completed,n_history')
        .order('trips_completed', { ascending: false })
        .limit(200),
  )
  if (Array.isArray(rows) && rows.length) {
    const fromDb: OperatorScorecard[] = rows.map((r) => ({
      operator_id: String(r.operator_id),
      name: String(r.name ?? ''),
      trips_completed: Number(r.trips_completed ?? 0),
      response_rate_pct: 0,
      median_response_min: 0,
      on_time_pct: 0,
      percentile_response: 0,
    }))
    const names = new Set(fromDb.map((o) => o.name.toLowerCase()))
    const extra = fixture.operators.filter(
      (o) => !names.has(o.name.toLowerCase()),
    )
    scorecards.operators = [...fromDb, ...extra]
  }
  loaded = true
  return scorecards
}

export function getScorecards(): ScorecardsFile {
  return scorecards
}

export async function refreshScorecardsMv(): Promise<void> {
  if (!canPersist()) return
  await safeQuery('refresh_scorecards', () =>
    db().rpc('refresh_operator_scorecards'),
  )
  loaded = false
  await loadScorecards()
}
