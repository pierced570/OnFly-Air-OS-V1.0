/**
 * Group network operators by US state of their base ICAO.
 * Pure TypeScript — UI lives in Network → Operators → By state.
 */

import { lookupAirport } from '@/domain/airports'
import {
  neighboringStates,
  normalizeUsStateCode,
  usStateDisplayName,
} from '@/domain/usStateNeighbors'

export type OperatorStateRef = {
  id: string
  name: string
  base_icao: string | null
  aircraft_count?: number
}

export type OperatorInState = {
  id: string
  name: string
  base_icao: string
  state: string
  city: string
  aircraft_count: number
}

export type StateOperatorBucket = {
  state: string
  label: string
  operators: OperatorInState[]
}

export type NeighborStateSuggestion = {
  state: string
  label: string
  operator_count: number
  /** True when this neighbor has at least one operator in the network. */
  has_operators: boolean
}

export type OperatorsByStateView = {
  selected: StateOperatorBucket | null
  /** All states that have ≥1 operator, sorted by count desc then code. */
  states_with_operators: Array<{
    state: string
    label: string
    operator_count: number
  }>
  /** Contiguous neighbors of the selected state (with counts). */
  nearby: NeighborStateSuggestion[]
  /** Operators whose base ICAO has no resolvable US state. */
  unknown_count: number
}

/** Resolve USPS state for an operator via base airport catalog. */
export function stateForOperatorBase(
  baseIcao: string | null | undefined,
): { state: string; city: string; icao: string } | null {
  const icao = String(baseIcao ?? '')
    .trim()
    .toUpperCase()
  if (!icao) return null
  const ap = lookupAirport(icao)
  const state = normalizeUsStateCode(ap?.state)
  if (!state || !/^[A-Z]{2}$/.test(state)) return null
  return {
    state,
    city: ap?.city?.trim() || '',
    icao: ap?.icao ?? icao,
  }
}

export function groupOperatorsByState(
  operators: readonly OperatorStateRef[],
): {
  byState: Map<string, OperatorInState[]>
  unknown: OperatorStateRef[]
} {
  const byState = new Map<string, OperatorInState[]>()
  const unknown: OperatorStateRef[] = []

  for (const op of operators) {
    const resolved = stateForOperatorBase(op.base_icao)
    if (!resolved) {
      unknown.push(op)
      continue
    }
    const row: OperatorInState = {
      id: op.id,
      name: op.name,
      base_icao: resolved.icao,
      state: resolved.state,
      city: resolved.city,
      aircraft_count: op.aircraft_count ?? 0,
    }
    const list = byState.get(resolved.state)
    if (list) list.push(row)
    else byState.set(resolved.state, [row])
  }

  for (const list of byState.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  return { byState, unknown }
}

export function buildOperatorsByStateView(
  operators: readonly OperatorStateRef[],
  selectedStateRaw: string | null | undefined,
): OperatorsByStateView {
  const { byState, unknown } = groupOperatorsByState(operators)

  const states_with_operators = [...byState.entries()]
    .map(([state, ops]) => ({
      state,
      label: usStateDisplayName(state),
      operator_count: ops.length,
    }))
    .sort(
      (a, b) =>
        b.operator_count - a.operator_count ||
        a.state.localeCompare(b.state),
    )

  const selectedCode = normalizeUsStateCode(selectedStateRaw)
  const selectedOps = selectedCode ? byState.get(selectedCode) : undefined
  const selected: StateOperatorBucket | null =
    selectedCode && selectedOps
      ? {
          state: selectedCode,
          label: usStateDisplayName(selectedCode),
          operators: selectedOps,
        }
      : selectedCode
        ? {
            state: selectedCode,
            label: usStateDisplayName(selectedCode),
            operators: [],
          }
        : null

  const nearby: NeighborStateSuggestion[] = selectedCode
    ? neighboringStates(selectedCode).map((state) => {
        const ops = byState.get(state)
        const operator_count = ops?.length ?? 0
        return {
          state,
          label: usStateDisplayName(state),
          operator_count,
          has_operators: operator_count > 0,
        }
      })
    : []

  // Prefer neighbors that already have operators in the list.
  nearby.sort(
    (a, b) =>
      Number(b.has_operators) - Number(a.has_operators) ||
      b.operator_count - a.operator_count ||
      a.state.localeCompare(b.state),
  )

  return {
    selected,
    states_with_operators,
    nearby,
    unknown_count: unknown.length,
  }
}
