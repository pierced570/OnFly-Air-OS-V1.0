import { describe, expect, it } from 'vitest'
import { AviationWeatherWxAdapter, MockWxAdapter } from './wx'

describe('wx adapter', () => {
  it('mock returns VFR category chips', async () => {
    const b = await new MockWxAdapter().brief('KCAK')
    expect(b.flightCat).toBe('VFR')
    expect(b.tafWorstCat).toBe('VFR')
    expect(b.source).toBe('mock')
  })

  it(
    'live aviationweather returns METAR flight category for KCAK',
    async () => {
      const b = await new AviationWeatherWxAdapter().brief('KCAK')
      expect(b.source).toBe('aviationweather')
      expect(b.icao).toBe('KCAK')
      // Live feed — category present when observation exists
      if (b.metar) {
        expect(b.flightCat).toMatch(/^(VFR|MVFR|IFR|LIFR)$/)
      }
      if (b.taf) {
        expect(b.tafPeriods.length).toBeGreaterThan(0)
        expect(b.tafWorstCat).toMatch(/^(VFR|MVFR|IFR|LIFR)$/)
      }
    },
    20_000,
  )
})
