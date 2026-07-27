/**
 * ETA sheet views — ALWAYS derived from trip.eta_chain (single engine).
 * No second TTP+live math system.
 */

import type { ChainLeg, ServicePattern } from '@/domain/etaChain'
import {
  deliveryDeltaMin,
  mileageBlock,
  projectedDeliveryUtc,
  type MileageBlock,
} from '@/domain/etaChain'
import { formatClientLocal, formatZuluLocal } from '@/domain/timeFmt'
import type { QuickDispatchMeta, TripStoreRow } from '@/lib/tripStore'

export type EtaSheetLine = {
  seq: number
  leg_label: string
  event: string
  pickup_location: string
  where_going: string
  pickup_time_zulu: string
  depart_time_zulu: string
  arrive_time_zulu: string
  /** Full Zulu + local for dispatcher / client. */
  est_display: string
  actual_display: string | null
  source: string
  slack_min: number | null
  duration_min: number
}

export type EtaSheetContext = {
  tail: string
  po: string
  /** Internal only — omit on client surfaces. */
  operator_name: string
  aircraft_type: string
  pattern: ServicePattern | null
  promised_delivery_display: string | null
  projected_delivery_display: string | null
  delta_min: number | null
  lines: EtaSheetLine[]
  mileage: MileageBlock | null
}

function placeLabel(leg: ChainLeg, which: 'from' | 'to'): string {
  const p = which === 'from' ? leg.from : leg.to
  return (p.icao || p.label || '—').toUpperCase()
}

function lineFromLeg(
  leg: ChainLeg,
  opts?: { clientFacing?: boolean; refUtc?: string },
): EtaSheetLine {
  const tz = leg.to.tz || leg.from.tz || 'UTC'
  const fmt = opts?.clientFacing
    ? formatClientLocal(leg.est_end, tz)
    : formatZuluLocal(leg.est_end, tz, { refUtcIso: opts?.refUtc ?? leg.est_start })
  const startFmt = opts?.clientFacing
    ? formatClientLocal(leg.est_start, leg.from.tz || tz)
    : formatZuluLocal(leg.est_start, leg.from.tz || tz, {
        refUtcIso: opts?.refUtc ?? leg.est_start,
      })
  let actual_display: string | null = null
  if (leg.actual_end || leg.actual_start) {
    const a = leg.actual_end ?? leg.actual_start!
    actual_display = opts?.clientFacing
      ? formatClientLocal(a, tz).display
      : formatZuluLocal(a, tz, { refUtcIso: opts?.refUtc ?? leg.est_start }).display
  }
  return {
    seq: leg.seq,
    leg_label: leg.label,
    event: leg.event || leg.label,
    pickup_location: placeLabel(leg, 'from'),
    where_going: placeLabel(leg, 'to'),
    pickup_time_zulu: startFmt.zulu.replace(' ', ''),
    depart_time_zulu: startFmt.zulu.replace(' ', ''),
    arrive_time_zulu: (opts?.clientFacing ? fmt.zulu : fmt.zulu).replace(/\s/g, ''),
    est_display: opts?.clientFacing ? fmt.display : fmt.display,
    actual_display,
    source: leg.source,
    slack_min: leg.slack_min ?? null,
    duration_min: leg.duration_min,
  }
}

/** Build sheet lines from the trip chain (SoT). */
export function linesFromTripChain(
  chain: ChainLeg[],
  opts?: { clientFacing?: boolean },
): EtaSheetLine[] {
  if (!chain.length) return []
  const ref = chain[0]!.est_start
  return chain.map((l) => lineFromLeg(l, { ...opts, refUtc: ref }))
}

/**
 * @deprecated QD no longer invents a parallel chain — prefer trip.eta_chain.
 * Kept for transitional QD rows that only have quick meta; builds a minimal A2A-ish view.
 */
export function computeEtaSheetLinesFromQuick(
  quick: QuickDispatchMeta,
  now = new Date(),
): EtaSheetLine[] {
  // Minimal fallback when QD trip has no eta_chain yet
  const lines: EtaSheetLine[] = []
  let cursor = now.toISOString()
  for (const [idx, leg] of quick.legs.entries()) {
    const repo = parseLooseDuration(leg.repo_time) ?? 0
    const live = parseLooseDuration(leg.live_leg_time) ?? 0
    const depart = addIsoMin(cursor, repo)
    const arrive = addIsoMin(depart, live)
    lines.push({
      seq: idx + 1,
      leg_label: `Leg ${idx + 1}`,
      event: 'Wheels Up → Wheels Down',
      pickup_location: leg.origin_icao || '—',
      where_going: leg.dest_icao || '—',
      pickup_time_zulu: zuluOnly(cursor),
      depart_time_zulu: zuluOnly(depart),
      arrive_time_zulu: zuluOnly(arrive),
      est_display: `${zuluOnly(arrive)} / (zone TBD)`,
      actual_display: null,
      source: 'assumed',
      slack_min: null,
      duration_min: live,
    })
    cursor = arrive
  }
  return lines
}

function parseLooseDuration(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/g
  let total = 0
  let matched = false
  for (;;) {
    const m = re.exec(s)
    if (!m) break
    matched = true
    const value = Number(m[1])
    const unit = m[2]!
    if (!Number.isFinite(value)) continue
    if (unit.startsWith('h')) total += value * 60
    else total += value
  }
  if (!matched || !Number.isFinite(total)) return null
  return Math.round(total)
}

function addIsoMin(iso: string, min: number): string {
  return new Date(Date.parse(iso) + min * 60_000).toISOString()
}

function zuluOnly(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}${mm}Z`
}

/** ETA sheet after hard-quote accept — trip.eta_chain is the only engine. */
export function computeEtaSheetFromBookedTrip(
  trip: TripStoreRow,
  _now = new Date(),
  opts?: { clientFacing?: boolean },
): EtaSheetContext | null {
  const chain = trip.eta_chain ?? []
  const selected =
    trip.offers.find((o) => o.state === 'selected') ??
    trip.offers.find((o) => o.state === 'quoted')

  const tail = trip.quick?.tail || selected?.tail || ''
  const operator_name = opts?.clientFacing
    ? ''
    : trip.quick?.operator_name || selected?.operator_name || ''
  const aircraft_type = trip.quick?.aircraft_type || selected?.type_name || ''
  const po = trip.po_number?.trim() || trip.quick?.po?.trim() || `T-${trip.ref}`

  if (!chain.length) {
    if (trip.quick) {
      return {
        tail,
        po,
        operator_name,
        aircraft_type,
        pattern: null,
        promised_delivery_display: null,
        projected_delivery_display: null,
        delta_min: null,
        lines: computeEtaSheetLinesFromQuick(trip.quick, _now),
        mileage: null,
      }
    }
    // Fall back to trip.legs when eta_chain not materialized yet.
    if (trip.legs.length) {
      const lines: EtaSheetLine[] = trip.legs.map((l, idx) => ({
        seq: l.seq ?? idx + 1,
        leg_label: l.label || `Leg ${idx + 1}`,
        event: l.label || '',
        pickup_location: (l.origin || '—').toUpperCase(),
        where_going: (l.dest || '—').toUpperCase(),
        pickup_time_zulu: l.est_start
          ? zuluOnly(l.est_start)
          : '—',
        depart_time_zulu: l.est_start ? zuluOnly(l.est_start) : '—',
        arrive_time_zulu: l.est_end ? zuluOnly(l.est_end) : '—',
        est_display: l.est_end || '—',
        actual_display: null,
        source: 'leg',
        slack_min: null,
        duration_min: 0,
      }))
      return {
        tail,
        po,
        operator_name,
        aircraft_type,
        pattern: trip.service_pattern ?? null,
        promised_delivery_display: null,
        projected_delivery_display: null,
        delta_min: null,
        lines,
        mileage: null,
      }
    }
    return {
      tail,
      po,
      operator_name,
      aircraft_type,
      pattern: trip.service_pattern ?? null,
      promised_delivery_display: null,
      projected_delivery_display: null,
      delta_min: null,
      lines: [],
      mileage: null,
    }
  }

  const promised = trip.promised_delivery ?? chain[chain.length - 1]?.est_end ?? null
  const projected = projectedDeliveryUtc(chain)
  const lastTz =
    chain[chain.length - 1]?.to.tz ||
    chain[chain.length - 1]?.from.tz ||
    'UTC'
  const fmtPromised = promised
    ? opts?.clientFacing
      ? formatClientLocal(promised, lastTz).display
      : formatZuluLocal(promised, lastTz).display
    : null
  const fmtProjected = projected
    ? opts?.clientFacing
      ? formatClientLocal(projected, lastTz).display
      : formatZuluLocal(projected, lastTz).display
    : null

  return {
    tail,
    po,
    operator_name,
    aircraft_type,
    pattern: trip.service_pattern ?? null,
    promised_delivery_display: fmtPromised,
    projected_delivery_display: fmtProjected,
    delta_min: deliveryDeltaMin(projected, promised),
    lines: linesFromTripChain(chain, { clientFacing: opts?.clientFacing }),
    mileage: mileageBlock(chain),
  }
}
