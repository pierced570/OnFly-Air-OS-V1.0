export type AdsbPosition = {
  tail: string
  lat: number
  lon: number
  alt: number
  gs: number
  seenAt: string
  /** No ADS-B returns for this tail */
  laddBlocked?: boolean
  /** ISO end of last flight session (mock / poller) */
  lastFlewAt?: string | null
}

export interface AdsbAdapter {
  positions(tails: string[]): Promise<AdsbPosition[]>
}

/**
 * Replayable fixture tracks for ~20 trial tails.
 * Pattern: every 3rd grounded+rested near base-ish, every 3rd+1 airborne,
 * every 3rd+2 LADD-blocked / unknown.
 */
export class MockAdsbAdapter implements AdsbAdapter {
  async positions(tails: string[]): Promise<AdsbPosition[]> {
    const now = Date.now()
    return tails.slice(0, 20).map((tail, i) => {
      const mode = i % 3
      if (mode === 2) {
        return {
          tail,
          lat: 41.0 + i * 0.01,
          lon: -81.4 - i * 0.01,
          alt: 0,
          gs: 0,
          seenAt: new Date(now - 7 * 86400000).toISOString(),
          laddBlocked: true,
          lastFlewAt: null,
        }
      }
      if (mode === 1) {
        return {
          tail,
          lat: 41.2 + i * 0.03,
          lon: -82.0 - i * 0.02,
          alt: 8500 + i * 50,
          gs: 160 + (i % 5) * 10,
          seenAt: new Date(now).toISOString(),
          laddBlocked: false,
          lastFlewAt: new Date(now - 30 * 60000).toISOString(),
        }
      }
      // grounded, last flew 12h ago → likely rested
      return {
        tail,
        lat: 40.92 + (i % 4) * 0.02,
        lon: -81.44 - (i % 4) * 0.02,
        alt: 0,
        gs: 0,
        seenAt: new Date(now - 2 * 3600000).toISOString(),
        laddBlocked: false,
        lastFlewAt: new Date(now - 12 * 3600000).toISOString(),
      }
    })
  }
}

export function createAdsbAdapter(): AdsbAdapter {
  return new MockAdsbAdapter()
}

/** @deprecated use domain/fleetStatus.deriveRestChip */
export type RestChip = 'likely_rested' | 'rest_clock_running' | 'unknown'

export function restChipFromGs(gs: number, laddBlocked = false): RestChip {
  if (laddBlocked) return 'unknown'
  if (gs > 50) return 'rest_clock_running'
  return 'likely_rested'
}
