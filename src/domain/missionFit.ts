/**
 * Mission fit scoring — cargo dims + payload + proximity.
 * Flag-don't-exclude: unknown door/payload keeps the candidate with a penalty.
 * Pure TS; no React / Supabase.
 */

import type { Piece } from '@/domain/dimsParser'
import { maxPieceDims, totalWeightLbs } from '@/domain/dimsParser'
import { haversineNm } from '@/domain/geo'

export type DoorFit = 'fits' | 'no_fit' | 'unknown'

export type MissionAircraft = {
  id: string
  operator_id: string
  operator_name: string
  tail: string
  type_name: string | null
  category: string | null
  engines: string | null
  base_icao: string | null
  base?: { lat: number; lon: number } | null
  max_payload_lbs: number | null
  door_w_in: number | null
  door_h_in: number | null
  mtow_lbs?: number | null
}

export type MissionFitScore = {
  aircraft_id: string
  operator_id: string
  operator_name: string
  tail: string
  type_name: string | null
  door: DoorFit
  payload_ok: boolean | null
  nm_from_origin: number | null
  /** Lower = better */
  score: number
  reasons: string[]
  hard_fail: boolean
}

export type OperatorMissionFit = {
  operator_id: string
  operator_name: string
  base_icao: string | null
  nm_from_origin: number | null
  best: MissionFitScore
  fit_count: number
  unknown_count: number
  no_fit_count: number
  label?: 'best_fit' | 'closest' | 'best_payload'
}

const PAYLOAD_FACTOR = 0.85

/** Face-fit through cargo door (same rule as routing engine). */
export function doorFitsPiece(
  doorW: number | null,
  doorH: number | null,
  piece: { l_in: number; w_in: number; h_in: number },
): DoorFit {
  if (doorW == null || doorH == null) return 'unknown'
  const dims = [piece.l_in, piece.w_in, piece.h_in].sort((a, b) => a - b)
  const faces: Array<[number, number]> = [
    [dims[0]!, dims[1]!],
    [dims[0]!, dims[2]!],
    [dims[1]!, dims[2]!],
  ]
  for (const [a, b] of faces) {
    if (a <= doorW * 1.05 && b <= doorH * 1.05) return 'fits'
    if (a <= doorH * 1.05 && b <= doorW * 1.05) return 'fits'
  }
  return 'no_fit'
}

export function scoreAircraftForMission(
  ac: MissionAircraft,
  pieces: Piece[],
  origin?: { lat: number; lon: number } | null,
): MissionFitScore {
  const reasons: string[] = []
  let score = 0
  let hard_fail = false
  const weight = totalWeightLbs(pieces)
  const maxDims = pieces.length
    ? maxPieceDims(pieces)
    : { l_in: 0, w_in: 0, h_in: 0 }

  const door =
    pieces.length > 0
      ? doorFitsPiece(ac.door_w_in, ac.door_h_in, maxDims)
      : 'unknown'

  if (door === 'fits') {
    score -= 2
    reasons.push('door clears largest piece')
  } else if (door === 'no_fit') {
    hard_fail = true
    score += 50
    reasons.push('door too small for dims')
  } else if (pieces.length > 0) {
    score += 8
    reasons.push('door dims unknown — verify')
  }

  let payload_ok: boolean | null = null
  if (weight > 0) {
    if (ac.max_payload_lbs != null) {
      const avail = ac.max_payload_lbs * PAYLOAD_FACTOR
      payload_ok = weight <= avail
      if (payload_ok) {
        score -= 1.5
        reasons.push(`payload OK (${weight} / ${Math.round(avail)} lbs)`)
      } else {
        hard_fail = true
        score += 40
        reasons.push(`over payload (${weight} > ${Math.round(avail)} lbs)`)
      }
    } else {
      payload_ok = null
      score += 6
      reasons.push('payload unknown')
    }
  }

  let nm_from_origin: number | null = null
  if (origin && ac.base) {
    nm_from_origin = Math.round(
      haversineNm(origin.lat, origin.lon, ac.base.lat, ac.base.lon),
    )
    // Distance dominates when door/payload are OK — closer wins
    score += nm_from_origin / 40
    reasons.push(`${nm_from_origin} NM from origin`)
  } else if (origin) {
    score += 15
    reasons.push('base location unknown')
  }

  // Prefer freighter / turboprop / multi when cargo is heavy or bulky
  if (weight >= 800 || maxDims.l_in >= 48) {
    const cat = `${ac.category ?? ''} ${ac.engines ?? ''} ${ac.type_name ?? ''}`.toLowerCase()
    if (/cargo|king air|caravan|metro|navajo|turboprop/.test(cat)) {
      score -= 1
      reasons.push('type suited to freight')
    }
    if (/single piston|cirrus|sr22/.test(cat) && maxDims.l_in >= 40) {
      score += 5
      reasons.push('light single — tight for skids')
    }
  }

  return {
    aircraft_id: ac.id,
    operator_id: ac.operator_id,
    operator_name: ac.operator_name,
    tail: ac.tail,
    type_name: ac.type_name,
    door,
    payload_ok,
    nm_from_origin,
    score,
    reasons,
    hard_fail,
  }
}

/** Best aircraft per operator, ranked for the mission. */
export function rankOperatorsForMission(
  fleet: MissionAircraft[],
  pieces: Piece[],
  origin?: { lat: number; lon: number } | null,
): OperatorMissionFit[] {
  const byOp = new Map<string, MissionFitScore[]>()
  for (const ac of fleet) {
    const s = scoreAircraftForMission(ac, pieces, origin)
    const list = byOp.get(ac.operator_id) ?? []
    list.push(s)
    byOp.set(ac.operator_id, list)
  }

  const rows: OperatorMissionFit[] = []
  for (const [, scores] of byOp) {
    const sorted = [...scores].sort((a, b) => a.score - b.score)
    const best = sorted[0]!
    const baseIcao =
      fleet.find((a) => a.id === best.aircraft_id)?.base_icao ?? null
    rows.push({
      operator_id: best.operator_id,
      operator_name: best.operator_name,
      base_icao: baseIcao,
      nm_from_origin: best.nm_from_origin,
      best,
      fit_count: scores.filter((s) => s.door === 'fits' && !s.hard_fail).length,
      unknown_count: scores.filter((s) => s.door === 'unknown').length,
      no_fit_count: scores.filter((s) => s.door === 'no_fit' || s.hard_fail)
        .length,
    })
  }

  rows.sort((a, b) => {
    // Viable first
    const ah = a.best.hard_fail ? 1 : 0
    const bh = b.best.hard_fail ? 1 : 0
    if (ah !== bh) return ah - bh
    return a.best.score - b.best.score
  })

  // Labels
  const viable = rows.filter((r) => !r.best.hard_fail)
  if (viable[0]) viable[0].label = 'best_fit'
  const closest = [...viable]
    .filter((r) => r.nm_from_origin != null)
    .sort((a, b) => (a.nm_from_origin ?? 9e9) - (b.nm_from_origin ?? 9e9))[0]
  if (closest && closest.label !== 'best_fit') closest.label = 'closest'
  const payloadBest = [...viable]
    .filter((r) => r.best.payload_ok === true)
    .sort((a, b) => a.best.score - b.best.score)[0]
  if (
    payloadBest &&
    !payloadBest.label &&
    payloadBest.operator_id !== viable[0]?.operator_id
  ) {
    payloadBest.label = 'best_payload'
  }

  return rows
}
