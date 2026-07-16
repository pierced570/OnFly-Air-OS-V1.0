export type AdsbPosition = {
  tail: string
  lat: number
  lon: number
  alt: number
  gs: number
  seenAt: string
}

export interface AdsbAdapter {
  positions(tails: string[]): Promise<AdsbPosition[]>
}

/** Fixture replay — Akron area demo tracks. */
export class MockAdsbAdapter implements AdsbAdapter {
  async positions(tails: string[]): Promise<AdsbPosition[]> {
    const now = new Date().toISOString()
    return tails.slice(0, 20).map((tail, i) => ({
      tail,
      lat: 41.08 + i * 0.02,
      lon: -81.52 - i * 0.03,
      alt: 8000 + i * 100,
      gs: i % 3 === 0 ? 0 : 180,
      seenAt: now,
    }))
  }
}

export function createAdsbAdapter(): AdsbAdapter {
  return new MockAdsbAdapter()
}

export type RestChip = 'likely_rested' | 'rest_clock_running' | 'unknown'

export function restChipFromGs(gs: number, laddBlocked = false): RestChip {
  if (laddBlocked) return 'unknown'
  if (gs > 50) return 'rest_clock_running'
  return 'likely_rested'
}
