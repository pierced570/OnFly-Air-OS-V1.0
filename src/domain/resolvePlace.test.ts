import { describe, expect, it } from 'vitest'
import { resolvePlaceToAirport } from './resolvePlace'

describe('resolvePlaceToAirport', () => {
  it('resolves ICAO and city, state', () => {
    expect(resolvePlaceToAirport('KCAK')?.icao).toBe('KCAK')
    expect(resolvePlaceToAirport('Akron, OH')?.icao).toBe('KCAK')
  })

  it('resolves Chicago to a Chicago-area airport', () => {
    const ap = resolvePlaceToAirport('Chicago, IL')
    expect(ap?.city).toBe('Chicago')
    expect(['KORD', 'KMDW']).toContain(ap?.icao)
  })
})
