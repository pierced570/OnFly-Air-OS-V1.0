/**
 * Maps / drive-time adapter — mock (GC @ 40 mph) or Mapbox Directions.
 * VITE_MAPBOX_TOKEN is a public pk.* token (Mapbox design); never put secret sk.* in VITE_*.
 */

import { adapterMode } from '@/adapters/types'
import { haversineMiles } from '@/domain/geo'

export type LatLon = { lat: number; lon: number; label?: string }

export interface MapsAdapter {
  driveMinutes(from: LatLon, to: LatLon): Promise<number>
  driveMiles(from: LatLon, to: LatLon): Promise<number>
  /** Optional address → lat/lon. Mock returns null (caller falls back). */
  geocode?(query: string): Promise<LatLon | null>
}

/** Mock: 40 mph over straight-line miles. */
export class MockMapsAdapter implements MapsAdapter {
  async driveMiles(from: LatLon, to: LatLon): Promise<number> {
    return haversineMiles(from.lat, from.lon, to.lat, to.lon)
  }
  async driveMinutes(from: LatLon, to: LatLon): Promise<number> {
    const miles = await this.driveMiles(from, to)
    return Math.max(5, Math.round((miles / 40) * 60))
  }
  async geocode(_query: string): Promise<LatLon | null> {
    return null
  }
}

/**
 * Mapbox Directions (driving). Falls back to mock on network/token errors
 * so ETA chain never hard-fails.
 */
export class MapboxMapsAdapter implements MapsAdapter {
  private mock = new MockMapsAdapter()

  private token(): string | undefined {
    const t = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
    return t?.trim() || undefined
  }

  async driveMiles(from: LatLon, to: LatLon): Promise<number> {
    const route = await this.route(from, to)
    if (route) return route.miles
    return this.mock.driveMiles(from, to)
  }

  async driveMinutes(from: LatLon, to: LatLon): Promise<number> {
    const route = await this.route(from, to)
    if (route) return route.minutes
    return this.mock.driveMinutes(from, to)
  }

  async geocode(query: string): Promise<LatLon | null> {
    const token = this.token()
    const q = query.trim()
    if (!token || !q) return null
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
      `${encodeURIComponent(q)}.json?limit=1&access_token=${encodeURIComponent(token)}`
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn('[MapboxMaps] geocode HTTP', res.status)
        return null
      }
      const data = (await res.json()) as {
        features?: { center?: [number, number]; place_name?: string }[]
      }
      const f = data.features?.[0]
      if (!f?.center) return null
      return { lon: f.center[0], lat: f.center[1], label: f.place_name ?? q }
    } catch (e) {
      console.warn('[MapboxMaps] geocode', e)
      return null
    }
  }

  private async route(
    from: LatLon,
    to: LatLon,
  ): Promise<{ miles: number; minutes: number } | null> {
    const token = this.token()
    if (!token) return null
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
      `?overview=false&access_token=${encodeURIComponent(token)}`
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn('[MapboxMaps] HTTP', res.status)
        return null
      }
      const data = (await res.json()) as {
        routes?: { distance?: number; duration?: number }[]
      }
      const r = data.routes?.[0]
      if (!r?.distance || r.duration == null) return null
      return {
        miles: r.distance / 1609.344,
        minutes: Math.max(1, Math.round(r.duration / 60)),
      }
    } catch (e) {
      console.warn('[MapboxMaps]', e)
      return null
    }
  }
}

/**
 * Door coords for D2D truck legs: geocode address when possible, else airport.
 */
export async function resolveDoorLatLon(
  maps: MapsAdapter,
  address: string | null | undefined,
  fallbackLat: number,
  fallbackLon: number,
  tz?: string,
): Promise<LatLon & { tz?: string }> {
  const text = (address ?? '').trim()
  if (text && maps.geocode) {
    const hit = await maps.geocode(text)
    if (hit) return { ...hit, tz }
  }
  return { lat: fallbackLat, lon: fallbackLon, tz, label: text || undefined }
}

export function createMapsAdapter(): MapsAdapter {
  const mode = adapterMode('VITE_MAPS_ADAPTER', 'real')
  const token = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim()
  if (mode === 'real' && token) return new MapboxMapsAdapter()
  if (mode === 'real' && !token) {
    console.warn('[maps] real mode needs VITE_MAPBOX_TOKEN — using mock GC')
  }
  return new MockMapsAdapter()
}

export function isRealMapsEnabled(): boolean {
  return adapterMode('VITE_MAPS_ADAPTER', 'real') === 'real'
}
