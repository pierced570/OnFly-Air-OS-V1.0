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

export function createMapsAdapter(): MapsAdapter {
  const mode = adapterMode('VITE_MAPS_ADAPTER', 'mock')
  if (mode === 'real') return new MapboxMapsAdapter()
  return new MockMapsAdapter()
}

export function isRealMapsEnabled(): boolean {
  return adapterMode('VITE_MAPS_ADAPTER', 'mock') === 'real'
}
