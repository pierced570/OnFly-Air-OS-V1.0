/**
 * Group network operators by base ICAO.
 * Pure TypeScript — UI lives in Network → Operators → By bases.
 */

import { lookupAirport } from '@/domain/airports'

export type OperatorBaseRef = {
  id: string
  name: string
  base_icao: string | null
  aircraft_count?: number
}

export type OperatorAtBase = {
  id: string
  name: string
  base_icao: string
  city: string
  state: string
  aircraft_count: number
}

export type BaseOperatorBucket = {
  icao: string
  label: string
  city: string
  state: string
  operators: OperatorAtBase[]
}

export type OperatorsByBaseView = {
  selected: BaseOperatorBucket | null
  bases: Array<{
    icao: string
    label: string
    city: string
    state: string
    operator_count: number
  }>
  unknown_count: number
}

function baseLabel(icao: string, city: string, state: string): string {
  const place = [city, state].filter(Boolean).join(', ')
  return place ? `${icao} · ${place}` : icao
}

export function groupOperatorsByBase(
  operators: readonly OperatorBaseRef[],
): {
  byBase: Map<string, OperatorAtBase[]>
  unknown: OperatorBaseRef[]
} {
  const byBase = new Map<string, OperatorAtBase[]>()
  const unknown: OperatorBaseRef[] = []

  for (const op of operators) {
    const icao = String(op.base_icao ?? '')
      .trim()
      .toUpperCase()
    if (!icao) {
      unknown.push(op)
      continue
    }
    const ap = lookupAirport(icao)
    const resolved = ap?.icao ?? icao
    const row: OperatorAtBase = {
      id: op.id,
      name: op.name,
      base_icao: resolved,
      city: ap?.city?.trim() || '',
      state: ap?.state?.trim().toUpperCase() || '',
      aircraft_count: op.aircraft_count ?? 0,
    }
    const list = byBase.get(resolved)
    if (list) list.push(row)
    else byBase.set(resolved, [row])
  }

  for (const list of byBase.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  return { byBase, unknown }
}

export function buildOperatorsByBaseView(
  operators: readonly OperatorBaseRef[],
  selectedIcaoRaw: string | null | undefined,
): OperatorsByBaseView {
  const { byBase, unknown } = groupOperatorsByBase(operators)

  const bases = [...byBase.entries()]
    .map(([icao, ops]) => {
      const sample = ops[0]!
      return {
        icao,
        label: baseLabel(icao, sample.city, sample.state),
        city: sample.city,
        state: sample.state,
        operator_count: ops.length,
      }
    })
    .sort(
      (a, b) =>
        b.operator_count - a.operator_count || a.icao.localeCompare(b.icao),
    )

  const selectedCode = String(selectedIcaoRaw ?? '')
    .trim()
    .toUpperCase()
  const selectedOps = selectedCode ? byBase.get(selectedCode) : undefined
  const selected: BaseOperatorBucket | null =
    selectedCode && selectedOps
      ? {
          icao: selectedCode,
          label: baseLabel(
            selectedCode,
            selectedOps[0]?.city ?? '',
            selectedOps[0]?.state ?? '',
          ),
          city: selectedOps[0]?.city ?? '',
          state: selectedOps[0]?.state ?? '',
          operators: selectedOps,
        }
      : selectedCode
        ? (() => {
            const ap = lookupAirport(selectedCode)
            return {
              icao: selectedCode,
              label: baseLabel(
                selectedCode,
                ap?.city ?? '',
                ap?.state ?? '',
              ),
              city: ap?.city ?? '',
              state: (ap?.state ?? '').toUpperCase(),
              operators: [],
            }
          })()
        : null

  return {
    selected,
    bases,
    unknown_count: unknown.length,
  }
}
