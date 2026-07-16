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

export function createMapsAdapter(): MapsAdapter {
  // Real Google Routes later when VITE_MAPS_ADAPTER=real
  return new MockMapsAdapter()
}
