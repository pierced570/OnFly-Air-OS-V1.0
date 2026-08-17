import { beforeEach, describe, expect, it } from 'vitest'
import { loadNetwork } from '@/lib/networkData'
import {
  __resetDeskAddedOperatorsForTests,
  addDeskOperator,
  candidateFromDeskHit,
  searchDeskOperators,
} from '@/lib/deskOperatorSearch'

describe('deskOperatorSearch', () => {
  beforeEach(() => {
    __resetDeskAddedOperatorsForTests()
  })

  it('searches fixture operators by name', async () => {
    await loadNetwork()
    const hits = searchDeskOperators('NORTH', 5)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.name).toMatch(/NORTH/i)
    expect(hits[0]).toHaveProperty('base_icao')
    expect(hits[0]).toHaveProperty('contact_email')
    expect(hits[0]).toHaveProperty('contact_cell')
    expect(hits[0]?.quote_link_channel).toBe('both')
  })

  it('lists operators alphabetically when query is empty', async () => {
    await loadNetwork()
    const hits = searchDeskOperators('', 10)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThanOrEqual(10)
    const names = hits.map((h) => h.name)
    const sorted = [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
    expect(names).toEqual(sorted)
  })

  it('adds a new operator and finds them', async () => {
    await loadNetwork()
    const hit = addDeskOperator({
      name: 'Desk Test Charter',
      base_icao: 'KCVG',
      contact_email: 'ops@desk-test.example',
      contact_cell: '5135550100',
      quote_link_channel: 'email',
    })
    expect(hit.contact_email).toBe('ops@desk-test.example')
    expect(hit.quote_link_channel).toBe('email')
    const found = searchDeskOperators('Desk Test', 5)
    expect(found.some((h) => h.operator_id === hit.operator_id)).toBe(true)
    const cand = candidateFromDeskHit(hit)
    expect(cand.operator_name).toBe('Desk Test Charter')
    expect(cand.tail).toBe('TBD')
  })
})
