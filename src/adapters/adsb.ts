export type AdsbPosition = {
  tail: string
  lat: number
  lon: number
  alt: number
  gs: number
  seenAt: string
  /** No ADS-B returns for this tail */
  laddBlocked?: boolean
  /** Last wheels-up (ISO) */
  lastTakeoffAt?: string | null
  /** Last wheels-down (ISO) */
  lastLandingAt?: string | null
  phase?: 'airborne' | 'on_ground' | 'no_data'
}

export interface AdsbAdapter {
  positions(tails: string[]): Promise<AdsbPosition[]>
}

/**
 * Mock ADS-B: tracks watched tails, synthesizes takeoff/landing times.
 * Swap for a live provider when ADSB_API_KEY is set.
 */
export class MockAdsbAdapter implements AdsbAdapter {
  async positions(tails: string[]): Promise<AdsbPosition[]> {
    const now = Date.now()
    return tails.map((tail, i) => {
      const mode = i % 4
      if (mode === 3) {
        return {
          tail,
          lat: 41.0 + (i % 10) * 0.02,
          lon: -81.4 - (i % 10) * 0.02,
          alt: 0,
          gs: 0,
          seenAt: new Date(now - 14 * 86400000).toISOString(),
          laddBlocked: true,
          lastTakeoffAt: null,
          lastLandingAt: null,
          phase: 'no_data' as const,
        }
      }
      if (mode === 1) {
        // airborne — took off ~45–90 min ago, not landed
        const takeoff = new Date(now - (45 + (i % 5) * 10) * 60000).toISOString()
        return {
          tail,
          lat: 41.2 + (i % 8) * 0.04,
          lon: -82.0 - (i % 8) * 0.03,
          alt: 8500 + i * 40,
          gs: 160 + (i % 5) * 10,
          seenAt: new Date(now).toISOString(),
          laddBlocked: false,
          lastTakeoffAt: takeoff,
          lastLandingAt: new Date(now - 8 * 3600000).toISOString(),
          phase: 'airborne' as const,
        }
      }
      // on ground — landed some hours ago
      const landing = new Date(now - (2 + (i % 6)) * 3600000).toISOString()
      const takeoff = new Date(new Date(landing).getTime() - 90 * 60000).toISOString()
      return {
        tail,
        lat: 40.92 + (i % 5) * 0.03,
        lon: -81.44 - (i % 5) * 0.03,
        alt: 0,
        gs: 0,
        seenAt: new Date(now - 20 * 60000).toISOString(),
        laddBlocked: false,
        lastTakeoffAt: takeoff,
        lastLandingAt: landing,
        phase: 'on_ground' as const,
      }
    })
  }
}

export function createAdsbAdapter(): AdsbAdapter {
  return new MockAdsbAdapter()
}
