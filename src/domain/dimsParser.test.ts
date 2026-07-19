import { describe, expect, it } from 'vitest'
import { formatPieceDims, parseDims, totalWeightLbs } from './dimsParser'

describe('parseDims', () => {
  it('parses "3 skids 48x40x60 @ 800ea" as inches by default', () => {
    const r = parseDims('3 skids 48x40x60 @ 800ea')
    expect(r.pieces).toHaveLength(1)
    expect(r.pieces[0]).toMatchObject({
      count: 3,
      l_in: 48,
      w_in: 40,
      h_in: 60,
      weight_lbs: 800,
      input_unit: 'in',
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

  it('converts feet to inches when unit is ft', () => {
    const r = parseDims('3 skids 4x3x5 @ 800ea', { unit: 'ft' })
    expect(r.pieces[0]).toMatchObject({
      count: 3,
      l_in: 48,
      w_in: 36,
      h_in: 60,
      input_unit: 'ft',
    })
    expect(formatPieceDims(r.pieces[0]!, 'ft')).toContain('ft')
    expect(formatPieceDims(r.pieces[0]!, 'ft')).toContain('48×36×60 in')
  })

  it('honors an explicit ft suffix over the toggle', () => {
    const r = parseDims('1 skid 4x4x4 ft @ 500ea', { unit: 'in' })
    expect(r.pieces[0]?.l_in).toBe(48)
    expect(r.pieces[0]?.input_unit).toBe('ft')
  })

  it('honors an explicit in suffix over a feet toggle', () => {
    const r = parseDims('1 skid 48x40x60 in @ 500ea', { unit: 'ft' })
    expect(r.pieces[0]?.l_in).toBe(48)
    expect(r.pieces[0]?.input_unit).toBe('in')
  })
})
