import { describe, expect, it } from 'vitest'
import {
  extractTailsFromText,
  normalizeD085Rows,
  normalizeTail,
} from './d085Parse'

describe('d085Parse', () => {
  it('normalizes tails', () => {
    expect(normalizeTail('n123ab')).toBe('N123AB')
    expect(normalizeTail('N-456CD')).toBe('N456CD')
  })

  it('extracts N-numbers from listing text', () => {
    const text = 'Aircraft: N123AB King Air\nN456CD Cessna 208\nspare N789EF'
    expect(extractTailsFromText(text)).toEqual(
      expect.arrayContaining(['N123AB', 'N456CD', 'N789EF']),
    )
  })

  it('flags unknown types for review', () => {
    const rows = normalizeD085Rows(
      [
        { tail: 'N111AA', type_name: 'King Air 200' },
        { tail: 'N222BB', type_name: 'Mystery Jet' },
      ],
      new Set(['King Air 200', 'Cessna 208']),
    )
    expect(rows[0]?.matched).toBe(true)
    expect(rows[1]?.matched).toBe(false)
    expect(rows[1]?.conflict).toMatch(/Unknown type/)
  })
})
