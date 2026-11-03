import { describe, expect, it } from 'vitest'
import {
  formatAirportShort,
  lookupAirport,
  nearestAirport,
  searchAirports,
} from './airports'

describe('airports catalog', () => {
  it('includes city and state on lookup', () => {
    const a = lookupAirport('KCAK')
    expect(a?.city).toBe('Akron')
    expect(a?.state).toBe('OH')
    expect(formatAirportShort(a!)).toMatch(/^KCAK \(CAK\) — Akron, OH/)
  })

  it('searches by city name', () => {
    const hits = searchAirports('memphis')
    expect(hits.some((h) => h.icao === 'KMEM')).toBe(true)
  })

  it('finds nearest airport for a map click near San Diego', () => {
    // Slightly offshore of KSAN
    const near = nearestAirport(32.7, -117.2, { preferIata: true, maxNm: 80 })
    expect(near?.icao).toBe('KSAN')
    expect(near?.city).toBe('San Diego')
  })

  it('prefers exact ICAO match', () => {
    const hits = searchAirports('kteb')
    expect(hits[0]?.icao).toBe('KTEB')
    expect(hits[0]?.city).toBe('Teterboro')
  })

  it('finds White Plains via HPN / KHPN / city', () => {
    const byIata = searchAirports('HPN')
    expect(byIata[0]?.icao).toBe('KHPN')
    expect(byIata[0]?.city).toBe('White Plains')
    expect(byIata[0]?.state).toBe('NY')

    const byIcao = searchAirports('KHPN')
    expect(byIcao[0]?.icao).toBe('KHPN')

    const byCity = searchAirports('white plains')
    expect(byCity.some((h) => h.icao === 'KHPN')).toBe(true)

    expect(lookupAirport('HPN')?.icao).toBe('KHPN')
    expect(lookupAirport('KHPN')?.iata).toBe('HPN')
  })

  it('maps IATA CVG to Cincinnati KCVG (not obscure 3-letter ICAO)', () => {
    expect(lookupAirport('CVG')?.icao).toBe('KCVG')
    expect(lookupAirport('CVG')?.city).toMatch(/Cincinnati/i)
  })

  it('covers a broad US catalog (not a tiny hand list)', () => {
    const sample = searchAirports('K', 50)
    expect(sample.length).toBeGreaterThan(20)
    expect(lookupAirport('KORD')).not.toBeNull()
    expect(lookupAirport('KLAX')).not.toBeNull()
    expect(lookupAirport('CYYZ')).not.toBeNull()
  })
})
