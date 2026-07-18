/**
 * ADS-B adapter — mock or live via edge `adsb-positions` (ADS-B Exchange / RapidAPI).
 * ADSB_RAPIDAPI_KEY is a Supabase secret — never VITE_*.
 */

import { adapterMode } from '@/adapters/types'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type AdsbPosition = {
  tail: string
  lat: number
  lon: number
  alt: number
  gs: number
  seenAt: string
  laddBlocked?: boolean
  lastTakeoffAt?: string | null
  lastLandingAt?: string | null
  phase?: 'airborne' | 'on_ground' | 'no_data'
}

export interface AdsbAdapter {
  positions(tails: string[]): Promise<AdsbPosition[]>
}

/**
 * Mock ADS-B: tracks watched tails, synthesizes takeoff/landing times.
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

/**
 * Live ADS-B via edge function. On provider/subscription failure, returns
 * no_data rows (flag, don't exclude) rather than inventing positions.
 */
export class RapidApiAdsbAdapter implements AdsbAdapter {
  async positions(tails: string[]): Promise<AdsbPosition[]> {
    if (!tails.length) return []
    if (!supabase || !isSupabaseConfigured) {
      console.warn('[Adsb] real mode needs Supabase — falling back to mock')
      return new MockAdsbAdapter().positions(tails)
    }
    const { data, error } = await supabase.functions.invoke('adsb-positions', {
      body: { tails },
    })
    if (error) {
      console.warn('[Adsb] edge error', error.message)
      return tails.map((tail) => noData(tail))
    }
    const body = data as {
      positions?: AdsbPosition[]
      error?: string
      provider?: string
    } | null
    if (body?.error) {
      console.warn('[Adsb]', body.error)
      return tails.map((tail) => noData(tail))
    }
    const byTail = new Map(
      (body?.positions ?? []).map((p) => [p.tail.toUpperCase(), p]),
    )
    return tails.map((tail) => byTail.get(tail.toUpperCase()) ?? noData(tail))
  }
}

function noData(tail: string): AdsbPosition {
  return {
    tail,
    lat: 0,
    lon: 0,
    alt: 0,
    gs: 0,
    seenAt: new Date(0).toISOString(),
    laddBlocked: true,
    lastTakeoffAt: null,
    lastLandingAt: null,
    phase: 'no_data',
  }
}

export function createAdsbAdapter(): AdsbAdapter {
  const mode = adapterMode('VITE_ADSB_ADAPTER', 'mock')
  if (mode === 'real') return new RapidApiAdsbAdapter()
  return new MockAdsbAdapter()
}

export function isRealAdsbEnabled(): boolean {
  return adapterMode('VITE_ADSB_ADAPTER', 'mock') === 'real'
}
