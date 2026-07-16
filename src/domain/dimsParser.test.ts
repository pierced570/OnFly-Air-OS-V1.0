import { describe, expect, it } from 'vitest'
import { parseDims, totalWeightLbs } from './dimsParser'

describe('parseDims', () => {
  it('parses "3 skids 48x40x60 @ 800ea"', () => {
    const r = parseDims('3 skids 48x40x60 @ 800ea')
    expect(r.pieces).toHaveLength(1)
    expect(r.pieces[0]).toMatchObject({
      count: 3,
      l_in: 48,
      w_in: 40,
      h_in: 60,
      weight_lbs: 800,
    })
    expect(totalWeightLbs(r.pieces)).toBe(2400)
    expect(r.confidence).toBe('high')
  })

  it('parses "2 crates 30x30x24 250 lbs each"', () => {
    const r = parseDims('2 crates 30x30x24 250 lbs each')
    expect(r.pieces[0]).toMatchObject({
      count: 2,
      l_in: 30,
      w_in: 30,
      h_in: 24,
      weight_lbs: 250,
    })
  })
})
