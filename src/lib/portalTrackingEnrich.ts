/**
 * Enrich portal tracking stops with FBO directory + airport catalog.
 * Keeps domain pure; UI/lib attaches handler names and street addresses.
 */

import { lookupAirport } from '@/domain/airports'
import type { TrackingStop } from '@/domain/portalTracking'
import { bestFboForAirport, type FboRow } from '@/lib/fboStore'

export type EnrichedTrackingStop = TrackingStop & {
  fboName: string | null
  fboAddress: string | null
  fboPhone: string | null
  fboAfterHours: string | null
  fboIs24hr: boolean
  airportName: string | null
  airportCityState: string | null
  /** Best single address line for the card. */
  displayAddress: string | null
}

function formatFboAddress(fbo: FboRow): string | null {
  const line1 = fbo.street.trim()
  const cityBits = [fbo.city, fbo.state].filter(Boolean).join(', ')
  const line2 = [cityBits, fbo.zip].filter(Boolean).join(' ').trim()
  if (!line1 && !line2) return null
  if (line1 && line2) return `${line1}, ${line2}`
  return line1 || line2 || null
}

export function enrichTrackingStops(
  stops: TrackingStop[],
): EnrichedTrackingStop[] {
  return stops.map((stop) => {
    const fbo =
      stop.icao &&
      (stop.role === 'departure_fbo' ||
        stop.role === 'arrival_fbo' ||
        stop.role === 'airport')
        ? bestFboForAirport(stop.icao)
        : undefined
    const airport = stop.icao ? lookupAirport(stop.icao) : null
    const fboAddress = fbo ? formatFboAddress(fbo) : null
    return {
      ...stop,
      fboName: fbo?.name ?? null,
      fboAddress,
      fboPhone: fbo?.phone?.trim() || null,
      fboAfterHours: fbo?.after_hours_phone?.trim() || null,
      fboIs24hr: Boolean(fbo?.is_24hr),
      airportName: airport?.name ?? null,
      airportCityState: airport
        ? [airport.city, airport.state].filter(Boolean).join(', ') || null
        : null,
      displayAddress:
        stop.addressHint ||
        fboAddress ||
        (airport
          ? [airport.name, airport.city, airport.state].filter(Boolean).join(' · ')
          : null),
    }
  })
}
