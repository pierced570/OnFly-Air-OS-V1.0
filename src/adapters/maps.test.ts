import { describe, expect, it } from 'vitest'
import { MockMapsAdapter } from './maps'

describe('MockMapsAdapter', () => {
  it('returns positive drive minutes', async () => {
    const m = new MockMapsAdapter()
    const min = await m.driveMinutes(
      { lat: 41.037, lon: -81.442 },
      { lat: 41.786, lon: -87.752 },
    )
    expect(min).toBeGreaterThan(10)
  })
})
