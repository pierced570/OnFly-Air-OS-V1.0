/**
 * ADS-B / flight-track adapter — mock or live via edge `adsb-positions`.
 * Prefer FlightAware AeroAPI (FLIGHTAWARE_AEROAPI_KEY). RapidAPI ADSBX is legacy fallback.
 * Secrets stay on the edge — never VITE_*.
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

export type AdsbAlertResult = {
  ok: boolean
  tail: string
  enabled: boolean
  alertId?: string | null
  error?: string
}

export interface AdsbAdapter {
  /** Live or last-known positions for the given tails. */
  positions(tails: string[]): Promise<AdsbPosition[]>
  /** One-shot seed of last-known (cheap /flights/{ident} path when live). */
  seedLastKnown(tails: string[]): Promise<AdsbPosition[]>
  /** Register or remove movement alerts for a tail. */
  setMovementAlert(tail: string, enabled: boolean): Promise<AdsbAlertResult>
}

/**
 * Stub until the live provider is wired.
 * Seed returns no_data — callers may fill from base airport.
 * Alert toggles succeed locally with a mock alert id.
 */
export class MockAdsbAdapter implements AdsbAdapter {
  async positions(tails: string[]): Promise<AdsbPosition[]> {
    return tails.map((tail) => noData(tail))
  }

  async seedLastKnown(tails: string[]): Promise<AdsbPosition[]> {
    return tails.map((tail) => noData(tail))
  }

  async setMovementAlert(
    tail: string,
    enabled: boolean,
  ): Promise<AdsbAlertResult> {
    return {
      ok: true,
      tail: tail.toUpperCase(),
      enabled,
      alertId: enabled ? `mock-${tail.toUpperCase()}` : null,
    }
  }
}

/**
 * Live via edge function. On provider failure, returns no_data (flag, don't exclude).
 */
export class EdgeAdsbAdapter implements AdsbAdapter {
  async positions(tails: string[]): Promise<AdsbPosition[]> {
    return invokePositions({ action: 'positions', tails })
  }

  async seedLastKnown(tails: string[]): Promise<AdsbPosition[]> {
    return invokePositions({ action: 'seed', tails })
  }

  async setMovementAlert(
    tail: string,
    enabled: boolean,
  ): Promise<AdsbAlertResult> {
    if (!supabase || !isSupabaseConfigured) {
      return {
        ok: false,
        tail: tail.toUpperCase(),
        enabled,
        error: 'Supabase not configured',
      }
    }
    const { data, error } = await supabase.functions.invoke('adsb-positions', {
      body: { action: enabled ? 'alert_set' : 'alert_clear', tail },
    })
    if (error) {
      return {
        ok: false,
        tail: tail.toUpperCase(),
        enabled,
        error: error.message,
      }
    }
    const body = data as AdsbAlertResult & { error?: string } | null
    if (body?.error && !body.ok) {
      return {
        ok: false,
        tail: tail.toUpperCase(),
        enabled,
        error: body.error,
      }
    }
    return {
      ok: Boolean(body?.ok ?? true),
      tail: (body?.tail ?? tail).toUpperCase(),
      enabled,
      alertId: body?.alertId ?? null,
      error: body?.error,
    }
  }
}

async function invokePositions(body: {
  action: 'positions' | 'seed'
  tails: string[]
}): Promise<AdsbPosition[]> {
  const tails = body.tails.map((t) => t.toUpperCase())
  if (!tails.length) return []
  if (!supabase || !isSupabaseConfigured) {
    console.warn('[Adsb] real mode needs Supabase — returning no_data')
    return tails.map((tail) => noData(tail))
  }
  const { data, error } = await supabase.functions.invoke('adsb-positions', {
    body,
  })
  if (error) {
    console.warn('[Adsb] edge error', error.message)
    return tails.map((tail) => noData(tail))
  }
  const res = data as {
    positions?: AdsbPosition[]
    error?: string
    provider?: string
  } | null
  if (res?.error) {
    console.warn('[Adsb]', res.error)
    return tails.map((tail) => noData(tail))
  }
  const byTail = new Map(
    (res?.positions ?? []).map((p) => [p.tail.toUpperCase(), p]),
  )
  return tails.map((tail) => byTail.get(tail) ?? noData(tail))
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
  if (mode === 'real') return new EdgeAdsbAdapter()
  return new MockAdsbAdapter()
}

export function isRealAdsbEnabled(): boolean {
  return adapterMode('VITE_ADSB_ADAPTER', 'mock') === 'real'
}

/** @deprecated alias — RapidAPI path retired in favor of EdgeAdsbAdapter */
export const RapidApiAdsbAdapter = EdgeAdsbAdapter
