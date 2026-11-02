import { describe, expect, it } from 'vitest'
import { PORTAL_US_CITY_TWINKLES } from '@/domain/portalUsCities'

describe('portalUsCities', () => {
  it('has unique ids and CONUS-ish coordinates', () => {
    const ids = new Set(PORTAL_US_CITY_TWINKLES.map((c) => c.id))
    expect(ids.size).toBe(PORTAL_US_CITY_TWINKLES.length)
    expect(PORTAL_US_CITY_TWINKLES.length).toBeGreaterThanOrEqual(20)
    for (const c of PORTAL_US_CITY_TWINKLES) {
      expect(c.lat).toBeGreaterThan(18)
      expect(c.lat).toBeLessThan(72)
      expect(c.lon).toBeLessThan(-65)
      expect(c.lon).toBeGreaterThan(-170)
    }
  })
})
