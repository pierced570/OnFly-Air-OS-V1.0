import { describe, expect, it } from 'vitest'
import {
  categorizeTafPeriod,
  ceilingFt,
  flightCategoryFromValues,
  parseFlightCategory,
  parseVisSm,
  worstFlightCategory,
} from './flightCategory'

describe('flightCategory', () => {
  it('maps FAA thresholds', () => {
    expect(flightCategoryFromValues(10, 5000)).toBe('VFR')
    expect(flightCategoryFromValues(4, 2000)).toBe('MVFR')
    expect(flightCategoryFromValues(2, 800)).toBe('IFR')
    expect(flightCategoryFromValues(0.5, 400)).toBe('LIFR')
    // vis alone can force LIFR
    expect(flightCategoryFromValues(0.75, 10000)).toBe('LIFR')
    // ceiling alone can force IFR
    expect(flightCategoryFromValues(10, 700)).toBe('IFR')
  })

  it('parses visibility strings', () => {
    expect(parseVisSm(2.5)).toBe(2.5)
    expect(parseVisSm('P6')).toBe(6)
    expect(parseVisSm('1/2')).toBe(0.5)
    expect(parseVisSm('2 1/2')).toBe(2.5)
  })

  it('ceiling from BKN/OVC', () => {
    expect(
      ceilingFt([
        { cover: 'FEW', base: 1000 },
        { cover: 'BKN', base: 2500 },
        { cover: 'OVC', base: 4000 },
      ]),
    ).toBe(2500)
  })

  it('categorizes TAF period and picks worst', () => {
    const p = categorizeTafPeriod({
      timeFromSec: 1_700_000_000,
      timeToSec: 1_700_003_600,
      fcstChange: 'TEMPO',
      visib: 2,
      clouds: [{ cover: 'BKN', base: 800 }],
      wxString: 'FU',
    })
    expect(p.flightCat).toBe('IFR')
    expect(p.label).toBe('TEMPO')
    expect(worstFlightCategory(['VFR', 'MVFR', p.flightCat, 'LIFR'])).toBe(
      'LIFR',
    )
    expect(parseFlightCategory('mvfr')).toBe('MVFR')
  })
})
