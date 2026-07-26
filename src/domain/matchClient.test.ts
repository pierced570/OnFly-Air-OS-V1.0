import { describe, expect, it } from 'vitest'
import { bestClientMatch, matchClients } from './matchClient'

const directory = [
  { id: '1', name: 'PSA Airlines' },
  { id: '2', name: 'Acme MRO' },
  { id: '3', name: 'Edwards Aviation' },
  { id: '4', name: 'PSA' },
]

describe('matchClients', () => {
  it('exact and prefix match PSA', () => {
    const hits = matchClients('PSA', directory)
    expect(hits[0]?.id).toBe('4')
    expect(hits[0]?.kind).toBe('exact')
    expect(hits.some((h) => h.id === '1')).toBe(true)
  })

  it('bestClientMatch auto-picks exact', () => {
    expect(bestClientMatch('psa', directory)?.id).toBe('4')
    expect(bestClientMatch('Acme', directory)?.kind).toBe('prefix')
  })

  it('returns empty for blank query', () => {
    expect(matchClients('  ', directory)).toEqual([])
  })
})
