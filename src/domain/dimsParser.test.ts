import { describe, expect, it } from 'vitest'
import {
  composeDimsLine,
  composeDimsLines,
  formatPieceDims,
  parseDims,
  parseDimsLines,
  parseDimsTriple,
  totalWeightLbs,
} from './dimsParser'

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

describe('dims triple helpers', () => {
  it('parseDimsTriple reads qty L×W×H weight', () => {
    expect(parseDimsTriple('2 skids 48x40x60 @ 800ea')).toMatchObject({
      count: 2,
      l: '48',
      w: '40',
      h: '60',
      weight: '800',
    })
  })

  it('composeDimsLine round-trips into parseDims', () => {
    const line = composeDimsLine({
      count: 3,
      l: '48',
      w: '40',
      h: '60',
      weightLbs: 800,
      unit: 'in',
    })
    const r = parseDims(line)
    expect(r.pieces[0]).toMatchObject({
      count: 3,
      l_in: 48,
      w_in: 40,
      h_in: 60,
      weight_lbs: 800,
    })
  })

  it('composeDimsLines joins multiple skids for parseDims', () => {
    const text = composeDimsLines(
      [
        { count: '2', l: '48', w: '40', h: '60', weight: '800' },
        { count: '1', l: '36', w: '36', h: '36', weight: '200' },
      ],
      'in',
    )
    expect(text).toContain(';')
    const r = parseDims(text)
    expect(r.pieces).toHaveLength(2)
    expect(r.pieces[0]).toMatchObject({ count: 2, l_in: 48, weight_lbs: 800 })
    expect(r.pieces[1]).toMatchObject({ count: 1, l_in: 36, weight_lbs: 200 })
    expect(totalWeightLbs(r.pieces)).toBe(1800)
  })

  it('parseDimsLines splits cargo_notes into skid rows', () => {
    const rows = parseDimsLines(
      '2 skids 48x40x60 @ 800ea; 1 skid 36x36x36 @ 200ea',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      count: '2',
      l: '48',
      w: '40',
      h: '60',
      weight: '800',
    })
    expect(rows[1]).toMatchObject({
      count: '1',
      l: '36',
      w: '36',
      h: '36',
      weight: '200',
    })
  })
})
