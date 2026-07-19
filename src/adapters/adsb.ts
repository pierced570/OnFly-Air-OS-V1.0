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
 * Stub ADS-B until the live provider is wired.
 * Returns no_data for every tail — never invents airborne/ground tracks.
 */
export class MockAdsbAdapter implements AdsbAdapter {
  async positions(tails: string[]): Promise<AdsbPosition[]> {
    return tails.map((tail) => noData(tail))
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
      console.warn('[Adsb] real mode needs Supabase — returning no_data')
      return tails.map((tail) => noData(tail))
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
