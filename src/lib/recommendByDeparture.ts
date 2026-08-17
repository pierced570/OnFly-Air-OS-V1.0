/**
 * Build desk Candidates from Network → Recommend for a departure airport.
 */

import type { Candidate } from '@/domain/routing'
import {
  pickRecommendListForDeparture,
  priorityEntryOperatorId,
  type RecommendDepartureMatch,
} from '@/domain/recommendByDeparture'
import { listBasePriorityLists } from '@/lib/basePriorityStore'
import {
  candidateFromDeskHit,
  listDeskOperators,
  searchDeskOperators,
  toDeskOperatorHit,
} from '@/lib/deskOperatorSearch'

export type DepartureRecommendResult = {
  candidates: Candidate[]
  match: RecommendDepartureMatch
  listId: string | null
  listLabel: string | null
  baseIcao: string | null
  distanceNm: number | null
}

function stubCandidate(opts: {
  operatorId: string
  name: string
  reasoning: string[]
}): Candidate {
  return {
    operator_id: opts.operatorId,
    operator_name: opts.name,
    aircraft_id: `recommend-${opts.operatorId}`,
    tail: 'TBD',
    type_name: null,
    mtow_lbs: null,
    cost: 0,
    price: 0,
    chain: [],
    confidence: 0.4,
    needsInfo: ['Confirm aircraft / tail'],
    bookingGated: false,
    reasoning: opts.reasoning,
    eta_end: new Date().toISOString(),
    circuit_nm: 0,
    rate_per_nm: 0,
    rate_source: 'assumption',
  }
}

/**
 * Recommend operators for a departing airport from Network → Recommend lists.
 * No price / time / radar scoring — rank order from the list only.
 */
export function recommendCandidatesForDeparture(opts: {
  departureIcao: string
  preferredClientName?: string | null
  limit?: number
}): DepartureRecommendResult {
  const pick = pickRecommendListForDeparture(
    opts.departureIcao,
    listBasePriorityLists(),
    { preferredClientName: opts.preferredClientName },
  )
  if (!pick.list || !pick.entries.length) {
    return {
      candidates: [],
      match: pick.match,
      listId: pick.list?.id ?? null,
      listLabel: pick.list
        ? `${pick.list.client_name}${pick.list.base_icao ? ` · ${pick.list.base_icao}` : ''}`
        : null,
      baseIcao: pick.list?.base_icao ?? null,
      distanceNm: pick.distanceNm,
    }
  }

  const baseLabel =
    pick.match === 'exact'
      ? `Recommend list ${pick.list.base_icao}`
      : `Closest Recommend base ${pick.list.base_icao}${
          pick.distanceNm != null ? ` · ${pick.distanceNm} NM` : ''
        }`

  const ops = listDeskOperators()
  const byId = new Map(ops.map((o) => [o.id, o]))
  const limit = Math.max(1, opts.limit ?? 24)
  const candidates: Candidate[] = []

  for (const entry of pick.entries) {
    if (candidates.length >= limit) break
    const opId = priorityEntryOperatorId(entry)
    const network = opId ? byId.get(opId) : undefined
    if (network) {
      const cand = candidateFromDeskHit(toDeskOperatorHit(network))
      cand.reasoning = [
        baseLabel,
        `Rank #${entry.rank} · ${entry.company_name}`,
      ]
      candidates.push(cand)
      continue
    }
    const searched = searchDeskOperators(entry.company_name, 1)[0]
    if (searched) {
      const cand = candidateFromDeskHit(searched)
      cand.reasoning = [
        baseLabel,
        `Rank #${entry.rank} · matched ${entry.company_name}`,
      ]
      candidates.push(cand)
      continue
    }
    candidates.push(
      stubCandidate({
        operatorId: opId || `priority-${entry.id}`,
        name: entry.company_name,
        reasoning: [baseLabel, `Rank #${entry.rank} · not linked to network yet`],
      }),
    )
  }

  return {
    candidates,
    match: pick.match,
    listId: pick.list.id,
    listLabel: `${pick.list.client_name}${
      pick.list.base_icao ? ` · ${pick.list.base_icao}` : ''
    }`,
    baseIcao: pick.list.base_icao,
    distanceNm: pick.distanceNm,
  }
}
