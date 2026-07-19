import { describe, expect, it } from 'vitest'
import { suggestNextPo } from './clientStore'

describe('suggestNextPo', () => {
  it('starts at 00001 when empty', () => {
    expect(suggestNextPo(null)).toBe('00001')
    expect(suggestNextPo('')).toBe('00001')
  })

  it('increments zero-padded numbers', () => {
    expect(suggestNextPo('00001')).toBe('00002')
    expect(suggestNextPo('00099')).toBe('00100')
  })

  it('bumps trailing digits', () => {
    expect(suggestNextPo('PSA-12')).toBe('PSA-13')
  })
})
