import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetBasePriorityForTests,
  confirmPriorityMatch,
  listBasePriorityLists,
  movePriorityEntry,
} from './basePriorityStore'

describe('basePriorityStore', () => {
  beforeEach(() => {
    __resetBasePriorityForTests()
  })

  it('loads fixture lists and confirms a match', () => {
    const lists = listBasePriorityLists()
    expect(lists.length).toBeGreaterThanOrEqual(11)
    const psa = lists.find((l) => l.client_name === 'PSA' && l.base_icao === 'KCAK')
    expect(psa).toBeTruthy()
    const entry = psa!.entries[0]!
    expect(entry.operator_id).toBeNull()
    if (entry.suggested_operator_id) {
      confirmPriorityMatch(
        psa!.id,
        entry.id,
        entry.suggested_operator_id,
        entry.match_candidate_name || entry.company_name,
      )
      const updated = listBasePriorityLists().find((l) => l.id === psa!.id)
      expect(updated?.entries[0]?.match_status).toBe('confirmed')
      expect(updated?.entries[0]?.operator_id).toBe(entry.suggested_operator_id)
    }
  })

  it('reorders entries', () => {
    const psa = listBasePriorityLists().find(
      (l) => l.client_name === 'PSA' && l.base_icao === 'KCAK',
    )!
    const firstId = psa.entries[0]!.id
    const secondId = psa.entries[1]!.id
    movePriorityEntry(psa.id, secondId, -1)
    const next = listBasePriorityLists().find((l) => l.id === psa.id)!
    expect(next.entries[0]!.id).toBe(secondId)
    expect(next.entries[1]!.id).toBe(firstId)
  })
})
