/**
 * Client live-tracking view — pure TS, portal-safe (no operator cost/margin/identity).
 * Builds milestones, ETA rows, and aircraft position (ADS-B or ETA-inferred).
 */

import type { AdsbPosition } from '@/adapters/adsb'
import { destDwellComplete, icaoMatch, proposeAdsbActuals } from '@/domain/adsbActuals'
import {
  filterPortalTailActivity,
  groupTailFlightActivity,
  legsFromSnapshots,
  type TailFlightActivityGroups,
} from '@/domain/tailFlightActivity'
import { ADSB_USABLE_FIX_MAX_AGE_MIN, adsbFixIsFresh } from '@/domain/adsbFreshness'
import { lookupAirport } from '@/domain/airports'
import type { ChainLeg, Place, ServicePattern } from '@/domain/etaChain'
import {
  deliveryDeltaMin,
  projectedDeliveryUtc,
} from '@/domain/etaChain'
import { haversineNm } from '@/domain/geo'
import { parseLaneAirports } from '@/domain/offerMissionDisplay'
import {
  formatPortalStopAddress,
  formatPortalStopTitle,
  normalizePortalStop,
  portalStopFromLegacyAddress,
  type PortalStopLocation,
} from '@/domain/portalStopLocation'
import { formatClientLocal, formatZuluLocal } from '@/domain/timeFmt'

function hasCoords(lat: number | null | undefined, lon: number | null | undefined): boolean {
  return (
    lat != null &&
    lon != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0)
  )
}

/** Prefer stored place coords; fall back to airport catalog by ICAO. */
function resolvePlaceCoords(place: Place | undefined | null): {
  lat: number
  lon: number
  icao: string | null
} | null {
  if (!place) return null
  if (hasCoords(place.lat, place.lon)) {
    return {
      lat: place.lat,
      lon: place.lon,
      icao: place.icao?.toUpperCase() ?? null,
    }
  }
  const icao = place.icao?.trim().toUpperCase()
  if (!icao) return null
  const ap = lookupAirport(icao)
  if (!ap || !hasCoords(ap.lat, ap.lon)) return null
  return { lat: ap.lat, lon: ap.lon, icao: ap.icao }
}

export type TrackingMilestoneKind =
  | 'request_received'
  | 'estimate_sent'
  | 'quote_approved'
  | 'booked'
  | 'in_progress'
  | 'wheels_up'
  | 'wheels_down'
  | 'delivered'
  | 'invoiced'

export type TrackingMilestone = {
  kind: TrackingMilestoneKind
  label: string
  at: string | null
  done: boolean
  current: boolean
}

export type TrackingEtaRow = {
  seq: number
  event: string
  fromLabel: string
  toLabel: string
  estDisplay: string
  actualDisplay: string | null
  status: 'done' | 'active' | 'pending'
  tz: string
  /** Scheduled end — local (stop zone). */
  scheduledLocal: string | null
  /** Scheduled end — Zulu. */
  scheduledZulu: string | null
  /** Actual or live forecast local. */
  actualOrForecastLocal: string | null
  /** Minutes early (−) / late (+) vs scheduled end; null if unknown. */
  deltaMin: number | null
  /** True when actualOrForecast is still a forecast (not actual). */
  isForecast: boolean
}

/**
 * Client trip stages — ADS-B / FlightAware + ETA chain.
 * Portal UI uses status only (complete / current / upcoming) — no clocks.
 */
/** Ordered client-facing ops stages on the tracking portal. */
export type PortalOpsStageKey =
  | 'enroute_pickup'
  | 'at_pickup'
  | 'enroute_dest'
  | 'landed_dest'

export const PORTAL_OPS_STAGE_KEYS: readonly PortalOpsStageKey[] = [
  'enroute_pickup',
  'at_pickup',
  'enroute_dest',
  'landed_dest',
] as const

export type OpsForecastRow = {
  key: PortalOpsStageKey
  /** Internal label (ICAO when useful); clients see clientOpsStageLabel. */
  label: string
  estimatedLocal: string | null
  estimatedZulu: string | null
  actualOrForecastLocal: string | null
  /** Minutes early (−) / late (+) — or duration delta for air / ground. */
  deltaMin: number | null
  status: 'done' | 'active' | 'pending'
  isForecast: boolean
  kind: 'arrival' | 'departure' | 'duration' | 'ground'
}

/** Client portal stage names — progress only, never clocks. */
export function clientOpsStageLabel(
  row: OpsForecastRow | { key: PortalOpsStageKey },
): string {
  switch (row.key) {
    case 'enroute_pickup':
      return 'Enroute to pickup'
    case 'at_pickup':
      return 'At Pickup airport'
    case 'enroute_dest':
      return 'Enroute to destination'
    case 'landed_dest':
      return 'label' in row && row.label === 'Delivered'
        ? 'Delivered'
        : 'Landed at destination'
    default:
      return 'label' in row ? row.label : String(row.key)
  }
}

export function isPortalOpsStageKey(v: unknown): v is PortalOpsStageKey {
  return (
    typeof v === 'string' &&
    (PORTAL_OPS_STAGE_KEYS as readonly string[]).includes(v)
  )
}

/**
 * Desk override: pin which stage is "active" on the client portal.
 * Prior stages → done; selected → active; later → pending.
 */
export function applyPortalStageOverride(
  rows: OpsForecastRow[],
  override: PortalOpsStageKey | null | undefined,
): OpsForecastRow[] {
  if (!override || !rows.length) return rows
  const idx = rows.findIndex((r) => r.key === override)
  if (idx < 0) return rows
  return rows.map((r, i) => ({
    ...r,
    status: i < idx ? 'done' : i === idx ? 'active' : 'pending',
  }))
}

/** Portal-safe cargo / pax manifest (no operator cost). */
export type PortalCargoManifest = {
  payloadKind: 'cargo' | 'pax' | 'both'
  paxCount: number
  paxNames: string[]
  /** Dims, standard tooling, window notes, etc. */
  cargoLines: string[]
  readyLabel: string
  summaryLine: string
}

/** Client shipment card / list phase — portal-safe labels. */
export type PortalShipmentPhase =
  | 'in_flight'
  | 'on_truck'
  | 'delivered'
  | 'booked'
  | 'other'

export type PortalShipmentCounts = {
  inMotion: number
  onGround: number
  delivered: number
}

export function formatDeltaBadge(deltaMin: number | null | undefined): {
  label: string
  tone: 'early' | 'late' | 'onplan' | 'live' | 'none'
} {
  if (deltaMin == null || !Number.isFinite(deltaMin)) {
    return { label: '', tone: 'none' }
  }
  const rounded = Math.round(deltaMin)
  if (rounded === 0) return { label: 'ON PLAN', tone: 'onplan' }
  if (rounded > 0) return { label: `+${rounded} MIN`, tone: 'late' }
  return { label: `${rounded} MIN`, tone: 'early' }
}

export function classifyPortalShipmentPhase(input: {
  state: string
  aircraftPhase?: TrackingAircraftPosition['phase'] | null
  legs?: Array<{ type: string; status: string }>
}): PortalShipmentPhase {
  const state = input.state
  if (
    state === 'delivered' ||
    state === 'invoiced' ||
    state === 'closed'
  ) {
    return 'delivered'
  }
  if (state === 'booked') return 'booked'
  if (state === 'in_progress') {
    if (input.aircraftPhase === 'airborne') return 'in_flight'
    const active = (input.legs ?? []).find((l) => l.status === 'active')
    if (
      active &&
      (active.type.startsWith('truck') || active.type === 'offload')
    ) {
      return 'on_truck'
    }
    if (input.aircraftPhase === 'on_ground' || input.aircraftPhase === 'positioning') {
      return 'on_truck'
    }
    return 'in_flight'
  }
  return 'other'
}

export function summarizePortalShipments(
  phases: PortalShipmentPhase[],
): PortalShipmentCounts {
  let inMotion = 0
  let onGround = 0
  let delivered = 0
  for (const p of phases) {
    if (p === 'in_flight') inMotion++
    else if (p === 'on_truck' || p === 'booked') onGround++
    else if (p === 'delivered') delivered++
  }
  return { inMotion, onGround, delivered }
}

/** ETE remaining from nm + ground speed (minutes), or null. */
export function eteMinutesRemaining(
  nmRemaining: number | null | undefined,
  gsKts: number | null | undefined,
): number | null {
  if (nmRemaining == null || !(nmRemaining > 0)) return null
  if (gsKts == null || !(gsKts > 20)) return null
  return Math.max(1, Math.round((nmRemaining / gsKts) * 60))
}

export function formatEteLabel(min: number | null): string | null {
  if (min == null) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h <= 0) return `${m}M`
  return `${h}H ${String(m).padStart(2, '0')}M`
}

export type TrackingAircraftPosition = {
  tail: string
  phase: 'airborne' | 'on_ground' | 'positioning' | 'unknown'
  lat: number | null
  lon: number | null
  altFt: number | null
  gsKts: number | null
  /** Human summary — never names the carrier. */
  summary: string
  /** `adsb` when live radar; `eta` when inferred from chain; `none` when unavailable. */
  source: 'adsb' | 'eta' | 'none'
  seenAt: string | null
  fromIcao: string | null
  toIcao: string | null
  /** Air-leg endpoints for the portal map (ICAO coords only — no operator). */
  fromLat: number | null
  fromLon: number | null
  toLat: number | null
  toLon: number | null
  progressPct: number | null
  nmRemaining: number | null
  /**
   * True when FlightAware AeroAPI marks this registration/flight blocked (LADD).
   * Missing position / no_data is NOT blocked — portal still shows ETA track.
   */
  laddBlocked: boolean
}

/** True when the portal should cover the map (legacy — live LADD no longer covers). */
export function portalAircraftMapBlocked(a: TrackingAircraftPosition): boolean {
  // Live ADS-B LADD skips the public fix; we still show ETA-inferred track.
  // Keep helper for older payloads that set laddBlocked without ETA coords.
  return a.laddBlocked === true && a.lat == null && a.lon == null
}

/** True when the portal can render a little live map for this trip stage. */
export function portalAircraftMapVisible(a: TrackingAircraftPosition): boolean {
  if (portalAircraftMapBlocked(a)) return false
  if (a.lat != null && a.lon != null && !(a.lat === 0 && a.lon === 0)) {
    return true
  }
  return (
    a.fromLat != null &&
    a.fromLon != null &&
    a.toLat != null &&
    a.toLon != null
  )
}

export type PortalTrackingView = {
  ref: number
  /** Trip public code when known (e.g. a3s6d). */
  code: string | null
  /** Client PO — never operator cost. */
  poNumber: string | null
  lane: string
  state: string
  phase: PortalShipmentPhase
  readyLabel: string
  payloadSummary: string
  pattern: ServicePattern | null
  /** Tail only after award — still no operator name. */
  tail: string | null
  aircraftType: string | null
  carrierLabel: string
  promisedDisplay: string | null
  projectedDisplay: string | null
  deltaMin: number | null
  /** ETE remaining for live air leg (minutes). */
  eteMin: number | null
  eteLabel: string | null
  nextMilestoneLabel: string
  milestones: TrackingMilestone[]
  etaRows: TrackingEtaRow[]
  /** Pickup / loading / live-leg Actual vs Forecast. */
  opsForecastRows: OpsForecastRow[]
  /** FlightAware-style hops for this tail, filtered to this trip. */
  flightActivity: TailFlightActivityGroups
  aircraft: TrackingAircraftPosition
  timeline: Array<{ at: string; label: string; detail: string }>
  documents: Array<{ id: string; kind: string; title: string; at: string; url: string }>
  /** Client-facing itinerary stops (pickup → FBOs → delivery). */
  stops: TrackingStop[]
  /** Snapshot facts for the hero / aircraft panel. */
  flightFacts: TrackingFlightFacts
  cargo: PortalCargoManifest
  /** Street / door addresses (editable on portal). */
  pickupStreet: string | null
  dropoffStreet: string | null
  /** Structured pickup / drop-off when desk set hangar · FBO · TBD. */
  pickupStop: PortalStopLocation | null
  dropoffStop: PortalStopLocation | null
}

/** One stop on the client itinerary — FBO or door address. */
export type TrackingStopRole =
  | 'pickup'
  | 'departure_fbo'
  | 'arrival_fbo'
  | 'delivery'
  | 'airport'

export type TrackingStop = {
  role: TrackingStopRole
  title: string
  icao: string | null
  placeLabel: string
  /** Free-text address when known (door stop or Place.label). */
  addressHint: string | null
  etaDisplay: string | null
  etaActualDisplay: string | null
  status: 'done' | 'active' | 'pending'
  tz: string
  /** Chain event this stop is tied to. */
  event: string | null
}

export type TrackingFlightFacts = {
  tail: string | null
  aircraftType: string | null
  originIcao: string | null
  destIcao: string | null
  wheelsUpDisplay: string | null
  wheelsDownDisplay: string | null
  nextArriveLabel: string | null
  nextArriveDisplay: string | null
  cargo: string
  readyLabel: string
  pattern: ServicePattern | null
}

export type PortalTrackingTripInput = {
  ref: number
  code?: string | null
  po_number?: string | null
  lane: string
  state: string
  ready_label: string
  payload_summary: string
  service_pattern?: ServicePattern | null
  promised_delivery?: string | null
  eta_chain: ChainLeg[]
  legs: Array<{
    seq: number
    type: string
    label: string
    status: string
    origin?: string
    dest?: string
    est_start: string | null
    est_end: string | null
    actual_start: string | null
    actual_end: string | null
  }>
  events: Array<{ at: string; actor: string; kind: string; payload: Record<string, unknown> }>
  documents?: Array<{ id: string; kind: string; title: string; at: string; url: string }>
  tail?: string | null
  aircraft_type?: string | null
  hard_quote?: { disclosure_at?: string; payload_kind?: 'cargo' | 'pax' | 'both' } | null
  /** Pax count from Quick Dispatch / desk when names unknown. */
  pax_count?: number | null
  pax_names?: string[]
  cargo_lines?: string[]
  payload_kind?: 'cargo' | 'pax' | 'both' | null
  pickup_street?: string | null
  dropoff_street?: string | null
  pickup_stop?: PortalStopLocation | null
  dropoff_stop?: PortalStopLocation | null
  /** Desk-pinned portal stage (overrides ADS-B / ETA-derived active stage). */
  portal_ops_stage?: PortalOpsStageKey | null
}

function eventAt(
  events: PortalTrackingTripInput['events'],
  kinds: string[],
): string | null {
  const hit = events.find((e) => kinds.includes(e.kind))
  return hit?.at ?? null
}

function isStateTransitionKind(kind: string): boolean {
  return (
    kind === 'state_transition' ||
    kind === 'state_change' ||
    kind === 'transition'
  )
}

function stateEnteredAt(
  events: PortalTrackingTripInput['events'],
  state: string,
): string | null {
  const hit = [...events]
    .reverse()
    .find(
      (e) =>
        isStateTransitionKind(e.kind) &&
        (e.payload.to === state || e.payload.to_state === state),
    )
  return hit?.at ?? null
}

/** Interpolate lat/lon along great-circle (fraction 0..1). */
export function interpolateGc(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  fraction: number,
): { lat: number; lon: number } {
  const f = Math.min(1, Math.max(0, fraction))
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const lat1 = toRad(from.lat)
  const lon1 = toRad(from.lon)
  const lat2 = toRad(to.lat)
  const lon2 = toRad(to.lon)
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    )
  if (d < 1e-9) return { lat: from.lat, lon: from.lon }
  const a = Math.sin((1 - f) * d) / Math.sin(d)
  const b = Math.sin(f * d) / Math.sin(d)
  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2)
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2)
  const z = a * Math.sin(lat1) + b * Math.sin(lat2)
  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lon: toDeg(Math.atan2(y, x)),
  }
}

export function buildMilestones(
  trip: PortalTrackingTripInput,
  nowIso = new Date().toISOString(),
): TrackingMilestone[] {
  const events = trip.events
  const estimateAt =
    eventAt(events, ['estimated_quote_sent', 'created_from_estimate']) ??
    (['quoted_estimated', 'offers_out', 'quoted_hard', 'booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(
      trip.state,
    )
      ? events[0]?.at ?? nowIso
      : null)

  const quoteApprovedAt =
    trip.hard_quote?.disclosure_at ??
    stateEnteredAt(events, 'quoted_hard') ??
    eventAt(events, ['hard_quote_sent', 'quote_approved']) ??
    (['quoted_hard', 'booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(
      trip.state,
    )
      ? estimateAt
      : null)

  const bookedAt =
    stateEnteredAt(events, 'booked') ??
    eventAt(events, ['eta_chain_copied_to_trip', 'create_thread', 'quick_dispatch']) ??
    (['booked', 'in_progress', 'delivered', 'invoiced', 'closed'].includes(trip.state)
      ? quoteApprovedAt
      : null)

  const inProgressAt =
    stateEnteredAt(events, 'in_progress') ??
    (trip.state === 'in_progress' ||
    trip.state === 'delivered' ||
    trip.state === 'invoiced' ||
    trip.state === 'closed'
      ? bookedAt
      : null)

  const airLeg =
    trip.eta_chain.find((l) => l.type === 'air_leg') ??
    null
  const wheelsUpAt =
    airLeg?.actual_start ??
    trip.legs.find((l) => l.type === 'air_leg')?.actual_start ??
    null
  const wheelsDownAt =
    airLeg?.actual_end ??
    trip.legs.find((l) => l.type === 'air_leg')?.actual_end ??
    null

  const deliveredAt =
    stateEnteredAt(events, 'delivered') ??
    eventAt(events, ['one_tap_checkin']) ??
    (['delivered', 'invoiced', 'closed'].includes(trip.state) ? nowIso : null)

  const invoicedAt =
    stateEnteredAt(events, 'invoiced') ??
    eventAt(events, ['invoice_created']) ??
    (trip.state === 'invoiced' || trip.state === 'closed' ? deliveredAt : null)

  const defs: Array<{ kind: TrackingMilestoneKind; label: string; at: string | null }> = [
    { kind: 'estimate_sent', label: 'Estimate sent', at: estimateAt },
    { kind: 'quote_approved', label: 'Quote approved', at: quoteApprovedAt },
    { kind: 'booked', label: 'Trip booked', at: bookedAt },
    { kind: 'in_progress', label: 'In progress', at: inProgressAt },
    { kind: 'wheels_up', label: 'Wheels up', at: wheelsUpAt },
    { kind: 'wheels_down', label: 'Wheels down', at: wheelsDownAt },
    { kind: 'delivered', label: 'Delivered', at: deliveredAt },
    { kind: 'invoiced', label: 'Invoiced', at: invoicedAt },
  ]

  let currentIdx = -1
  for (let i = 0; i < defs.length; i++) {
    if (defs[i]!.at) currentIdx = i
  }
  // Current = first not-done after last done; if all done, last
  let nextPending = defs.findIndex((d) => !d.at)
  if (nextPending < 0) nextPending = defs.length - 1

  return defs.map((d, i) => ({
    kind: d.kind,
    label: d.label,
    at: d.at,
    done: Boolean(d.at),
    current: i === nextPending || (nextPending < 0 && i === currentIdx),
  }))
}

function legStatus(
  leg: ChainLeg,
  legs: PortalTrackingTripInput['legs'],
): 'done' | 'active' | 'pending' {
  const row = legs.find((l) => l.seq === leg.seq)
  if (row?.status === 'done' || leg.actual_end) return 'done'
  if (row?.status === 'active' || (leg.actual_start && !leg.actual_end)) return 'active'
  return 'pending'
}

export function buildEtaRows(trip: PortalTrackingTripInput): TrackingEtaRow[] {
  const chain = trip.eta_chain
  if (!chain.length) {
    return trip.legs.map((l) => {
      const tz = 'UTC'
      const estIso = l.est_end
      const actIso = l.actual_end ?? l.actual_start
      const status: TrackingEtaRow['status'] =
        l.status === 'done' ? 'done' : l.status === 'active' ? 'active' : 'pending'
      const deltaMin =
        estIso && actIso
          ? Math.round(
              (Date.parse(actIso) - Date.parse(estIso)) / 60_000,
            )
          : null
      const estFmt = estIso ? formatClientLocal(estIso, tz) : null
      const zulu = estIso ? formatZuluLocal(estIso, tz) : null
      const actFmt = actIso ? formatClientLocal(actIso, tz) : null
      return {
        seq: l.seq,
        event: l.label,
        fromLabel: (l.origin || '—').toUpperCase(),
        toLabel: (l.dest || '—').toUpperCase(),
        estDisplay: estFmt?.display ?? '—',
        actualDisplay: actFmt?.display ?? null,
        status,
        tz,
        scheduledLocal: estFmt?.local ?? null,
        scheduledZulu: zulu?.zulu ?? null,
        actualOrForecastLocal: actFmt?.local ?? estFmt?.local ?? null,
        deltaMin: status === 'active' && !actIso ? null : deltaMin,
        isForecast: !actIso,
      }
    })
  }
  return chain.map((leg) => {
    const tz = leg.to.tz || leg.from.tz || 'UTC'
    const status = legStatus(leg, trip.legs)
    const estIso = leg.est_end
    const actIso = leg.actual_end ?? leg.actual_start ?? null
    const forecastIso = !actIso ? estIso : null
    const compareIso = actIso ?? forecastIso
    const deltaMin =
      estIso && compareIso && status !== 'pending'
        ? Math.round((Date.parse(compareIso) - Date.parse(estIso)) / 60_000)
        : estIso && compareIso && status === 'pending'
          ? Math.round((Date.parse(compareIso) - Date.parse(estIso)) / 60_000)
          : null
    const estFmt = formatClientLocal(estIso, tz)
    const zulu = formatZuluLocal(estIso, tz)
    const actFmt = actIso ? formatClientLocal(actIso, tz) : null
    return {
      seq: leg.seq,
      event: leg.event || leg.label,
      fromLabel: (leg.from.icao || leg.from.label || '—').toUpperCase(),
      toLabel: (leg.to.icao || leg.to.label || '—').toUpperCase(),
      estDisplay: estFmt.display,
      actualDisplay: actFmt?.display ?? null,
      status,
      tz,
      scheduledLocal: estFmt.local,
      scheduledZulu: zulu.zulu,
      actualOrForecastLocal: actFmt?.local ?? estFmt.local,
      deltaMin: status === 'active' && !actIso ? null : deltaMin,
      isForecast: !actIso,
    }
  })
}

function formatDurationMin(min: number | null | undefined): string | null {
  if (min == null || !Number.isFinite(min)) return null
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h <= 0) return `${r} min`
  return `${h}h ${String(r).padStart(2, '0')}m`
}

function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ms = Date.parse(b) - Date.parse(a)
  if (!Number.isFinite(ms)) return null
  return Math.round(ms / 60_000)
}

type OpsStamp = {
  seq: number
  type: string
  fromIcao: string
  toIcao: string
  tz: string
  est_start: string | null
  est_end: string | null
  actual_start: string | null
  actual_end: string | null
  duration_min: number | null
  status: 'done' | 'active' | 'pending'
}

function stampsFromTrip(trip: PortalTrackingTripInput): OpsStamp[] {
  if (trip.eta_chain.length) {
    return trip.eta_chain.map((leg) => ({
      seq: leg.seq,
      type: leg.type || leg.duration_key || '',
      fromIcao: (leg.from.icao || leg.from.label || '—').toUpperCase(),
      toIcao: (leg.to.icao || leg.to.label || '—').toUpperCase(),
      tz: leg.to.tz || leg.from.tz || 'UTC',
      est_start: leg.est_start,
      est_end: leg.est_end,
      actual_start: leg.actual_start ?? null,
      actual_end: leg.actual_end ?? null,
      duration_min: leg.duration_min ?? null,
      status: legStatus(leg, trip.legs),
    }))
  }
  return trip.legs.map((l) => {
    const status: OpsStamp['status'] =
      l.status === 'done' ? 'done' : l.status === 'active' ? 'active' : 'pending'
    return {
      seq: l.seq,
      type: l.type || l.label || '',
      fromIcao: (l.origin || '—').toUpperCase(),
      toIcao: (l.dest || '—').toUpperCase(),
      tz: 'UTC',
      est_start: l.est_start,
      est_end: l.est_end,
      actual_start: l.actual_start,
      actual_end: l.actual_end,
      duration_min: minutesBetween(l.est_start, l.est_end),
      status,
    }
  })
}

function isPositionStamp(s: OpsStamp): boolean {
  const t = `${s.type}`.toLowerCase()
  return (
    t === 'position' ||
    t === 'acft_ttp' ||
    /\bposition\b/i.test(t) ||
    /\bttp\b/i.test(t) ||
    /in position/i.test(t)
  )
}

function isAirStamp(s: OpsStamp): boolean {
  const t = `${s.type}`.toLowerCase()
  return (
    t === 'air_leg' ||
    t === 'air_time' ||
    /\bair\b/i.test(t) ||
    /wheels\s*up/i.test(t) ||
    /live\s*leg/i.test(t)
  )
}

function isTurnStamp(s: OpsStamp): boolean {
  const t = `${s.type}`.toLowerCase()
  return (
    t === 'ground_stop' ||
    t === 'acft_turn' ||
    /turn/i.test(t) ||
    /load/i.test(t) ||
    /ready wheels/i.test(t)
  )
}

/**
 * FlightAware-gated stages:
 * 1. Enroute to pickup until FA (or committed chain) shows a landing at origin ICAO
 * 2. At pickup only after that origin landing
 * 3. Enroute to dest when airborne again (takeoff from origin)
 * 4. Landed at dest on dest ICAO; Delivered after DEST_GROUND_DELIVERED_MIN on ground
 */
export function buildOpsForecastRows(
  trip: PortalTrackingTripInput,
  opts?: { adsb?: AdsbPosition | null; nowIso?: string },
): OpsForecastRow[] {
  const stamps = stampsFromTrip(trip)
  if (!stamps.length) return []

  const position = stamps.find(isPositionStamp) ?? null
  const air =
    stamps.find(isAirStamp) ??
    stamps.find(
      (s) =>
        s.fromIcao !== s.toIcao &&
        s !== position &&
        !isTurnStamp(s),
    ) ??
    null
  if (!air && !position) return []

  const originIcao =
    (air?.fromIcao && air.fromIcao !== '—' ? air.fromIcao : null) ||
    (position?.toIcao && position.toIcao !== '—' ? position.toIcao : null) ||
    'ORIGIN'
  const destIcao =
    (air?.toIcao && air.toIcao !== '—' ? air.toIcao : null) || 'DEST'
  const tz = air?.tz || position?.tz || 'UTC'
  const nowIso = opts?.nowIso ?? new Date().toISOString()
  const adsb = opts?.adsb ?? null

  const adsbProp = proposeAdsbActuals({
    adsb,
    airFromIcao: originIcao,
    airToIcao: destIcao,
    nowIso,
  })

  const faDest = adsb?.destinationIcao ?? null
  const faOrigin = adsb?.originIcao ?? null
  const adsbAirborne = adsb?.phase === 'airborne'
  const adsbOnGround = adsb?.phase === 'on_ground'
  const faOnGroundHere =
    adsb != null &&
    !adsbAirborne &&
    (adsbOnGround || adsb.landingIsActual === true)

  // Stage 2 only when FA dest is the pickup ICAO (a landing there), not
  // "on the ground" at some other airport.
  const faLandedAtOrigin =
    faOnGroundHere &&
    icaoMatch(faDest, originIcao) &&
    !icaoMatch(faDest, destIcao)

  const arrivedActFinal =
    position?.actual_end ??
    adsbProp.originArrivalAt ??
    (faLandedAtOrigin ? adsb?.lastLandingAt ?? adsb?.seenAt ?? null : null)
  const originArrived = Boolean(arrivedActFinal) || faLandedAtOrigin

  const liveRoute =
    icaoMatch(faOrigin, originIcao) && icaoMatch(faDest, destIcao)
  const faAirborneToDest = originArrived && adsbAirborne && liveRoute
  const faTakeoffFromOrigin =
    originArrived &&
    liveRoute &&
    (adsbAirborne || adsb?.takeoffIsActual === true)

  const takeoffAct =
    air?.actual_start ??
    adsbProp.takeoffAt ??
    (faTakeoffFromOrigin || faAirborneToDest
      ? adsb?.lastTakeoffAt ?? null
      : null)
  const liveLegOff =
    originArrived &&
    (Boolean(takeoffAct) || faTakeoffFromOrigin || faAirborneToDest)

  const faLandedAtDest =
    originArrived &&
    liveLegOff &&
    faOnGroundHere &&
    icaoMatch(faDest, destIcao) &&
    (liveRoute || icaoMatch(faOrigin, originIcao))

  const landingAct =
    air?.actual_end ??
    adsbProp.destLandingAt ??
    (faLandedAtDest
      ? (adsb?.landingIsActual === true ? adsb.lastLandingAt : null) ??
        adsb?.seenAt ??
        null
      : null)

  const destLanded =
    Boolean(air?.actual_end) ||
    Boolean(adsbProp.destLandingAt) ||
    faLandedAtDest

  const arrivedEst = position?.est_end ?? null
  const takeoffEst = air?.est_start ?? null
  const landingEst = air?.est_end ?? null
  const airEstMin =
    air?.duration_min ?? minutesBetween(takeoffEst, landingEst)
  const airActMin =
    minutesBetween(takeoffAct, landingAct) ?? adsbProp.airTimeMin

  const positioningTowardPickup =
    !originArrived &&
    !liveLegOff &&
    !destLanded &&
    adsbAirborne &&
    icaoMatch(faDest, originIcao)

  const destGroundMin =
    destLanded && landingAct
      ? minutesBetween(landingAct, nowIso) ?? adsbProp.groundTimeDestMin
      : destLanded
        ? adsbProp.groundTimeDestMin
        : null
  const destDelivered =
    trip.state === 'delivered' ||
    trip.state === 'invoiced' ||
    trip.state === 'closed' ||
    destDwellComplete(landingAct, nowIso)

  const rows: OpsForecastRow[] = []

  {
    const status: OpsForecastRow['status'] =
      destLanded || liveLegOff || originArrived
        ? 'done'
        : 'active'
    const estFmt = arrivedEst ? formatClientLocal(arrivedEst, tz) : null
    const zulu = arrivedEst ? formatZuluLocal(arrivedEst, tz) : null
    const actFmt = arrivedActFinal
      ? formatClientLocal(arrivedActFinal, tz)
      : null
    const deltaMin =
      arrivedEst && arrivedActFinal
        ? Math.round(
            (Date.parse(arrivedActFinal) - Date.parse(arrivedEst)) / 60_000,
          )
        : null
    rows.push({
      key: 'enroute_pickup',
      label: `Enroute to ${originIcao}`,
      estimatedLocal: estFmt?.local ?? null,
      estimatedZulu: zulu?.zulu ?? null,
      actualOrForecastLocal:
        actFmt?.local ??
        (status === 'active'
          ? positioningTowardPickup
            ? 'EN ROUTE TO PICKUP · LIVE'
            : 'WAITING FOR LANDING AT PICKUP'
          : estFmt?.local ?? null),
      deltaMin: arrivedActFinal ? deltaMin : null,
      status,
      isForecast: !arrivedActFinal,
      kind: 'arrival',
    })
  }

  {
    const status: OpsForecastRow['status'] =
      destLanded || liveLegOff
        ? 'done'
        : originArrived
          ? 'active'
          : 'pending'
    const estFmt = takeoffEst ? formatClientLocal(takeoffEst, tz) : null
    const zulu = takeoffEst ? formatZuluLocal(takeoffEst, tz) : null
    const actFmt = arrivedActFinal
      ? formatClientLocal(arrivedActFinal, tz)
      : null
    rows.push({
      key: 'at_pickup',
      label: `At ${originIcao}`,
      estimatedLocal: estFmt?.local ?? null,
      estimatedZulu: zulu?.zulu ?? null,
      actualOrForecastLocal:
        actFmt?.local ??
        (status === 'active' ? `AT ${originIcao} · LIVE` : estFmt?.local ?? null),
      deltaMin: null,
      status,
      isForecast: !arrivedActFinal,
      kind: 'departure',
    })
  }

  {
    const status: OpsForecastRow['status'] = destLanded
      ? 'done'
      : liveLegOff
        ? 'active'
        : 'pending'
    const liveAirMin =
      status === 'active' && takeoffAct
        ? minutesBetween(takeoffAct, nowIso)
        : null
    rows.push({
      key: 'enroute_dest',
      label: `Enroute to ${destIcao}`,
      estimatedLocal: formatDurationMin(airEstMin),
      estimatedZulu: null,
      actualOrForecastLocal:
        airActMin != null
          ? formatDurationMin(airActMin)
          : liveAirMin != null
            ? `${formatDurationMin(liveAirMin)} · LIVE`
            : status === 'active'
              ? 'EN ROUTE · LIVE ADS-B'
              : formatDurationMin(airEstMin),
      deltaMin:
        airEstMin != null && airActMin != null ? airActMin - airEstMin : null,
      status,
      isForecast: airActMin == null,
      kind: 'duration',
    })
  }

  {
    const estFmt = landingEst ? formatClientLocal(landingEst, tz) : null
    const zulu = landingEst ? formatZuluLocal(landingEst, tz) : null
    const actFmt = landingAct ? formatClientLocal(landingAct, tz) : null
    const groundMin = destGroundMin
    const deltaMin =
      landingEst && landingAct
        ? Math.round(
            (Date.parse(landingAct) - Date.parse(landingEst)) / 60_000,
          )
        : null
    const status: OpsForecastRow['status'] = destDelivered
      ? 'done'
      : destLanded
        ? 'active'
        : 'pending'
    rows.push({
      key: 'landed_dest',
      label: destDelivered ? 'Delivered' : `Landed ${destIcao}`,
      estimatedLocal: estFmt?.local ?? null,
      estimatedZulu: zulu?.zulu ?? null,
      actualOrForecastLocal: destDelivered
        ? groundMin != null
          ? `DELIVERED · ${formatDurationMin(groundMin)} on ground`
          : 'DELIVERED'
        : landingAct && actFmt
          ? `${actFmt.local}${
              groundMin != null && groundMin > 0
                ? ` · ${formatDurationMin(groundMin)} on ground`
                : ''
            }`
          : status === 'active'
            ? `LANDING ${destIcao} · LIVE`
            : estFmt?.local ?? null,
      deltaMin: landingAct ? deltaMin : null,
      status,
      isForecast: !destLanded,
      kind: 'ground',
    })
  }

  return applyPortalStageOverride(rows, trip.portal_ops_stage)
}


export function buildCargoManifest(
  trip: PortalTrackingTripInput,
): PortalCargoManifest {
  const kind: PortalCargoManifest['payloadKind'] =
    trip.payload_kind === 'pax' ||
    trip.payload_kind === 'both' ||
    trip.payload_kind === 'cargo'
      ? trip.payload_kind
      : trip.hard_quote?.payload_kind === 'pax' ||
          trip.hard_quote?.payload_kind === 'both' ||
          trip.hard_quote?.payload_kind === 'cargo'
        ? trip.hard_quote.payload_kind
        : trip.pax_count && trip.pax_count > 0
          ? trip.cargo_lines?.length
            ? 'both'
            : 'pax'
          : 'cargo'

  const paxNames = (trip.pax_names ?? [])
    .map((n) => n.trim())
    .filter(Boolean)
  const paxCount = Math.max(trip.pax_count ?? 0, paxNames.length)

  const cargoLines: string[] = []
  for (const line of trip.cargo_lines ?? []) {
    const t = line.trim()
    if (t && !cargoLines.includes(t)) cargoLines.push(t)
  }
  const summary = trip.payload_summary.trim()
  if (
    summary &&
    !cargoLines.some((l) => l.toLowerCase() === summary.toLowerCase()) &&
    !/^\d+\s*pax\b/i.test(summary)
  ) {
    cargoLines.push(summary)
  }

  const bits: string[] = []
  if (paxCount > 0) {
    bits.push(`${paxCount} pax`)
    if (paxNames.length) bits.push(paxNames.join(', '))
  }
  if (cargoLines.length) bits.push(cargoLines.join(' · '))
  if (!bits.length) bits.push(summary || '—')

  return {
    payloadKind: kind,
    paxCount,
    paxNames,
    cargoLines,
    readyLabel: trip.ready_label,
    summaryLine: bits.join(' · '),
  }
}

function placeAddressHint(p: { icao?: string; label?: string }): string | null {
  const label = (p.label ?? '').trim()
  if (!label) return null
  // If label is just the ICAO, skip — not an address.
  if (p.icao && label.toUpperCase() === p.icao.toUpperCase()) return null
  return label
}

/**
 * Client itinerary stops: door pickup/delivery + departure/arrival FBOs (airports).
 * Pure from ETA chain — FBO directory enrichment happens outside domain.
 */
export function buildTrackingStops(
  trip: PortalTrackingTripInput,
): TrackingStop[] {
  const chain = trip.eta_chain
  const stops: TrackingStop[] = []
  const seen = new Set<string>()

  function push(stop: TrackingStop) {
    const key = `${stop.role}:${stop.icao ?? ''}:${stop.placeLabel}`
    if (seen.has(key)) return
    seen.add(key)
    stops.push(stop)
  }

  if (!chain.length) {
    const first = trip.legs[0]
    const last = trip.legs[trip.legs.length - 1]
    const lane = parseLaneAirports(trip.lane)
    const origin =
      first?.origin?.toUpperCase() || lane?.origin || null
    const dest =
      last?.dest?.toUpperCase() || lane?.dest || null
    if (origin) {
      push({
        role: 'departure_fbo',
        title: 'Departure airport',
        icao: origin,
        placeLabel: origin,
        addressHint: null,
        etaDisplay: first?.est_start
          ? formatClientLocal(first.est_start, 'UTC').display
          : null,
        etaActualDisplay: first?.actual_start
          ? formatClientLocal(first.actual_start, 'UTC').display
          : null,
        status:
          first?.status === 'done'
            ? 'done'
            : first?.status === 'active'
              ? 'active'
              : 'pending',
        tz: 'UTC',
        event: first?.label || 'Origin',
      })
    }
    if (dest) {
      push({
        role: 'arrival_fbo',
        title: 'Arrival airport',
        icao: dest,
        placeLabel: dest,
        addressHint: null,
        etaDisplay: last?.est_end
          ? formatClientLocal(last.est_end, 'UTC').display
          : null,
        etaActualDisplay: last?.actual_end
          ? formatClientLocal(last.actual_end, 'UTC').display
          : null,
        status:
          last?.status === 'done'
            ? 'done'
            : last?.status === 'active'
              ? 'active'
              : 'pending',
        tz: 'UTC',
        event: last?.label || 'Destination',
      })
    }
    return stops
  }

  for (const leg of chain) {
    const status = legStatus(leg, trip.legs)
    if (leg.type === 'truck_pickup') {
      const tz = leg.from.tz || 'UTC'
      push({
        role: 'pickup',
        title: 'Pickup',
        icao: leg.from.icao?.toUpperCase() ?? null,
        placeLabel: (leg.from.label || leg.from.icao || 'Pickup').trim(),
        addressHint: placeAddressHint(leg.from),
        etaDisplay: formatClientLocal(leg.est_start, tz).display,
        etaActualDisplay: leg.actual_start
          ? formatClientLocal(leg.actual_start, tz).display
          : null,
        status,
        tz,
        event: leg.event || leg.label,
      })
      if (leg.to.icao) {
        const tzTo = leg.to.tz || tz
        push({
          role: 'departure_fbo',
          title: 'Departure FBO / airport',
          icao: leg.to.icao.toUpperCase(),
          placeLabel: (leg.to.label || leg.to.icao).toUpperCase(),
          addressHint: placeAddressHint(leg.to),
          etaDisplay: formatClientLocal(leg.est_end, tzTo).display,
          etaActualDisplay: leg.actual_end
            ? formatClientLocal(leg.actual_end, tzTo).display
            : null,
          status,
          tz: tzTo,
          event: 'At departure FBO',
        })
      }
    }

    if (leg.type === 'air_leg') {
      const tzFrom = leg.from.tz || 'UTC'
      const tzTo = leg.to.tz || 'UTC'
      if (leg.from.icao) {
        push({
          role: 'departure_fbo',
          title: 'Departure FBO / airport',
          icao: leg.from.icao.toUpperCase(),
          placeLabel: (leg.from.label || leg.from.icao).toUpperCase(),
          addressHint: placeAddressHint(leg.from),
          etaDisplay: formatClientLocal(leg.est_start, tzFrom).display,
          etaActualDisplay: leg.actual_start
            ? formatClientLocal(leg.actual_start, tzFrom).display
            : null,
          status:
            status === 'pending' && !leg.actual_start ? 'pending' : status,
          tz: tzFrom,
          event: 'Wheels up',
        })
      }
      if (leg.to.icao) {
        push({
          role: 'arrival_fbo',
          title: 'Arrival FBO / airport',
          icao: leg.to.icao.toUpperCase(),
          placeLabel: (leg.to.label || leg.to.icao).toUpperCase(),
          addressHint: placeAddressHint(leg.to),
          etaDisplay: formatClientLocal(leg.est_end, tzTo).display,
          etaActualDisplay: leg.actual_end
            ? formatClientLocal(leg.actual_end, tzTo).display
            : null,
          status,
          tz: tzTo,
          event: 'Wheels down',
        })
      }
    }

    if (leg.type === 'truck_delivery' || leg.type === 'offload') {
      const tz = leg.to.tz || leg.from.tz || 'UTC'
      if (leg.from.icao && leg.type === 'truck_delivery') {
        push({
          role: 'arrival_fbo',
          title: 'Arrival FBO / airport',
          icao: leg.from.icao.toUpperCase(),
          placeLabel: (leg.from.label || leg.from.icao).toUpperCase(),
          addressHint: placeAddressHint(leg.from),
          etaDisplay: formatClientLocal(leg.est_start, leg.from.tz || tz).display,
          etaActualDisplay: leg.actual_start
            ? formatClientLocal(leg.actual_start, leg.from.tz || tz).display
            : null,
          status,
          tz: leg.from.tz || tz,
          event: 'Leave FBO for delivery',
        })
      }
      push({
        role: 'delivery',
        title: 'Delivery',
        icao: leg.to.icao?.toUpperCase() ?? null,
        placeLabel: (leg.to.label || leg.to.icao || 'Delivery').trim(),
        addressHint: placeAddressHint(leg.to),
        etaDisplay: formatClientLocal(leg.est_end, tz).display,
        etaActualDisplay: leg.actual_end
          ? formatClientLocal(leg.actual_end, tz).display
          : null,
        status,
        tz,
        event: leg.event || leg.label,
      })
    }
  }

  return stops
}

export function buildFlightFacts(
  trip: PortalTrackingTripInput,
): TrackingFlightFacts {
  const air =
    trip.eta_chain.find(
      (l) =>
        l.type === 'air_leg' &&
        (l.actual_start ||
          trip.legs.find((x) => x.seq === l.seq)?.status === 'active'),
    ) ?? trip.eta_chain.find((l) => l.type === 'air_leg')
  const lane = parseLaneAirports(trip.lane)
  const originIcao =
    air?.from.icao?.toUpperCase() ??
    trip.legs.find((l) => l.origin)?.origin?.toUpperCase() ??
    lane?.origin ??
    null
  const destIcao =
    air?.to.icao?.toUpperCase() ??
    trip.legs.find((l) => l.type === 'air_leg' && l.dest)?.dest?.toUpperCase() ??
    [...trip.legs].reverse().find((l) => l.dest)?.dest?.toUpperCase() ??
    lane?.dest ??
    null

  const wheelsUpDisplay = air
    ? formatClientLocal(
        air.actual_start ?? air.est_start,
        air.from.tz || 'UTC',
      ).display
    : null
  const wheelsDownDisplay = air
    ? formatClientLocal(
        air.actual_end ?? air.est_end,
        air.to.tz || 'UTC',
      ).display
    : null

  // Next arrival the client cares about: active/pending arrival FBO or delivery
  const stops = buildTrackingStops(trip)
  const next =
    stops.find((s) => s.status === 'active') ??
    stops.find(
      (s) =>
        s.status === 'pending' &&
        (s.role === 'arrival_fbo' || s.role === 'delivery'),
    ) ??
    stops.find((s) => s.status === 'pending')

  return {
    tail: trip.tail?.trim() || null,
    aircraftType: trip.aircraft_type?.trim() || null,
    originIcao,
    destIcao,
    wheelsUpDisplay,
    wheelsDownDisplay,
    nextArriveLabel: next
      ? next.role === 'arrival_fbo'
        ? `Arrive ${next.icao ?? next.placeLabel}`
        : next.role === 'delivery'
          ? 'Delivery'
          : next.role === 'departure_fbo'
            ? `At ${next.icao ?? next.placeLabel}`
            : next.title
      : null,
    nextArriveDisplay: next?.etaActualDisplay ?? next?.etaDisplay ?? null,
    cargo: trip.payload_summary || '—',
    readyLabel: trip.ready_label || '',
    pattern: trip.service_pattern ?? null,
  }
}

/**
 * Prefer live ADS-B keyed to the trip tail; else infer progress along the air leg.
 * LADD / blocked: skip live coords (no public position feed) but still show the
 * ETA-inferred track — same idea as FlightAware flight pages that keep the map
 * when registration is restricted.
 */
export function resolveAircraftPosition(
  trip: PortalTrackingTripInput,
  adsb: AdsbPosition | null,
  nowIso = new Date().toISOString(),
): TrackingAircraftPosition {
  const rawTail = trip.tail?.trim() || ''
  const tail = rawTail && rawTail.toUpperCase() !== 'TBD' ? rawTail : '—'
  const air =
    trip.eta_chain.find(
      (l) =>
        l.type === 'air_leg' &&
        (l.actual_start ||
          trip.legs.find((x) => x.seq === l.seq)?.status === 'active'),
    ) ?? trip.eta_chain.find((l) => l.type === 'air_leg')

  const fromResolved = resolvePlaceCoords(air?.from)
  const toResolved = resolvePlaceCoords(air?.to)
  const fromIcao = fromResolved?.icao ?? air?.from.icao ?? null
  const toIcao = toResolved?.icao ?? air?.to.icao ?? null
  const route = {
    fromLat: fromResolved?.lat ?? null,
    fromLon: fromResolved?.lon ?? null,
    toLat: toResolved?.lat ?? null,
    toLon: toResolved?.lon ?? null,
  }

  const emptyBase = {
    tail,
    fromIcao,
    toIcao,
    ...route,
  }

  const liveAdsb =
    adsb &&
    adsb.laddBlocked !== true &&
    adsb.phase !== 'no_data' &&
    hasCoords(adsb.lat, adsb.lon) &&
    adsbFixIsFresh(
      adsb.seenAt,
      Date.parse(nowIso),
      ADSB_USABLE_FIX_MAX_AGE_MIN,
    )
      ? adsb
      : null

  if (liveAdsb) {
    const phase =
      liveAdsb.phase === 'airborne'
        ? 'airborne'
        : liveAdsb.phase === 'on_ground'
          ? 'on_ground'
          : 'unknown'
    let nmRemaining: number | null = null
    let progressPct: number | null = null
    if (fromResolved && toResolved && phase === 'airborne') {
      const total = haversineNm(
        fromResolved.lat,
        fromResolved.lon,
        toResolved.lat,
        toResolved.lon,
      )
      const rem = haversineNm(
        liveAdsb.lat,
        liveAdsb.lon,
        toResolved.lat,
        toResolved.lon,
      )
      nmRemaining = rem
      progressPct =
        total > 0 ? Math.max(0, Math.min(100, ((total - rem) / total) * 100)) : null
    }
    return {
      ...emptyBase,
      phase,
      lat: liveAdsb.lat,
      lon: liveAdsb.lon,
      altFt: liveAdsb.alt,
      gsKts: liveAdsb.gs,
      summary:
        phase === 'airborne'
          ? `${tail} airborne${fromIcao && toIcao ? ` ${fromIcao}→${toIcao}` : ''} · ${Math.round(liveAdsb.alt)} ft · ${Math.round(liveAdsb.gs)} kts`
          : phase === 'on_ground'
            ? `${tail} on the ground${fromIcao ? ` · ${fromIcao}` : ''}`
            : `${tail} · last fix`,
      source: 'adsb',
      seenAt: liveAdsb.seenAt,
      progressPct,
      nmRemaining,
      laddBlocked: false,
    }
  }

  // ETA-inferred (includes true LADD — no live feed, keep schedule track like FlightAware).
  // ETA-inferred: active or imminent air leg
  if (air && fromResolved && toResolved) {
    const start = Date.parse(air.actual_start ?? air.est_start)
    const end = Date.parse(air.actual_end ?? air.est_end)
    const now = Date.parse(nowIso)
    const hasStarted = Boolean(air.actual_start) || now >= start
    const hasLanded = Boolean(air.actual_end) || (hasStarted && now >= end)

    if (hasLanded) {
      return {
        ...emptyBase,
        phase: 'on_ground',
        lat: toResolved.lat,
        lon: toResolved.lon,
        altFt: null,
        gsKts: 0,
        summary: `${tail} arrived ${toIcao ?? 'destination'} (from schedule)`,
        source: 'eta',
        seenAt: air.actual_end ?? air.est_end,
        progressPct: 100,
        nmRemaining: 0,
        laddBlocked: false,
      }
    }

    if (hasStarted && end > start) {
      const frac = Math.min(0.99, Math.max(0.01, (now - start) / (end - start)))
      const pos = interpolateGc(
        { lat: fromResolved.lat, lon: fromResolved.lon },
        { lat: toResolved.lat, lon: toResolved.lon },
        frac,
      )
      const rem = haversineNm(pos.lat, pos.lon, toResolved.lat, toResolved.lon)
      return {
        ...emptyBase,
        phase: 'airborne',
        lat: pos.lat,
        lon: pos.lon,
        altFt: null,
        gsKts: null,
        summary: `${tail} en route ${fromIcao ?? ''}→${toIcao ?? ''} · ~${Math.round(rem)} NM remaining (ETA estimate)`,
        source: 'eta',
        seenAt: nowIso,
        progressPct: Math.round(frac * 100),
        nmRemaining: Math.round(rem),
        laddBlocked: false,
      }
    }

    // Positioning / not yet wheels-up — still show route on the map
    const posLeg = trip.eta_chain.find((l) => l.type === 'position')
    const posAt = resolvePlaceCoords(posLeg?.to) ?? fromResolved
    // Prefer live position along the positioning leg when mid-ferry by schedule
    let lat = posAt.lat
    let lon = posAt.lon
    let phase: TrackingAircraftPosition['phase'] = 'positioning'
    if (posLeg && resolvePlaceCoords(posLeg.from) && resolvePlaceCoords(posLeg.to)) {
      const pFrom = resolvePlaceCoords(posLeg.from)!
      const pTo = resolvePlaceCoords(posLeg.to)!
      const pStart = Date.parse(posLeg.actual_start ?? posLeg.est_start)
      const pEnd = Date.parse(posLeg.actual_end ?? posLeg.est_end)
      if (
        !posLeg.actual_end &&
        Number.isFinite(pStart) &&
        Number.isFinite(pEnd) &&
        pEnd > pStart &&
        now >= pStart &&
        now < pEnd
      ) {
        const frac = Math.min(0.99, Math.max(0.01, (now - pStart) / (pEnd - pStart)))
        const mid = interpolateGc(
          { lat: pFrom.lat, lon: pFrom.lon },
          { lat: pTo.lat, lon: pTo.lon },
          frac,
        )
        lat = mid.lat
        lon = mid.lon
        phase = 'airborne'
      }
    }
    return {
      ...emptyBase,
      phase,
      lat,
      lon,
      altFt: null,
      gsKts: null,
      summary:
        phase === 'airborne'
          ? `${tail} enroute to pickup ${fromIcao ?? ''}`
          : `${tail} positioning to ${fromIcao ?? 'origin'} · wheels-up est ${formatClientLocal(air.est_start, air.from.tz || 'UTC').local}`,
      source: 'eta',
      seenAt: nowIso,
      progressPct: null,
      nmRemaining: Math.round(
        haversineNm(
          fromResolved.lat,
          fromResolved.lon,
          toResolved.lat,
          toResolved.lon,
        ),
      ),
      laddBlocked: false,
    }
  }

  return {
    ...emptyBase,
    phase: 'unknown',
    lat: null,
    lon: null,
    altFt: null,
    gsKts: null,
    summary: rawTail
      ? 'Live radar unavailable — ETA sheet below stays current'
      : 'Assign a tail on dispatch for ADS-B — ETA sheet below stays current',
    source: 'none',
    seenAt: null,
    fromIcao: null,
    toIcao: null,
    fromLat: null,
    fromLon: null,
    toLat: null,
    toLon: null,
    progressPct: null,
    nmRemaining: null,
    laddBlocked: false,
  }
}

const MONEY_RE = /\$|price|invoice|qb|cost|margin|vendor|net/i

function clientTimeline(
  trip: PortalTrackingTripInput,
): Array<{ at: string; label: string; detail: string }> {
  const out: Array<{ at: string; label: string; detail: string }> = []
  const labelFor = (kind: string): string | null => {
    const map: Record<string, string> = {
      created_from_estimate: 'Estimate prepared',
      estimated_quote_sent: 'Estimate emailed',
      eta_sheet_sent: 'ETA sheet sent',
      eta_chain_copied_to_trip: 'Trip booked — tracking live',
      create_thread: 'Trip communications opened',
      quick_dispatch: 'Trip dispatched',
      one_tap_checkin: 'Checkpoint confirmed',
      thread_actual_applied: 'Status update from crew',
      thread_actual_suggested: 'Status update pending confirm',
      invoice_created: 'Invoice issued',
      wx_brief: 'Weather brief filed',
      pod: 'Proof of delivery captured',
    }
    if (map[kind]) return map[kind]
    if (isStateTransitionKind(kind)) return 'Status change'
    if (kind.startsWith('leg_')) return 'Leg update'
    return null
  }

  for (const e of [...trip.events].sort((a, b) => a.at.localeCompare(b.at))) {
    if (MONEY_RE.test(e.kind + JSON.stringify(e.payload ?? {}))) continue
    const label = labelFor(e.kind)
    if (!label) continue
    let detail = ''
    if (isStateTransitionKind(e.kind)) {
      const to = String(e.payload.to ?? e.payload.to_state ?? '')
      if (to) detail = to.replace(/_/g, ' ')
    }
    if (e.kind === 'thread_actual_applied') {
      detail = String(e.payload.kind ?? '')
    }
    out.push({ at: e.at, label, detail })
  }

  // Always surface quote approved / booked from milestones even if event kinds differ
  const ms = buildMilestones(trip)
  for (const m of ms) {
    if (!m.at || !m.done) continue
    if (out.some((o) => o.label === m.label)) continue
    out.push({ at: m.at, label: m.label, detail: '' })
  }

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20)
}

export function buildPortalTrackingView(
  trip: PortalTrackingTripInput,
  opts?: { adsb?: AdsbPosition | null; nowIso?: string },
): PortalTrackingView {
  const nowIso = opts?.nowIso ?? new Date().toISOString()
  const milestones = buildMilestones(trip, nowIso)
  const etaRows = buildEtaRows(trip)
  const opsForecastRows = buildOpsForecastRows(trip, {
    adsb: opts?.adsb ?? null,
    nowIso,
  })
  const cargo = buildCargoManifest(trip)
  const aircraft = resolveAircraftPosition(trip, opts?.adsb ?? null, nowIso)

  const promised = trip.promised_delivery ?? projectedDeliveryUtc(trip.eta_chain)
  const projected = projectedDeliveryUtc(trip.eta_chain)
  const lastTz =
    trip.eta_chain[trip.eta_chain.length - 1]?.to.tz ||
    trip.eta_chain[trip.eta_chain.length - 1]?.from.tz ||
    'UTC'

  const current = milestones.find((m) => m.current && !m.done)
  const nextLabel =
    current?.label ??
    milestones.filter((m) => !m.done)[0]?.label ??
    (milestones.every((m) => m.done) ? 'Complete' : 'Next update')

  const clientDocs = (trip.documents ?? []).filter(
    (d) =>
      d.kind === 'eta_sheet' ||
      d.kind === 'quote' ||
      d.kind === 'pod' ||
      d.kind === 'manifest',
  )

  const destDone =
    opsForecastRows.find((r) => r.key === 'landed_dest')?.status === 'done' &&
    opsForecastRows.find((r) => r.key === 'landed_dest')?.label === 'Delivered'
  const phase = destDone
    ? 'delivered'
    : classifyPortalShipmentPhase({
        state: trip.state,
        aircraftPhase: aircraft.phase,
        legs: trip.legs,
      })
  const eteMin = eteMinutesRemaining(aircraft.nmRemaining, aircraft.gsKts)
  const flightFacts = buildFlightFacts(trip)
  const flightActivity = groupTailFlightActivity(
    filterPortalTailActivity(legsFromSnapshots(opts?.adsb?.flights), {
      originIcao: flightFacts.originIcao,
      destIcao: flightFacts.destIcao,
    }),
  )

  return {
    ref: trip.ref,
    code: trip.code?.trim() || null,
    poNumber: trip.po_number?.trim() || null,
    lane: trip.lane,
    state: trip.state,
    phase,
    readyLabel: trip.ready_label,
    payloadSummary: trip.payload_summary,
    pattern: trip.service_pattern ?? null,
    tail: trip.tail ?? null,
    aircraftType: trip.aircraft_type ?? null,
    carrierLabel: 'a vetted Part 135 carrier',
    promisedDisplay: promised
      ? formatClientLocal(promised, lastTz).display
      : null,
    projectedDisplay: projected
      ? formatClientLocal(projected, lastTz).display
      : null,
    deltaMin: deliveryDeltaMin(projected, promised),
    eteMin,
    eteLabel: formatEteLabel(eteMin),
    nextMilestoneLabel: nextLabel,
    milestones,
    etaRows,
    opsForecastRows,
    flightActivity,
    aircraft,
    timeline: clientTimeline(trip),
    documents: clientDocs.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      at: d.at,
      url: d.url,
    })),
    stops: buildTrackingStops(trip),
    flightFacts,
    cargo,
    pickupStreet: trip.pickup_street?.trim() || null,
    dropoffStreet: trip.dropoff_street?.trim() || null,
    pickupStop: trip.pickup_stop
      ? normalizePortalStop(trip.pickup_stop)
      : portalStopFromLegacyAddress(trip.pickup_street),
    dropoffStop: trip.dropoff_stop
      ? normalizePortalStop(trip.dropoff_stop)
      : portalStopFromLegacyAddress(trip.dropoff_street),
  }
}

function cargoLinesFromEvents(
  events: PortalTrackingTripInput['events'],
): string[] {
  const lines: string[] = []
  const push = (raw: unknown) => {
    const t = String(raw ?? '').trim()
    if (!t) return
    if (!lines.some((l) => l.toLowerCase() === t.toLowerCase())) lines.push(t)
  }
  for (const e of events) {
    if (
      e.kind === 'desk_scratch_spool' ||
      e.kind === 'quick_dispatch' ||
      e.kind === 'portal_request'
    ) {
      push(e.payload.cargo_summary)
      push(e.payload.pieces_text)
      push(e.payload.mission_summary)
      push(e.payload.cargo_notes)
    }
  }
  return lines
}

function paxNamesFromEvents(
  events: PortalTrackingTripInput['events'],
): string[] {
  for (const e of [...events].reverse()) {
    const raw = e.payload.pax_names ?? e.payload.passenger_names
    if (Array.isArray(raw)) {
      return raw.map((n) => String(n).trim()).filter(Boolean)
    }
    if (typeof raw === 'string' && raw.trim()) {
      return raw
        .split(/[,;\n]+/)
        .map((n) => n.trim())
        .filter(Boolean)
    }
  }
  return []
}

/** Map trip store row → tracking input (strips money fields by omission). */
export function tripToTrackingInput(trip: {
  ref: number
  code?: string | null
  po_number?: string | null
  lane: string
  state: string
  ready_label: string
  payload_summary: string
  service_pattern?: ServicePattern | null
  promised_delivery?: string | null
  eta_chain?: ChainLeg[]
  legs: PortalTrackingTripInput['legs']
  events: PortalTrackingTripInput['events']
  documents?: PortalTrackingTripInput['documents']
  quick?: {
    tail?: string
    aircraft_type?: string
    po?: string
    cargo_only?: boolean
    notes?: string
    legs?: Array<{ pax: number }>
  } | null
  offers?: Array<{ state: string; tail: string; type_name: string | null }>
  hard_quote?: {
    disclosure_at?: string
    payload_kind?: 'cargo' | 'pax' | 'both'
    options?: Array<{
      type_name?: string | null
      tail?: string | null
    }>
  } | null
  portal_pickup_address?: string | null
  portal_dropoff_address?: string | null
  portal_pickup_stop?: PortalStopLocation | null
  portal_dropoff_stop?: PortalStopLocation | null
  portal_pax_names?: string[] | null
  passengers?: Array<{
    name?: string
    first_name?: string
    last_name?: string
  }> | null
  portal_cargo?: {
    dims?: string
    total_weight_lbs?: number | '' | null
  } | null
  portal_ops_stage?: PortalOpsStageKey | null
}): PortalTrackingTripInput {
  const selected =
    trip.offers?.find((o) => o.state === 'selected') ??
    trip.offers?.find((o) => o.state === 'quoted')
  const quickPax =
    trip.quick?.legs?.reduce((n, l) => n + (Number(l.pax) || 0), 0) ?? 0
  const eventPax = paxNamesFromEvents(trip.events)
  const structuredNames = (trip.passengers ?? [])
    .map((p) => {
      const full = String(p.name ?? '').trim()
      if (full) return full
      return [p.first_name, p.last_name]
        .map((s) => String(s ?? '').trim())
        .filter(Boolean)
        .join(' ')
    })
    .filter(Boolean)
  const paxNames = [
    ...structuredNames,
    ...(trip.portal_pax_names ?? []),
    ...eventPax,
  ].filter((n, i, arr) => n && arr.indexOf(n) === i)
  const cargoLines = cargoLinesFromEvents(trip.events)
  if (trip.portal_cargo?.dims?.trim()) {
    const dims = `Dims: ${trip.portal_cargo.dims.trim()}`
    if (!cargoLines.some((l) => l.toLowerCase() === dims.toLowerCase())) {
      cargoLines.push(dims)
    }
  }
  if (
    trip.portal_cargo?.total_weight_lbs != null &&
    trip.portal_cargo.total_weight_lbs !== '' &&
    Number.isFinite(Number(trip.portal_cargo.total_weight_lbs))
  ) {
    const wt = `Total weight: ${Number(trip.portal_cargo.total_weight_lbs)} lb`
    if (!cargoLines.some((l) => l.toLowerCase() === wt.toLowerCase())) {
      cargoLines.push(wt)
    }
  }
  if (trip.quick?.notes?.trim()) {
    const note = trip.quick.notes.trim()
    if (!cargoLines.some((l) => l.toLowerCase() === note.toLowerCase())) {
      cargoLines.push(note)
    }
  }
  const deskPax = [...trip.events]
    .reverse()
    .find((e) => e.kind === 'desk_scratch_spool' || e.kind === 'quick_dispatch')
  const deskPaxCount = Number(deskPax?.payload.pax_count ?? 0) || 0
  const payloadKind: PortalTrackingTripInput['payload_kind'] =
    trip.hard_quote?.payload_kind ??
    (trip.quick
      ? trip.quick.cargo_only
        ? 'cargo'
        : quickPax > 0
          ? 'pax'
          : 'cargo'
      : null)

  // Door addresses from ETA place labels when not ICAO-only.
  let pickupStreet = trip.portal_pickup_address?.trim() || null
  let dropoffStreet = trip.portal_dropoff_address?.trim() || null
  const pickupStop =
    trip.portal_pickup_stop
      ? normalizePortalStop(trip.portal_pickup_stop)
      : portalStopFromLegacyAddress(pickupStreet)
  const dropoffStop =
    trip.portal_dropoff_stop
      ? normalizePortalStop(trip.portal_dropoff_stop)
      : portalStopFromLegacyAddress(dropoffStreet)
  if (!pickupStreet && pickupStop) {
    pickupStreet =
      formatPortalStopAddress(pickupStop) ||
      (pickupStop.kind === 'tbd' ? null : formatPortalStopTitle(pickupStop))
  }
  if (!dropoffStreet && dropoffStop) {
    dropoffStreet =
      formatPortalStopAddress(dropoffStop) ||
      (dropoffStop.kind === 'tbd' ? null : formatPortalStopTitle(dropoffStop))
  }
  for (const leg of trip.eta_chain ?? []) {
    if (
      !pickupStreet &&
      (leg.type === 'truck_pickup' || leg.event === 'At Shipper')
    ) {
      const label = (leg.from.label || '').trim()
      if (label && label.toUpperCase() !== (leg.from.icao || '').toUpperCase()) {
        pickupStreet = label
      }
    }
    if (
      !dropoffStreet &&
      (leg.type === 'truck_delivery' || leg.event === 'Delivered')
    ) {
      const label = (leg.to.label || '').trim()
      if (label && label.toUpperCase() !== (leg.to.icao || '').toUpperCase()) {
        dropoffStreet = label
      }
    }
  }

  return {
    ref: trip.ref,
    code: trip.code ?? null,
    po_number: trip.po_number?.trim() || trip.quick?.po?.trim() || null,
    lane: trip.lane,
    state: trip.state,
    ready_label: trip.ready_label,
    payload_summary: trip.payload_summary,
    service_pattern: trip.service_pattern ?? null,
    promised_delivery: trip.promised_delivery ?? null,
    eta_chain: trip.eta_chain ?? [],
    legs: trip.legs,
    events: trip.events,
    documents: trip.documents,
    tail: resolveTrackingTail(trip, selected),
    aircraft_type:
      trip.quick?.aircraft_type ||
      selected?.type_name ||
      hqOptType(trip) ||
      eventAircraftType(trip.events) ||
      null,
    hard_quote: trip.hard_quote ?? null,
    pax_count: Math.max(quickPax, deskPaxCount, paxNames.length),
    pax_names: paxNames,
    cargo_lines: cargoLines,
    payload_kind: payloadKind,
    pickup_street: pickupStreet,
    dropoff_street: dropoffStreet,
    pickup_stop: pickupStop,
    dropoff_stop: dropoffStop,
    portal_ops_stage: isPortalOpsStageKey(trip.portal_ops_stage)
      ? trip.portal_ops_stage
      : null,
  }
}

function hqOptType(trip: {
  hard_quote?: {
    options?: Array<{ type_name?: string | null; tail?: string | null }>
  } | null
}): string | null {
  const t = trip.hard_quote?.options?.[0]?.type_name?.trim()
  return t || null
}

function eventAircraftType(
  events: PortalTrackingTripInput['events'],
): string | null {
  for (const e of [...events].reverse()) {
    if (e.kind !== 'quick_dispatch') continue
    const t = String(e.payload.aircraft_type ?? '').trim()
    if (t) return t
  }
  return null
}

/** Prefer quick → selected offer → hard_quote option → quick_dispatch event. */
function resolveTrackingTail(
  trip: {
    quick?: { tail?: string } | null
    hard_quote?: {
      options?: Array<{ tail?: string | null }>
    } | null
    events: PortalTrackingTripInput['events']
  },
  selected?: { tail?: string } | null,
): string | null {
  const candidates = [
    trip.quick?.tail,
    selected?.tail,
    trip.hard_quote?.options?.[0]?.tail,
    ...[...trip.events]
      .reverse()
      .filter((e) => e.kind === 'quick_dispatch')
      .map((e) => e.payload.tail),
  ]
  for (const raw of candidates) {
    const t = String(raw ?? '')
      .trim()
      .toUpperCase()
    if (t && t !== 'TBD' && t.length >= 2) return t
  }
  return null
}
