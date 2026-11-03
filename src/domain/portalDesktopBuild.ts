/**
 * Adapt portal-safe trip fields → glass desktop trip cards (doc 04).
 * Pure TypeScript.
 */

import { BRAND_PHONE } from '@/domain/brand'
import {
  airportsFromLane,
  formatPortalDesktopHistoryDate,
  mapPortalDesktopStatus,
  portalDesktopCourierLabel,
  portalDesktopCurrentStep,
  portalDesktopServiceLabel,
  portalDesktopStepLabels,
  resolvePortalDesktopAirport,
  type PortalDesktopDocKind,
  type PortalDesktopTrip,
} from '@/domain/portalDesktopTrips'
import type { PortalShipmentPhase } from '@/domain/portalTracking'

export type PortalDesktopBuildInput = {
  id: string
  ref: number
  code?: string | null
  state: string
  lane: string
  payload_summary: string
  ready_label?: string | null
  po_number?: string | null
  phase?: PortalShipmentPhase | null
  tail?: string | null
  aircraft_type?: string | null
  pickup_street?: string | null
  dropoff_street?: string | null
  service_pattern?: string | null
  hard_quote_sent?: boolean
  hard_quote_accepted?: boolean
  accept_token?: string | null
  trackHref?: string | null
  originIcao?: string | null
  destIcao?: string | null
  originLat?: number | null
  originLon?: number | null
  destLat?: number | null
  destLon?: number | null
  progress?: number | null
  telemetry?: string | null
  lastEvent?: string | null
  nextEvent?: string | null
  updated_at?: string | null
  hasQuoteDoc?: boolean
  hasInvoiceDoc?: boolean
  hasPodDoc?: boolean
  dispatcherName?: string | null
}

function displayId(input: PortalDesktopBuildInput): string {
  if (input.code?.trim()) return input.code.trim().toUpperCase()
  return `T-${input.ref}`
}

function docsOf(input: PortalDesktopBuildInput): PortalDesktopDocKind[] {
  const docs: PortalDesktopDocKind[] = []
  if (input.hasQuoteDoc || input.hard_quote_sent || input.state === 'quoted_hard') {
    docs.push('Quote')
  }
  if (input.hasInvoiceDoc) docs.push('Invoice')
  if (input.hasPodDoc) docs.push('POD')
  return docs
}

function buildSteps(
  status: PortalDesktopTrip['status'],
  input: PortalDesktopBuildInput,
  histDate: string | null,
): PortalDesktopTrip['steps'] {
  const labels = portalDesktopStepLabels(status)
  const cur = portalDesktopCurrentStep(status)
  return labels.map((label, i) => {
    let time = '—'
    if (status === 'done') {
      time = histDate || 'complete'
    } else if (i < cur) {
      time = 'done'
    } else if (i === cur) {
      if (status === 'quoted') time = 'awaiting you'
      else if (status === 'requested' || status === 'sourcing') time = 'pending'
      else if (status === 'live')
        time = input.nextEvent?.replace(/^ETA\s+/i, 'ETA ') || 'live'
      else time = 'now'
    }
    return { label, time }
  })
}

export function buildPortalDesktopTrip(
  input: PortalDesktopBuildInput,
): PortalDesktopTrip {
  const status = mapPortalDesktopStatus({
    state: input.state,
    phase: input.phase,
    hardQuoteSent: input.hard_quote_sent,
    hardQuoteAccepted: input.hard_quote_accepted,
  })

  const fromLane = airportsFromLane(input.lane)
  const from =
    input.originIcao || (input.originLat != null && input.originLon != null)
      ? {
          ...resolvePortalDesktopAirport(input.originIcao || fromLane.from.icao),
          ...(input.originLat != null && input.originLon != null
            ? { lat: input.originLat, lon: input.originLon }
            : {}),
        }
      : fromLane.from
  const to =
    input.destIcao || (input.destLat != null && input.destLon != null)
      ? {
          ...resolvePortalDesktopAirport(input.destIcao || fromLane.to.icao),
          ...(input.destLat != null && input.destLon != null
            ? { lat: input.destLat, lon: input.destLon }
            : {}),
        }
      : fromLane.to

  const service = portalDesktopServiceLabel({
    pickup: input.pickup_street,
    dropoff: input.dropoff_street,
    servicePattern: input.service_pattern,
  })
  const courier = portalDesktopCourierLabel({
    pickup: input.pickup_street,
    dropoff: input.dropoff_street,
  })

  const histDate = formatPortalDesktopHistoryDate(input.updated_at)

  let lastEvent = input.lastEvent?.trim() || ''
  let nextEvent = input.nextEvent?.trim() || ''
  if (!lastEvent) {
    if (status === 'live') lastEvent = 'IN PROGRESS'
    else if (status === 'quoted') lastEvent = 'HARD QUOTE SENT'
    else if (status === 'confirmed') lastEvent = 'CONFIRMED'
    else if (status === 'sourcing') lastEvent = 'SOURCING'
    else if (status === 'done')
      lastEvent = histDate ? `DELIVERED ${histDate.toUpperCase()}` : 'COMPLETE'
    else lastEvent = 'REQUESTED'
  }
  if (!nextEvent) {
    if (status === 'quoted') nextEvent = 'APPROVE TO CONFIRM'
    else if (status === 'sourcing' || status === 'requested')
      nextEvent = 'QUOTE PENDING'
    else if (status === 'confirmed') nextEvent = input.ready_label || 'SCHEDULED'
    else if (status === 'live') nextEvent = 'EN ROUTE'
    else if (status === 'done') nextEvent = 'POD ON FILE'
    else nextEvent = '—'
  }

  const progress =
    input.progress != null && Number.isFinite(input.progress)
      ? Math.min(1, Math.max(0, input.progress))
      : status === 'done'
        ? 1
        : status === 'live'
          ? 0.5
          : status === 'confirmed'
            ? 0.55
            : status === 'quoted'
              ? 0.4
              : 0.15

  return {
    id: input.id,
    displayId: displayId(input),
    po: input.po_number?.trim() || null,
    status,
    from,
    to,
    tail: input.tail?.trim() || null,
    aircraft: input.aircraft_type?.trim() || null,
    load: input.payload_summary?.trim() || '—',
    service,
    courier,
    dispatcher: {
      name: input.dispatcherName?.trim() || 'Desk',
      phone: BRAND_PHONE,
    },
    progress,
    telemetry: input.telemetry?.trim() || null,
    lastEvent,
    nextEvent,
    steps: buildSteps(status, input, histDate),
    currentStep: portalDesktopCurrentStep(status),
    docs: docsOf(input),
    date: histDate,
    acceptHref: input.accept_token
      ? `/accept/${input.accept_token}`
      : null,
    trackHref: input.trackHref ?? null,
    state: input.state,
  }
}

/** Open portal request → pending trip card until a spine trip exists. */
export function buildPortalDesktopTripFromRequest(input: {
  id: string
  ref: number
  lane: string
  summary: string
  hardQuote: boolean
  created_at: string
  href: string
}): PortalDesktopTrip {
  return buildPortalDesktopTrip({
    id: input.id,
    ref: input.ref,
    state: input.hardQuote ? 'quoted_hard' : 'intake',
    lane: input.lane || 'TBD→TBD',
    payload_summary: input.summary,
    phase: 'other',
    hard_quote_sent: input.hardQuote,
    updated_at: input.created_at,
    trackHref: input.href,
    lastEvent: input.hardQuote ? 'HARD QUOTE SENT' : 'REQUESTED',
    nextEvent: input.hardQuote ? 'APPROVE TO CONFIRM' : 'DESK CALLING YOU',
    hasQuoteDoc: input.hardQuote,
  })
}
