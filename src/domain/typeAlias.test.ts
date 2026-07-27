import { describe, expect, it } from 'vitest'
import {
  matchAircraftType,
  normalizeAircraftType,
} from './typeAlias'

describe('normalizeAircraftType', () => {
  it('unifies Baron / Barron / BE-58', () => {
    expect(normalizeAircraftType('barron')).toBe('Baron 58')
    expect(normalizeAircraftType('Baron')).toBe('Baron 58')
    expect(normalizeAircraftType('Baron 58')).toBe('Baron 58')
    expect(normalizeAircraftType('BE-58')).toBe('Baron 58')
    expect(normalizeAircraftType('B58')).toBe('Baron 58')
  })

  it('unifies King Air 90 / KA 90 / C90', () => {
    expect(normalizeAircraftType('King Air 90')).toBe('King Air 90')
    expect(normalizeAircraftType('KA 90')).toBe('King Air 90')
    expect(normalizeAircraftType('KA90')).toBe('King Air 90')
    expect(normalizeAircraftType('C90')).toBe('King Air 90')
    expect(normalizeAircraftType('C-90')).toBe('King Air 90')
    expect(normalizeAircraftType('Beechcraft King Air C90A')).toBe('King Air 90')
    // Ambiguous family name — do not invent a model
    expect(normalizeAircraftType('king air')).toBe('King Air')
    expect(normalizeAircraftType('King Air')).not.toBe('King Air 90')
    expect(normalizeAircraftType('King Air')).not.toBe('King Air 200')
  })

  it('unifies King Air 200 / KA200 / B200', () => {
    expect(normalizeAircraftType('KA200')).toBe('King Air 200')
    expect(normalizeAircraftType('B200')).toBe('King Air 200')
    expect(normalizeAircraftType('King Air 200')).toBe('King Air 200')
  })

  it('unifies Cessna 310 / C310 and Caravan', () => {
    expect(normalizeAircraftType('C310')).toBe('Cessna 310')
    expect(normalizeAircraftType('c-310')).toBe('Cessna 310')
    expect(normalizeAircraftType('Caravan')).toBe('Cessna Caravan')
    expect(normalizeAircraftType('Grand Caravan')).toBe(
      'Cessna 208B Grand Caravan',
    )
  })

  it('unifies CJ3 / Citation CJ3 and PC-12', () => {
    expect(normalizeAircraftType('CJ3')).toBe('Citation CJ3')
    expect(normalizeAircraftType('Citation CJ3')).toBe('Citation CJ3')
    expect(normalizeAircraftType('PC-12')).toBe('Pilatus PC-12')
    expect(normalizeAircraftType('pc12')).toBe('Pilatus PC-12')
  })

  it('fuzzy-matches against a catalog label', () => {
    const catalog = ['Citation CJ3', 'King Air 200', 'Baron 58']
    const m = matchAircraftType('citatio cj3', catalog)
    expect(m.canonical).toBe('Citation CJ3')
    expect(m.kind === 'fuzzy' || m.kind === 'compact' || m.kind === 'alias').toBe(
      true,
    )
  })

  it('prefers catalog spelling when alias targets a near label', () => {
    const catalog = ['Beechcraft Baron 58']
    // Alias maps to Baron 58; catalog exact-ish should win if scored high
    const m = matchAircraftType('B58', [...catalog, 'Baron 58'])
    expect(m.canonical).toMatch(/Baron 58/)
  })

  it('returns empty for blank input', () => {
    expect(normalizeAircraftType('  ')).toBe('')
  })
})
