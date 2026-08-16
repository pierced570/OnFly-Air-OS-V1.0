/**
 * Trip + ETA sheet context → branded client email template.
 */

import type { ChainLeg } from '@/domain/etaChain'
import {
  patternLabelForService,
  fullLaneLabel,
  type EtaSheetEmailMilestone,
  type EtaSheetEmailStop,
  type EtaSheetEmailTemplate,
} from '@/domain/etaSheetEmail'
import {
  DEFAULT_QUICK_TURN_MIN,
  buildDeskOfferQuoteTimeline,
} from '@/domain/offerQuoteTiming'
import { formatClientLocal } from '@/domain/timeFmt'
import { invoiceEmailLogoUrl } from '@/lib/invoiceEmailLogo'
import type { EtaSheetContext } from '@/lib/etaSheet'
import type { TripStoreRow } from '@/lib/tripStore'
import { DateTime } from 'luxon'

function shortIcao(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!c) return '—'
  return c.length === 4 && c.startsWith('K') ? c.slice(1) : c
}

function aircraftBlurb(type: string): string {
  const t = type.toLowerCase()
  if (/cessna\s*310|310/.test(t)) return 'Twin piston · cargo configuration'
  if (/caravan|208/.test(t)) return 'Turboprop · cargo configuration'
  if (/king\s*air|350|200/.test(t)) return 'Twin turboprop · cargo configuration'
  if (/citation|lear|hawker|bravo|encore/.test(t)) {
    return 'Light jet · cargo configuration'
  }
  return 'Cargo configuration'
}

function preparedLabel(tz: string): string {
  const zone = tz || 'America/New_York'
  const local = DateTime.utc().setZone(zone)
  return `Prepared ${local.toFormat('ccc LLL d · HH:mm ZZZZ')}`
}

function stopFromTrip(
  trip: TripStoreRow,
  kind: 'pickup' | 'dropoff',
  icao: string,
): EtaSheetEmailStop {
  const street =
    kind === 'pickup'
      ? trip.portal_pickup_address?.trim()
      : trip.portal_dropoff_address?.trim()
  const short = shortIcao(icao)
  if (kind === 'pickup') {
    return {
      kind: 'pickup',
      placeBadge: street ? 'ADDRESS' : 'AIRPORT',
      title: street || `${short} departure`,
      addressLines: street
        ? [street]
        : [`Depart via ${short}`, 'Hangar-side / FBO load as coordinated'],
      footer: `Departs via ${short}`,
    }
  }
  return {
    kind: 'dropoff',
    placeBadge: street ? 'ADDRESS' : 'FBO',
    title: street || `${short} arrival`,
    addressLines: street
      ? [street]
      : [`Arrive at ${short}`, 'Your team meets aircraft at FBO ramp'],
    footer: `Arrives at ${short}`,
  }
}

function milestoneFromLeg(leg: ChainLeg): EtaSheetEmailMilestone | null {
  const from = shortIcao(leg.from.icao || leg.from.label)
  const to = shortIcao(leg.to.icao || leg.to.label)
  const tz = leg.to.tz || leg.from.tz || 'UTC'
  const projectedIso =
    leg.type === 'air_leg' || leg.type === 'position'
      ? leg.type === 'air_leg'
        ? leg.est_start
        : leg.est_end
      : leg.est_end
  const actualIso =
    leg.type === 'air_leg'
      ? leg.actual_start
      : leg.actual_end ?? leg.actual_start

  // For air legs we emit two milestones (wheels up + landing) elsewhere.
  if (leg.type === 'air_leg') return null

  let label = leg.event || leg.label || 'Milestone'
  let detail: string | null = null
  if (leg.type === 'truck_pickup') {
    label = 'Ground pickup'
    detail = 'Courier at dock, cargo loaded'
  } else if (leg.type === 'position' || leg.duration_key === 'acft_ttp') {
    label = `Arrive ${to}`
    detail = 'In position for live leg'
  } else if (leg.type === 'ground_stop' || leg.duration_key === 'acft_turn') {
    label = `Ready wheels · ${from}`
    detail = 'Turn / load complete'
  } else if (leg.type === 'truck_delivery' || leg.type === 'offload') {
    label = 'Cargo handoff'
    detail = 'Released to your team'
  }

  const proj = projectedIso ? formatClientLocal(projectedIso, tz) : null
  const act = actualIso ? formatClientLocal(actualIso, tz) : null
  return {
    label,
    detail,
    projected: proj?.display ?? null,
    actual: act?.display ?? null,
  }
}

function airMilestones(leg: ChainLeg): EtaSheetEmailMilestone[] {
  const from = shortIcao(leg.from.icao || leg.from.label)
  const to = shortIcao(leg.to.icao || leg.to.label)
  const tzFrom = leg.from.tz || leg.to.tz || 'UTC'
  const tzTo = leg.to.tz || leg.from.tz || 'UTC'
  const upEst = leg.est_start
    ? formatClientLocal(leg.est_start, tzFrom)
    : null
  const upAct = leg.actual_start
    ? formatClientLocal(leg.actual_start, tzFrom)
    : null
  const downEst = leg.est_end ? formatClientLocal(leg.est_end, tzTo) : null
  const downAct = leg.actual_end
    ? formatClientLocal(leg.actual_end, tzTo)
    : null
  return [
    {
      label: `Wheels up · ${from}`,
      detail: `Departs ${from}`,
      projected: upEst?.display ?? null,
      actual: upAct?.display ?? null,
    },
    {
      label: `Landing · ${to}`,
      detail: `Taxi / FBO ramp at ${to}`,
      projected: downEst?.display ?? null,
      actual: downAct?.display ?? null,
    },
  ]
}

function milestonesFromTrip(
  trip: TripStoreRow,
  sheet: EtaSheetContext,
): EtaSheetEmailMilestone[] {
  const chain = trip.eta_chain ?? []
  if (chain.length) {
    const out: EtaSheetEmailMilestone[] = []
    /** After landing at an airport, skip the next “Arrive / position” there — already on the ground. */
    let lastLandedIcao: string | null = null
    for (const leg of chain) {
      if (leg.type === 'air_leg') {
        out.push(...airMilestones(leg))
        lastLandedIcao = shortIcao(leg.to.icao || leg.to.label)
        continue
      }
      if (leg.type === 'position' || leg.duration_key === 'acft_ttp') {
        const to = shortIcao(leg.to.icao || leg.to.label)
        if (
          lastLandedIcao &&
          to !== '—' &&
          to === lastLandedIcao
        ) {
          // Multi-leg: aircraft did not leave — no reposition arrive before the next wheels-up.
          continue
        }
      }
      const m = milestoneFromLeg(leg)
      if (m) out.push(m)
      if (leg.type === 'ground_stop' || leg.duration_key === 'acft_turn') {
        lastLandedIcao = shortIcao(leg.from.icao || leg.from.label)
      }
    }
    if (out.length) return out
  }

  // Fallback from sheet lines (Quick Dispatch / legs without rich chain types).
  if (sheet.lines.length) {
    return sheet.lines.map((l) => {
      const from = shortIcao(l.pickup_location)
      const to = shortIcao(l.where_going)
      const label =
        /wheel|air|live/i.test(l.leg_label) || /wheel|air|live/i.test(l.event)
          ? `Wheels up · ${from}`
          : l.leg_label || l.event || `${from} → ${to}`
      const projectedRaw = l.est_display || l.arrive_time_zulu || null
      let projected = projectedRaw
      if (projectedRaw && /^\d{4}-\d{2}-\d{2}T/.test(projectedRaw)) {
        const tz =
          trip.eta_chain[0]?.to.tz ||
          trip.eta_chain[0]?.from.tz ||
          'America/New_York'
        projected = formatClientLocal(projectedRaw, tz).display
      }
      return {
        label,
        detail:
          to !== '—' && !/wheel/i.test(label) ? `Toward ${to}` : null,
        projected,
        actual: l.actual_display,
      }
    })
  }

  // Last resort: selected offer TTP / live leg → desk quote milestones.
  const selected =
    trip.offers.find((o) => o.state === 'selected') ??
    trip.offers.find((o) => o.state === 'quoted')
  if (
    selected?.time_to_position_min != null &&
    selected.live_leg_min != null &&
    Number.isFinite(selected.time_to_position_min) &&
    Number.isFinite(selected.live_leg_min)
  ) {
    const timeline = buildDeskOfferQuoteTimeline({
      lane: trip.lane,
      timeToPositionMin: selected.time_to_position_min,
      quickTurnMin: selected.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
      liveLegMin: selected.live_leg_min,
      pickupLocation: trip.portal_pickup_address,
      dropoffLocation: trip.portal_dropoff_address,
    })
    return timeline.milestones.map((m) => ({
      label: m.label,
      detail: null,
      projected: m.clock,
      actual: null,
    }))
  }

  return []
}

export function buildEtaSheetEmailTemplate(opts: {
  trip: TripStoreRow
  sheet: EtaSheetContext
  portalUrl: string
}): EtaSheetEmailTemplate {
  const { trip, sheet, portalUrl } = opts
  const lane = trip.lane || ''
  const air =
    trip.eta_chain.find((l) => l.type === 'air_leg') ?? null
  const originIcao =
    air?.from.icao ||
    trip.quick?.legs[0]?.origin_icao ||
    trip.legs.find((l) => l.origin)?.origin ||
    lane.split(/→|->/)[0] ||
    'DEP'
  const destIcao =
    [...trip.eta_chain].reverse().find((l) => l.type === 'air_leg')?.to.icao ||
    trip.quick?.legs[trip.quick.legs.length - 1]?.dest_icao ||
    [...trip.legs].reverse().find((l) => l.dest)?.dest ||
    lane.split(/→|->/).pop() ||
    'ARR'
  const tz =
    air?.from.tz ||
    trip.eta_chain[0]?.from.tz ||
    'America/New_York'

  const fullLane =
    fullLaneLabel(lane) ||
    `${shortIcao(originIcao)} → ${shortIcao(destIcao)}`

  return {
    logoUrl: invoiceEmailLogoUrl(),
    poNumber: sheet.po || trip.po_number || `T-${trip.ref}`,
    laneShort: fullLane,
    preparedLabel: preparedLabel(tz),
    patternLabel: patternLabelForService(trip.service_pattern ?? sheet.pattern),
    aircraftType: sheet.aircraft_type || 'Aircraft TBD',
    aircraftBlurb: aircraftBlurb(sheet.aircraft_type || ''),
    tail: sheet.tail || 'TBD',
    pickup: stopFromTrip(trip, 'pickup', originIcao),
    dropoff: stopFromTrip(trip, 'dropoff', destIcao),
    milestones: milestonesFromTrip(trip, sheet),
    portalUrl,
    timezoneNote: 'Stop-local times · Zulu in parentheses',
  }
}
