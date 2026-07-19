import { describe, expect, it } from 'vitest'
import { lookupAirport, lookupTz } from './airports'
import { fetAppliesFromMtow, normalizeIcao } from './fleetParser'

describe('airports', () => {
  it('KCAK → America/New_York', () => {
    expect(lookupTz('KCAK')).toBe('America/New_York')
    expect(lookupAirport('KCAK')?.name).toMatch(/Akron/i)
  })
})

describe('normalizeIcao', () => {
  it('splits multi-airport bases', () => {
    const r = normalizeIcao('KJER/KTWF')
    expect(r.icao).toBe('KJER')
    expect(r.needsInfo).not.toBeNull()
  })
})

describe('FET from MTOW', () => {
  it('exempt at or below 6000', () => {
    expect(fetAppliesFromMtow(5500)).toBe(false)
    expect(fetAppliesFromMtow(6000)).toBe(false)
    expect(fetAppliesFromMtow(6001)).toBe(true)
  })
})
