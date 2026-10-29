import { describe, expect, it } from 'vitest'
import { parseTailGroup } from './radarTailGroup'

describe('parseTailGroup', () => {
  it('parses mixed separators and dedupes', () => {
    expect(parseTailGroup('N159FM, n123ab\nN159FM; N999ZZ')).toEqual([
      'N159FM',
      'N123AB',
      'N999ZZ',
    ])
  })

  it('returns empty for blank input', () => {
    expect(parseTailGroup('  \n')).toEqual([])
    expect(parseTailGroup(null)).toEqual([])
  })
})
