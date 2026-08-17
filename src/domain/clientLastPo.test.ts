import { describe, expect, it } from 'vitest'
import {
  normalizeClientPo,
  pickLatestClientPo,
} from './clientLastPo'

describe('normalizeClientPo', () => {
  it('strips PO # prefixes', () => {
    expect(normalizeClientPo('PO #00355')).toBe('00355')
    expect(normalizeClientPo('PO 42')).toBe('42')
    expect(normalizeClientPo('  EDW0042 ')).toBe('EDW0042')
  })
})

describe('pickLatestClientPo', () => {
  it('returns null when empty', () => {
    expect(pickLatestClientPo([])).toBeNull()
    expect(pickLatestClientPo([{ po: '  ' }])).toBeNull()
  })

  it('prefers the most recent dated PO over a higher older number', () => {
    const picked = pickLatestClientPo([
      { po: 'PO #262011', sortKey: '2024-12-08' },
      { po: 'PO #00355', sortKey: '2026-08-01' },
      { po: 'PO #00352', sortKey: '2026-07-15' },
    ])
    expect(picked?.lastPo).toBe('00355')
    expect(picked?.numeric).toBe(355)
  })

  it('falls back to highest numeric when no dates', () => {
    const picked = pickLatestClientPo([
      { po: 'PO #00350' },
      { po: 'PO #00355' },
      { po: 'PO #00352' },
    ])
    expect(picked?.lastPo).toBe('00355')
  })

  it('uses numeric as tie-break for equal dates', () => {
    const picked = pickLatestClientPo([
      { po: '100', sortKey: '2026-06-01', tripRef: 'T-1' },
      { po: '200', sortKey: '2026-06-01', tripRef: 'T-2' },
    ])
    expect(picked?.lastPo).toBe('200')
    expect(picked?.tripRef).toBe('T-2')
  })

  it('prefers a numeric candidate over a non-numeric one without dates', () => {
    const picked = pickLatestClientPo([
      { po: 'CUSTOM' },
      { po: '00007' },
    ])
    expect(picked?.lastPo).toBe('00007')
  })
})
