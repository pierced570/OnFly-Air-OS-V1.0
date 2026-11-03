/**
 * Glass portal desktop trip view model (doc 04).
 * Maps spine trip state → Live / Pending / History buckets, chips, timeline.
 * Pure TypeScript — no React / Supabase.
 */

import { lookupAirport, searchAirports } from '@/domain/airports'
import { parseLaneAirports } from '@/domain/offerMissionDisplay'
import portalMapData from '@/data/portalMapData.json'
import type { PortalShipmentPhase } from '@/domain/portalTracking'

const PORTAL_MAP_ICAOS = new Set(
  (portalMapData.airports as Array<{ icao: string }>).map((a) => a.icao),
)

/** Doc 04 trip status vocabulary (portal-facing). */
export type PortalDesktopStatus =
  | 'requested'
  | 'sourcing'
  | 'quoted'
  | 'confirmed'
  | 'live'
  | 'done'

export type PortalDesktopBucket = 'live' | 'pending' | 'history'

export type PortalDesktopAirport = {
  icao: string
  city: string
  lat: number
  lon: number
}

export type PortalDesktopDocKind = 'Quote' | 'Invoice' | 'POD'

export type PortalDesktopStep = {
  label: string
  time: string
}

export type PortalDesktopTrip = {
  id: string
  /** Display id e.g. T-2419 or trip code. */
  displayId: string
  po: string | null
  status: PortalDesktopStatus
  from: PortalDesktopAirport
  to: PortalDesktopAirport
  tail: string | null
  aircraft: string | null
  load: string
  service: 'Airport to airport' | 'Door to door'
  courier: string
  dispatcher: { name: string; phone: string } | null
  progress: number
  telemetry: string | null
  lastEvent: string
  nextEvent: string
  steps: PortalDesktopStep[]
  currentStep: number
  docs: PortalDesktopDocKind[]
  date: string | null
  /** Real accept path when a hard quote token exists. */
  acceptHref: string | null
  trackHref: string | null
  /** Raw spine state for debugging / guards. */
  state: string
}

export type PortalDesktopDocRow = {
  tripId: string
  kind: 'QTE' | 'INV' | 'POD'
  label: PortalDesktopDocKind
  name: string
  po: string
  route: string
  date: string
  url: string | null
  bucket: PortalDesktopBucket
}

const STATUS_META: Record<
  PortalDesktopStatus,
  { chip: string; color: string }
> = {
  live: { chip: 'Live', color: '#E3B341' },
  sourcing: { chip: 'Sourcing', color: '#C9A227' },
  quoted: { chip: 'Quote ready', color: '#C9A227' },
  confirmed: { chip: 'Confirmed', color: '#5FA36F' },
  done: { chip: 'Delivered', color: '#5FA36F' },
  requested: { chip: 'Received', color: '#C9A227' },
}

export function portalDesktopStatusMeta(status: PortalDesktopStatus): {
  chip: string
  color: string
} {
  return STATUS_META[status]
}

export function portalDesktopBucket(
  status: PortalDesktopStatus,
): PortalDesktopBucket {
  if (status === 'live') return 'live'
  if (status === 'done') return 'history'
  return 'pending'
}

/**
 * Map spine trip state + shipment phase → doc 04 status.
 * Live = in flight / active ops. Pending = requested → confirmed (not departed).
 * History = delivered / complete.
 */
export function mapPortalDesktopStatus(input: {
  state: string
  phase?: PortalShipmentPhase | null
  hardQuoteSent?: boolean
  hardQuoteAccepted?: boolean
}): PortalDesktopStatus {
  const state = input.state
  if (
    state === 'delivered' ||
    state === 'invoiced' ||
    state === 'closed'
  ) {
    return 'done'
  }
  if (
    input.phase === 'in_flight' ||
    input.phase === 'on_truck' ||
    state === 'in_progress'
  ) {
    return 'live'
  }
  if (state === 'booked' || input.hardQuoteAccepted) return 'confirmed'
  if (
    state === 'quoted_hard' ||
    (input.hardQuoteSent && !input.hardQuoteAccepted)
  ) {
    return 'quoted'
  }
  if (
    state === 'offers_out' ||
    state === 'quoted_estimated' ||
    state === 'sourcing'
  ) {
    return 'sourcing'
  }
  return 'requested'
}

export function resolvePortalDesktopAirport(
  icaoRaw: string | null | undefined,
  fallbackCity = 'Desk to confirm',
): PortalDesktopAirport {
  const icao = (icaoRaw || 'TBD').trim().toUpperCase() || 'TBD'
  const ap = lookupAirport(icao)
  if (ap) {
    return {
      icao: ap.icao,
      city: ap.city || fallbackCity,
      lat: ap.lat,
      lon: ap.lon,
    }
  }
  return {
    icao,
    city: fallbackCity,
    lat: 39.5,
    lon: -98.3,
  }
}

/** Resolve ICAO / IATA / city prefix for From/To fields (doc 04). */
export function resolveAirportText(text: string): PortalDesktopAirport | null {
  const t = text.trim()
  if (!t) return null
  const byCode = lookupAirport(t)
  if (byCode) {
    return {
      icao: byCode.icao,
      city: byCode.city,
      lat: byCode.lat,
      lon: byCode.lon,
    }
  }
  if (/^[A-Za-z]{3,4}$/.test(t)) {
    const withK = lookupAirport(`K${t.toUpperCase()}`)
    if (withK) {
      return {
        icao: withK.icao,
        city: withK.city,
        lat: withK.lat,
        lon: withK.lon,
      }
    }
  }
  const q = t.toLowerCase()
  const hits = searchAirports(t, 12)
  const cityHits = hits.filter((a) => a.city.toLowerCase().startsWith(q))
  // Prefer map hubs → "International" → primary K+IATA → first city hit.
  const primary =
    cityHits.find((a) => PORTAL_MAP_ICAOS.has(a.icao)) ??
    cityHits.find((a) => /international/i.test(a.name)) ??
    cityHits.find(
      (a) =>
        a.city.toLowerCase() === q &&
        a.iata &&
        a.icao === `K${a.iata}`,
    ) ??
    cityHits.find((a) => a.city.toLowerCase() === q) ??
    cityHits[0] ??
    hits[0]
  if (!primary) return null
  return {
    icao: primary.icao,
    city: primary.city,
    lat: primary.lat,
    lon: primary.lon,
  }
}

export function airportsFromLane(lane: string): {
  from: PortalDesktopAirport
  to: PortalDesktopAirport
} {
  const parsed = parseLaneAirports(lane)
  return {
    from: resolvePortalDesktopAirport(parsed?.origin),
    to: resolvePortalDesktopAirport(parsed?.dest),
  }
}

/** Pre-flight vs live/delivered timeline labels (doc 04). */
export function portalDesktopStepLabels(
  status: PortalDesktopStatus,
): string[] {
  if (status === 'live' || status === 'done') {
    return ['Quoted', 'Confirmed', 'Wheels up', 'Landing', 'Delivered']
  }
  return ['Requested', 'Quoted', 'Confirmed', 'Wheels up', 'Delivered']
}

export function portalDesktopCurrentStep(
  status: PortalDesktopStatus,
): number {
  switch (status) {
    case 'requested':
      return 0
    case 'sourcing':
      return 0
    case 'quoted':
      return 1
    case 'confirmed':
      return 2
    case 'live':
      return 2
    case 'done':
      return 5
    default:
      return 0
  }
}

export function formatPortalDesktopHistoryDate(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return null
  }
}

export function formatPortalDesktopMonoDate(
  iso: string | null | undefined,
): string {
  if (!iso) return 'TODAY'
  try {
    return new Date(iso)
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      .toUpperCase()
  } catch {
    return 'TODAY'
  }
}

export function portalDesktopTripSummary(counts: {
  live: number
  pending: number
}): string {
  return `${counts.live} in the air · ${counts.pending} pending`
}

export function portalDesktopCta(
  status: PortalDesktopStatus,
): 'Approve quote' | 'Call the desk' | 'Book again' {
  if (status === 'quoted') return 'Approve quote'
  if (status === 'requested' || status === 'sourcing') return 'Call the desk'
  return 'Book again'
}

export function portalDesktopServiceLabel(input: {
  pickup?: string | null
  dropoff?: string | null
  servicePattern?: string | null
}): 'Airport to airport' | 'Door to door' {
  const pattern = (input.servicePattern || '').toLowerCase()
  if (pattern.includes('d2d') || pattern.includes('door')) return 'Door to door'
  if (input.pickup?.trim() || input.dropoff?.trim()) return 'Door to door'
  return 'Airport to airport'
}

export function portalDesktopCourierLabel(input: {
  pickup?: string | null
  dropoff?: string | null
}): string {
  const pick = Boolean(input.pickup?.trim())
  const drop = Boolean(input.dropoff?.trim())
  if (pick && drop) return 'Pickup + deliver'
  if (pick) return 'Pickup at origin'
  if (drop) return 'Deliver to site'
  return '—'
}

/** Collect Quote / Invoice / POD rows across trips for Docs panel. */
export function collectPortalDesktopDocs(
  trips: PortalDesktopTrip[],
): PortalDesktopDocRow[] {
  const out: PortalDesktopDocRow[] = []
  for (const t of trips) {
    for (const kind of t.docs) {
      const badge: PortalDesktopDocRow['kind'] =
        kind === 'POD' ? 'POD' : kind === 'Quote' ? 'QTE' : 'INV'
      out.push({
        tripId: t.id,
        kind: badge,
        label: kind,
        name: `${kind} · ${t.displayId}${kind === 'Invoice' ? ' · OnFly Air' : ''}`,
        po: t.po && t.po !== '—' ? t.po : '—',
        route: `${t.from.icao}→${t.to.icao}`,
        date: t.date
          ? t.date.toUpperCase()
          : formatPortalDesktopMonoDate(null),
        url: null,
        bucket: portalDesktopBucket(t.status),
      })
    }
  }
  return out
}
