/**
 * Client live-tracking view — pure TS, portal-safe (no operator cost/margin/identity).
 * Builds milestones, ETA rows, and aircraft position (ADS-B or ETA-inferred).
 */

import type { AdsbPosition } from '@/adapters/adsb'
import type { ChainLeg, ServicePattern } from '@/domain/etaChain'
import {
  deliveryDeltaMin,
  projectedDeliveryUtc,
} from '@/domain/etaChain'
import { haversineNm } from '@/domain/geo'
import { formatClientLocal, formatZuluLocal } from '@/domain/timeFmt'

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
 * Client Actual vs Forecast — pickup arrival, loading (turn), live air leg.
 * Derived from ETA chain arrival / takeoff / landing stamps.
 */
export type OpsForecastRow = {
  key: 'pickup' | 'loading' | 'live_leg'
  /** e.g. "Pickup in KCAK", "Loading time", "Live leg KCAK → KMDW" */
  label: string
  estimatedLocal: string | null
  estimatedZulu: string | null
  actualOrForecastLocal: string | null
  /** Minutes early (−) / late (+) — or duration delta for loading. */
  deltaMin: number | null
  status: 'done' | 'active' | 'pending'
  isForecast: boolean
  /** Loading row compares durations; pickup/live compare clock times. */
  kind: 'arrival' | 'duration' | 'flight'
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
}

/** True when the portal can render a little live map for this trip stage. */
export function portalAircraftMapVisible(a: TrackingAircraftPosition): boolean {
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
      actual_start: leg.actual_start,
      actual_end: leg.actual_end,
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
 * Pickup arrival → loading (turn) → live air leg, from chain (or legs) stamps.
 */
export function buildOpsForecastRows(
  trip: PortalTrackingTripInput,
): OpsForecastRow[] {
  const stamps = stampsFromTrip(trip)
  if (!stamps.length) return []

  const position = stamps.find(isPositionStamp) ?? stamps[0] ?? null
  const air =
    stamps.find(isAirStamp) ??
    stamps.find(
      (s) =>
        s.fromIcao !== s.toIcao &&
        s !== position &&
        !isTurnStamp(s),
    ) ??
    null
  const turn =
    stamps.find(
      (s) =>
        isTurnStamp(s) &&
        (!air || s.seq < air.seq) &&
        (!position || s.seq >= position.seq),
    ) ?? null

  const rows: OpsForecastRow[] = []

  if (position) {
    const tz = position.tz
    const icao = position.toIcao !== '—' ? position.toIcao : position.fromIcao
    const status = position.status
    const estIso = position.est_end
    const actIso = position.actual_end
    const deltaMin =
      estIso && actIso
        ? Math.round((Date.parse(actIso) - Date.parse(estIso)) / 60_000)
        : null
    const estFmt = estIso ? formatClientLocal(estIso, tz) : null
    const zulu = estIso ? formatZuluLocal(estIso, tz) : null
    const actFmt = actIso ? formatClientLocal(actIso, tz) : null
    rows.push({
      key: 'pickup',
      label: `Pickup in ${icao}`,
      estimatedLocal: estFmt?.local ?? null,
      estimatedZulu: zulu?.zulu ?? null,
      actualOrForecastLocal:
        actFmt?.local ??
        (status === 'active' ? 'ARRIVING · LIVE' : estFmt?.local ?? null),
      deltaMin: actIso ? deltaMin : status === 'active' ? null : deltaMin,
      status,
      isForecast: !actIso,
      kind: 'arrival',
    })
  }

  if (turn || (position && air)) {
    const estDur =
      turn?.duration_min ??
      minutesBetween(position?.est_end ?? null, air?.est_start ?? null)
    const actDur = minutesBetween(
      position?.actual_end ?? turn?.actual_start ?? null,
      air?.actual_start ?? turn?.actual_end ?? null,
    )
    const status = turn
      ? turn.status
      : air?.actual_start
        ? 'done'
        : position && position.status === 'done'
          ? 'active'
          : 'pending'
    const deltaMin =
      estDur != null && actDur != null ? actDur - estDur : null
    rows.push({
      key: 'loading',
      label: 'Loading time',
      estimatedLocal: formatDurationMin(estDur),
      estimatedZulu: null,
      actualOrForecastLocal:
        actDur != null
          ? formatDurationMin(actDur)
          : status === 'active'
            ? 'LOADING · LIVE'
            : formatDurationMin(estDur),
      deltaMin: actDur != null ? deltaMin : null,
      status,
      isForecast: actDur == null,
      kind: 'duration',
    })
  }

  if (air) {
    const tz = air.tz
    const from = air.fromIcao
    const to = air.toIcao
    const status = air.status
    const estIso = air.est_end
    const actIso = air.actual_end
    const takeoffEst = air.est_start
      ? formatClientLocal(air.est_start, tz).local
      : null
    const takeoffAct = air.actual_start
      ? formatClientLocal(air.actual_start, tz).local
      : null
    const estFmt = estIso ? formatClientLocal(estIso, tz) : null
    const zulu = estIso ? formatZuluLocal(estIso, tz) : null
    const actFmt = actIso ? formatClientLocal(actIso, tz) : null
    const deltaMin =
      estIso && actIso
        ? Math.round((Date.parse(actIso) - Date.parse(estIso)) / 60_000)
        : null
    const landingLabel = actFmt?.local ?? estFmt?.local
    const takeoffBit = takeoffAct || takeoffEst
    rows.push({
      key: 'live_leg',
      label: `Live leg ${from} → ${to}`,
      estimatedLocal: estFmt?.local
        ? takeoffEst
          ? `${takeoffEst} → ${estFmt.local}`
          : estFmt.local
        : formatDurationMin(air.duration_min),
      estimatedZulu: zulu?.zulu ?? null,
      actualOrForecastLocal: actIso
        ? takeoffAct
          ? `${takeoffAct} → ${actFmt!.local}`
          : actFmt!.local
        : status === 'active'
          ? 'IN FLIGHT · LIVE'
          : landingLabel
            ? takeoffBit
              ? `${takeoffBit} → ${landingLabel}`
              : landingLabel
            : formatDurationMin(air.duration_min),
      deltaMin: actIso ? deltaMin : null,
      status,
      isForecast: !actIso,
      kind: 'flight',
    })
  }

  return rows
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
    if (first?.origin) {
      push({
        role: 'departure_fbo',
        title: 'Departure airport',
        icao: first.origin.toUpperCase(),
        placeLabel: first.origin.toUpperCase(),
        addressHint: null,
        etaDisplay: first.est_start
          ? formatClientLocal(first.est_start, 'UTC').display
          : null,
        etaActualDisplay: first.actual_start
          ? formatClientLocal(first.actual_start, 'UTC').display
          : null,
        status:
          first.status === 'done'
            ? 'done'
            : first.status === 'active'
              ? 'active'
              : 'pending',
        tz: 'UTC',
        event: first.label,
      })
    }
    if (last?.dest) {
      push({
        role: 'arrival_fbo',
        title: 'Arrival airport',
        icao: last.dest.toUpperCase(),
        placeLabel: last.dest.toUpperCase(),
        addressHint: null,
        etaDisplay: last.est_end
          ? formatClientLocal(last.est_end, 'UTC').display
          : null,
        etaActualDisplay: last.actual_end
          ? formatClientLocal(last.actual_end, 'UTC').display
          : null,
        status:
          last.status === 'done'
            ? 'done'
            : last.status === 'active'
              ? 'active'
              : 'pending',
        tz: 'UTC',
        event: last.label,
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
  const air = trip.eta_chain.find((l) => l.type === 'air_leg')
  const originIcao =
    air?.from.icao?.toUpperCase() ??
    trip.legs.find((l) => l.origin)?.origin?.toUpperCase() ??
    null
  const destIcao =
    air?.to.icao?.toUpperCase() ??
    [...trip.legs].reverse().find((l) => l.dest)?.dest?.toUpperCase() ??
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
 * Prefer live ADS-B; else infer progress along the active air leg from the ETA chain.
 */
export function resolveAircraftPosition(
  trip: PortalTrackingTripInput,
  adsb: AdsbPosition | null,
  nowIso = new Date().toISOString(),
): TrackingAircraftPosition {
  const tail = trip.tail?.trim() || '—'
  const air =
    trip.eta_chain.find(
      (l) =>
        l.type === 'air_leg' &&
        (l.actual_start ||
          trip.legs.find((x) => x.seq === l.seq)?.status === 'active'),
    ) ?? trip.eta_chain.find((l) => l.type === 'air_leg')

  const fromIcao = air?.from.icao ?? null
  const toIcao = air?.to.icao ?? null
  const route = {
    fromLat: air?.from.lat ?? null,
    fromLon: air?.from.lon ?? null,
    toLat: air?.to.lat ?? null,
    toLon: air?.to.lon ?? null,
  }

  if (adsb && !adsb.laddBlocked && adsb.phase !== 'no_data' && (adsb.lat || adsb.lon)) {
    const phase =
      adsb.phase === 'airborne'
        ? 'airborne'
        : adsb.phase === 'on_ground'
          ? 'on_ground'
          : 'unknown'
    let nmRemaining: number | null = null
    let progressPct: number | null = null
    if (air && phase === 'airborne') {
      const total = haversineNm(air.from.lat, air.from.lon, air.to.lat, air.to.lon)
      const rem = haversineNm(adsb.lat, adsb.lon, air.to.lat, air.to.lon)
      nmRemaining = Math.round(rem)
      progressPct =
        total > 0 ? Math.round(Math.min(99, Math.max(1, ((total - rem) / total) * 100))) : null
    }
    return {
      tail,
      phase,
      lat: adsb.lat,
      lon: adsb.lon,
      altFt: Math.round(adsb.alt),
      gsKts: Math.round(adsb.gs),
      summary:
        phase === 'airborne'
          ? `Airborne${fromIcao && toIcao ? ` ${fromIcao}→${toIcao}` : ''} · ${Math.round(adsb.alt)} ft · ${Math.round(adsb.gs)} kts`
          : phase === 'on_ground'
            ? `On the ground${fromIcao ? ` near ${fromIcao}` : ''}`
            : 'Position received',
      source: 'adsb',
      seenAt: adsb.seenAt,
      fromIcao,
      toIcao,
      ...route,
      progressPct,
      nmRemaining,
    }
  }

  // ETA-inferred: active or imminent air leg
  if (air && air.from.lat && air.to.lat) {
    const start = Date.parse(air.actual_start ?? air.est_start)
    const end = Date.parse(air.actual_end ?? air.est_end)
    const now = Date.parse(nowIso)
    const hasStarted = Boolean(air.actual_start) || now >= start
    const hasLanded = Boolean(air.actual_end) || (hasStarted && now >= end)

    if (hasLanded) {
      return {
        tail,
        phase: 'on_ground',
        lat: air.to.lat,
        lon: air.to.lon,
        altFt: null,
        gsKts: 0,
        summary: `Arrived ${toIcao ?? 'destination'} (from schedule)`,
        source: 'eta',
        seenAt: air.actual_end ?? air.est_end,
        fromIcao,
        toIcao,
        ...route,
        progressPct: 100,
        nmRemaining: 0,
      }
    }

    if (hasStarted && end > start) {
      const frac = Math.min(0.99, Math.max(0.01, (now - start) / (end - start)))
      const pos = interpolateGc(air.from, air.to, frac)
      const rem = haversineNm(pos.lat, pos.lon, air.to.lat, air.to.lon)
      return {
        tail,
        phase: 'airborne',
        lat: pos.lat,
        lon: pos.lon,
        altFt: null,
        gsKts: null,
        summary: `En route ${fromIcao ?? ''}→${toIcao ?? ''} · ~${Math.round(rem)} NM remaining (ETA estimate)`,
        source: 'eta',
        seenAt: nowIso,
        fromIcao,
        toIcao,
        ...route,
        progressPct: Math.round(frac * 100),
        nmRemaining: Math.round(rem),
      }
    }

    // Positioning / not yet wheels-up
    const posLeg = trip.eta_chain.find((l) => l.type === 'position')
    return {
      tail,
      phase: 'positioning',
      lat: posLeg?.to.lat ?? air.from.lat,
      lon: posLeg?.to.lon ?? air.from.lon,
      altFt: null,
      gsKts: null,
      summary: `Aircraft positioning to ${fromIcao ?? 'origin'} · wheels-up est ${formatClientLocal(air.est_start, air.from.tz || 'UTC').local}`,
      source: 'eta',
      seenAt: nowIso,
      fromIcao,
      toIcao,
      ...route,
      progressPct: null,
      nmRemaining: Math.round(
        haversineNm(air.from.lat, air.from.lon, air.to.lat, air.to.lon),
      ),
    }
  }

  return {
    tail,
    phase: 'unknown',
    lat: null,
    lon: null,
    altFt: null,
    gsKts: null,
    summary: trip.tail
      ? 'Live radar unavailable — ETA sheet below stays current'
      : 'Aircraft assigned at booking — tracking unlocks then',
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
  const opsForecastRows = buildOpsForecastRows(trip)
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

  const phase = classifyPortalShipmentPhase({
    state: trip.state,
    aircraftPhase: aircraft.phase,
    legs: trip.legs,
  })
  const eteMin = eteMinutesRemaining(aircraft.nmRemaining, aircraft.gsKts)

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
    flightFacts: buildFlightFacts(trip),
    cargo,
    pickupStreet: trip.pickup_street?.trim() || null,
    dropoffStreet: trip.dropoff_street?.trim() || null,
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
  } | null
  portal_pickup_address?: string | null
  portal_dropoff_address?: string | null
  portal_pax_names?: string[] | null
}): PortalTrackingTripInput {
  const selected =
    trip.offers?.find((o) => o.state === 'selected') ??
    trip.offers?.find((o) => o.state === 'quoted')
  const quickPax =
    trip.quick?.legs?.reduce((n, l) => n + (Number(l.pax) || 0), 0) ?? 0
  const eventPax = paxNamesFromEvents(trip.events)
  const paxNames = [
    ...(trip.portal_pax_names ?? []),
    ...eventPax,
  ].filter((n, i, arr) => n && arr.indexOf(n) === i)
  const cargoLines = cargoLinesFromEvents(trip.events)
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
    tail: trip.quick?.tail || selected?.tail || null,
    aircraft_type: trip.quick?.aircraft_type || selected?.type_name || null,
    hard_quote: trip.hard_quote ?? null,
    pax_count: Math.max(quickPax, deskPaxCount, paxNames.length),
    pax_names: paxNames,
    cargo_lines: cargoLines,
    payload_kind: payloadKind,
    pickup_street: pickupStreet,
    dropoff_street: dropoffStreet,
  }
}
