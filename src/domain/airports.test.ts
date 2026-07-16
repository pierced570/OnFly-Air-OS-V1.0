import { describe, expect, it } from 'vitest'
import {
  formatAirportShort,
  lookupAirport,
  searchAirports,
} from './airports'

describe('airports catalog', () => {
  it('includes city and state on lookup', () => {
    const a = lookupAirport('KCAK')
    expect(a?.city).toBe('Akron')
    expect(a?.state).toBe('OH')
    expect(formatAirportShort(a!)).toBe('KCAK — Akron, OH')
  })

  it('searches by city name', () => {
    const hits = searchAirports('memphis')
    expect(hits.some((h) => h.icao === 'KMEM')).toBe(true)
  })

  it('prefers exact ICAO match', () => {
    const hits = searchAirports('kteb')
    expect(hits[0]?.icao).toBe('KTEB')
    expect(hits[0]?.city).toBe('Teterboro')
  })
})
