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
import { formatClientLocal } from '@/domain/timeFmt'

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
  progressPct: number | null
  nmRemaining: number | null
}

export type PortalTrackingView = {
  ref: number
  lane: string
  state: string
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
  nextMilestoneLabel: string
  milestones: TrackingMilestone[]
  etaRows: TrackingEtaRow[]
  aircraft: TrackingAircraftPosition
  timeline: Array<{ at: string; label: string; detail: string }>
  documents: Array<{ id: string; kind: string; title: string; at: string; url: string }>
}

export type PortalTrackingTripInput = {
  ref: number
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
  hard_quote?: { disclosure_at?: string } | null
}

function eventAt(
  events: PortalTrackingTripInput['events'],
  kinds: string[],
): string | null {
  const hit = events.find((e) => kinds.includes(e.kind))
  return hit?.at ?? null
}

function stateEnteredAt(
  events: PortalTrackingTripInput['events'],
  state: string,
): string | null {
  const hit = [...events]
    .reverse()
    .find(
      (e) =>
        (e.kind === 'state_change' || e.kind === 'transition') &&
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
    eventAt(events, ['estimated_quote_sent']) ??
    stateEnteredAt(events, 'quoted_hard') ??
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
      const est = l.est_end
        ? formatClientLocal(l.est_end, tz).display
        : '—'
      const act = l.actual_end
        ? formatClientLocal(l.actual_end, tz).display
        : l.actual_start
          ? formatClientLocal(l.actual_start, tz).display
          : null
      return {
        seq: l.seq,
        event: l.label,
        fromLabel: (l.origin || '—').toUpperCase(),
        toLabel: (l.dest || '—').toUpperCase(),
        estDisplay: est,
        actualDisplay: act,
        status:
          l.status === 'done' ? 'done' : l.status === 'active' ? 'active' : 'pending',
        tz,
      }
    })
  }
  return chain.map((leg) => {
    const tz = leg.to.tz || leg.from.tz || 'UTC'
    return {
      seq: leg.seq,
      event: leg.event || leg.label,
      fromLabel: (leg.from.icao || leg.from.label || '—').toUpperCase(),
      toLabel: (leg.to.icao || leg.to.label || '—').toUpperCase(),
      estDisplay: formatClientLocal(leg.est_end, tz).display,
      actualDisplay:
        leg.actual_end || leg.actual_start
          ? formatClientLocal(
              (leg.actual_end ?? leg.actual_start)!,
              tz,
            ).display
          : null,
      status: legStatus(leg, trip.legs),
      tz,
    }
  })
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
    if (kind === 'state_change' || kind === 'transition') return 'Status change'
    if (kind.startsWith('leg_')) return 'Leg update'
    return null
  }

  for (const e of [...trip.events].sort((a, b) => a.at.localeCompare(b.at))) {
    if (MONEY_RE.test(e.kind + JSON.stringify(e.payload ?? {}))) continue
    const label = labelFor(e.kind)
    if (!label) continue
    let detail = ''
    if (e.kind === 'state_change' || e.kind === 'transition') {
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

  return {
    ref: trip.ref,
    lane: trip.lane,
    state: trip.state,
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
    nextMilestoneLabel: nextLabel,
    milestones,
    etaRows,
    aircraft,
    timeline: clientTimeline(trip),
    documents: clientDocs.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      at: d.at,
      url: d.url,
    })),
  }
}

/** Map trip store row → tracking input (strips money fields by omission). */
export function tripToTrackingInput(trip: {
  ref: number
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
  quick?: { tail?: string; aircraft_type?: string } | null
  offers?: Array<{ state: string; tail: string; type_name: string | null }>
  hard_quote?: { disclosure_at?: string } | null
}): PortalTrackingTripInput {
  const selected =
    trip.offers?.find((o) => o.state === 'selected') ??
    trip.offers?.find((o) => o.state === 'quoted')
  return {
    ref: trip.ref,
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
  }
}
