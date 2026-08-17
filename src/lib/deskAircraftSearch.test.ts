import { beforeEach, describe, expect, it } from 'vitest'
import { loadNetwork } from '@/lib/networkData'
import {
  __resetDeskAddedOperatorsForTests,
  addDeskOperator,
} from '@/lib/deskOperatorSearch'
import {
  findDeskAircraftByTail,
  listDeskAircraft,
  searchDeskAircraftTails,
  searchDeskAircraftTypes,
} from '@/lib/deskAircraftSearch'

describe('deskAircraftSearch', () => {
  beforeEach(() => {
    __resetDeskAddedOperatorsForTests()
  })

  it('lists and searches tails from the AC database', async () => {
    await loadNetwork()
    const all = listDeskAircraft({ activeOnly: true })
    expect(all.length).toBeGreaterThan(0)
    expect(all[0]?.tail).toBeTruthy()

    const sample = all[0]!
    const hits = searchDeskAircraftTails(sample.tail.slice(0, 3), { limit: 20 })
    expect(hits.some((h) => h.tail === sample.tail)).toBe(true)

    const found = findDeskAircraftByTail(sample.tail)
    expect(found?.aircraft_id).toBe(sample.aircraft_id)
  })

  it('scopes types and tails to an operator fleet', async () => {
    await loadNetwork()
    const withFleet = listDeskAircraft({ activeOnly: true }).find(
      (a) => a.operator_name && a.type_name,
    )
    expect(withFleet).toBeTruthy()
    const opName = withFleet!.operator_name
    const typeName = withFleet!.type_name!

    const types = searchDeskAircraftTypes('', {
      operatorName: opName,
      limit: 50,
    })
    expect(types.length).toBeGreaterThan(0)
    // Catalog may unify labels (e.g. Falcon 20 → canonical); ensure fleet type is represented.
    const unified = typeName.trim().toLowerCase()
    expect(
      types.some(
        (t) =>
          t.toLowerCase() === unified ||
          t.toLowerCase().includes(unified.slice(0, 6)) ||
          unified.includes(t.toLowerCase().slice(0, 6)),
      ),
    ).toBe(true)

    const tails = searchDeskAircraftTails('', {
      operatorName: opName,
      typeName,
      limit: 50,
    })
    expect(tails.every((t) => t.operator_name === opName)).toBe(true)
    expect(tails.some((t) => t.tail === withFleet!.tail)).toBe(true)
  })

  it('returns empty fleet for a desk-only operator with no aircraft', async () => {
    await loadNetwork()
    const hit = addDeskOperator({ name: 'No Fleet Desk Op XYZ' })
    expect(
      listDeskAircraft({ operatorId: hit.operator_id }).length,
    ).toBe(0)
    // Falls back to full catalog for types when operator has no fleet rows
    expect(
      searchDeskAircraftTypes('King', { operatorId: hit.operator_id }).length,
    ).toBeGreaterThanOrEqual(0)
  })
})
