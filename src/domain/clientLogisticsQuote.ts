/**
 * Client-facing logistics quote copy — clear labels, no carrier names.
 */

import { DateTime } from 'luxon'
import { lookupAirport } from '@/domain/airports'
import { parseLaneAirports } from '@/domain/offerMissionDisplay'
import { formatMinutes } from '@/domain/offerQuotePreview'
import {
  DEFAULT_DEST_HANDOFF_MIN,
  DEFAULT_QUICK_TURN_MIN,
  buildDeskOfferQuoteTimeline,
  computeOfferQuoteTiming,
  type DeskQuoteMilestone,
  type ZuluLocal,
} from '@/domain/offerQuoteTiming'
import {
  STANDARD_TOOLING,
  isStandardToolingPieces,
} from '@/domain/standardTooling'

export const CLIENT_QUOTE_TAXES_NOTE = 'All taxes and fees included'
export const CLIENT_QUOTE_ALL_IN_NOTE = 'All-in · taxes & fees included'

export const DISPATCH_CHANGE_REQUEST_EMAIL = 'info@onflyair.com'

export type LogisticsClock = {
  /** Duration label e.g. 1h 30m */
  duration: string
  /** Clock chip e.g. 01:07Z · 21:07 EDT */
  clock: string | null
}

export type LogisticsQuoteOptionView = {
  offer_id: string
  label: string
  /** Display index label e.g. Option 1 */
  option_number_label: string
  aircraft_type: string
  /** Short supporting line under the aircraft type. */
  aircraft_blurb: string
  departure_label: string
  destination_label: string
  ttp_min: number | null
  turn_load_min: number | null
  live_leg_min: number | null
  /** Position ETA at departure after TTP from Go. */
  position_eta: LogisticsClock
  /** ETD after loading / turn around. */
  etd: LogisticsClock
  /** Arrival ETA after live leg. */
  arrival_eta: LogisticsClock
  /** AT PICKUP → DELIVERED chips (stop-local 12h). */
  milestones: DeskQuoteMilestone[]
  /** Delivered clock for badge / summary. */
  delivered_clock: string | null
  delivered_summary: string | null
  flight_time_label: string
  door_to_door_label: string
  /**
   * Desk-only rank flags among the option set.
   * Never render these on client email / accept surfaces.
   */
  fastest: boolean
  cheapest: boolean
  /** Sort key — earlier delivery wins. */
  delivered_at_ms: number | null
  price: number
  taxes_fees_note: string
  all_in_note: string
}

export type CharterQuoteMissionChip = {
  label: string
}

/** Compact stop for charter headline: "Akron CAK". */
export function formatCharterStopLabel(icao: string): string {
  const code = icao.trim().toUpperCase()
  if (!code) return 'Departure'
  const info = lookupAirport(code)
  if (!info) return code
  const shortCode = info.iata || code.replace(/^K/, '')
  const city = (info.city || info.name || '').trim()
  return city ? `${city} ${shortCode}` : shortCode
}

export function airportDisplayLabel(icao: string): string {
  return formatCharterStopLabel(icao)
}

export function laneEndpoints(lane: string): {
  originIcao: string
  destIcao: string
  originLabel: string
  destLabel: string
} {
  const parsed = parseLaneAirports(lane)
  const originIcao = parsed?.origin ?? ''
  const destIcao = parsed?.dest ?? ''
  return {
    originIcao,
    destIcao,
    originLabel: originIcao ? formatCharterStopLabel(originIcao) : 'Departure',
    destLabel: destIcao ? formatCharterStopLabel(destIcao) : 'Destination',
  }
}

export function logisticsQuoteTitle(lane: string): string {
  const { originLabel, destLabel } = laneEndpoints(lane)
  return `${originLabel} → ${destLabel}`
}

export function formatClientClock(times: ZuluLocal): string {
  return `${times.zulu} · ${times.local} ${times.tzLabel}`
}

function optionNumberLabel(index: number): string {
  return `Option ${index + 1}`
}

/** Neutral client blurb — no cheapest/fastest push on the quote. */
function aircraftBlurb(only: boolean): string {
  if (only) return 'Ready to launch on your schedule'
  return 'Aircraft option'
}

/** Parse trip payload_summary into compact mission chips (best-effort). */
export function buildCharterMissionChips(input: {
  payload_kind?: 'cargo' | 'pax' | 'both' | null
  payload_summary?: string | null
  ready_label?: string | null
}): CharterQuoteMissionChip[] {
  const chips: CharterQuoteMissionChip[] = []
  const kind = input.payload_kind ?? 'cargo'
  if (kind === 'cargo') chips.push({ label: 'Cargo only' })
  else if (kind === 'pax') chips.push({ label: 'Passenger' })
  else chips.push({ label: 'Cargo + passenger' })

  const summary = (input.payload_summary ?? '').trim()
  if (summary) {
    // Hard quote / accept: never expose standard-tooling dims to the client
    // (operators still see dims on trip offers).
    if (isStandardToolingPieces(summary)) {
      chips.push({ label: STANDARD_TOOLING.client_label })
    } else {
      const pc = summary.match(/(\d+)\s*(?:pc|pcs|pieces?|skids?|pallets?)\b/i)
      if (pc) chips.push({ label: `${pc[1]} pc` })
      const dims = summary.match(
        /(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\s*(?:in|inch|inches)?/i,
      )
      if (dims) {
        chips.push({ label: `${dims[1]}x${dims[2]}x${dims[3]} in` })
      }
      const lbs = summary.match(/(\d[\d,]*)\s*(?:lb|lbs|pounds?)\b/i)
      if (lbs) chips.push({ label: `${lbs[1]} lb` })
      // Fallback chip when nothing structured matched.
      if (
        !pc &&
        !dims &&
        !lbs &&
        summary.length <= 40 &&
        !/^cargo/i.test(summary)
      ) {
        chips.push({ label: summary })
      }
    }
  }

  const ready = (input.ready_label ?? '').trim()
  if (ready) {
    chips.push({
      label: /^asap$/i.test(ready) ? 'Ready ASAP' : `Ready ${ready}`,
    })
  }
  return chips
}

export function buildLogisticsQuoteOption(input: {
  offer_id: string
  label: string
  /** 0-based index among options presented to the client. */
  option_index?: number
  type_name?: string | null
  time_to_position_min?: number | null
  quick_turn_min?: number | null
  live_leg_min?: number | null
  client_total: number
  lane: string
  /** When the "from Go" clock starts (hard quote sent_at, else now). */
  goAtIso?: string | null
}): LogisticsQuoteOptionView {
  const { originLabel, destLabel } = laneEndpoints(input.lane)
  const ttp = input.time_to_position_min
  const turn =
    input.quick_turn_min != null && Number.isFinite(input.quick_turn_min)
      ? input.quick_turn_min
      : DEFAULT_QUICK_TURN_MIN
  const live = input.live_leg_min
  const goAt = input.goAtIso
    ? DateTime.fromISO(input.goAtIso, { zone: 'utc' })
    : DateTime.utc()
  const timing =
    ttp != null && live != null && goAt.isValid
      ? computeOfferQuoteTiming({
          lane: input.lane,
          nowUtc: goAt,
          timeToPositionMin: ttp,
          quickTurnMin: turn,
          liveLegMin: live,
        })
      : null
  const timeline =
    ttp != null && live != null && goAt.isValid
      ? buildDeskOfferQuoteTimeline({
          lane: input.lane,
          nowUtc: goAt,
          timeToPositionMin: ttp,
          quickTurnMin: turn,
          liveLegMin: live,
          destHandoffMin: DEFAULT_DEST_HANDOFF_MIN,
        })
      : null

  const doorMin =
    ttp != null && live != null
      ? ttp + turn + live + DEFAULT_DEST_HANDOFF_MIN
      : null
  const delivered = timeline?.milestones.find((m) => m.key === 'delivered')
  const destTzLabel = timing
    ? timing.destEta.tzLabel
    : null
  const deliveredSummary =
    delivered && destLabel
      ? `Delivered to your team at ${destLabel} by ${delivered.clock}${
          destTzLabel ? ` ${destTzLabel}` : ''
        }.`
      : null

  const idx = Math.max(0, input.option_index ?? 0)
  return {
    offer_id: input.offer_id,
    label: input.label,
    option_number_label: optionNumberLabel(idx),
    aircraft_type: (input.type_name ?? '').trim() || 'Aircraft',
    aircraft_blurb: aircraftBlurb(true),
    departure_label: originLabel,
    destination_label: destLabel,
    ttp_min: ttp ?? null,
    turn_load_min: turn,
    live_leg_min: live ?? null,
    position_eta: {
      duration: formatMinutes(ttp ?? null),
      clock: timing ? formatClientClock(timing.positionAtOrigin) : null,
    },
    etd: {
      duration: formatMinutes(turn),
      clock: timing ? formatClientClock(timing.etd) : null,
    },
    arrival_eta: {
      duration: formatMinutes(live ?? null),
      clock: timing ? formatClientClock(timing.destEta) : null,
    },
    milestones: timeline?.milestones ?? [],
    delivered_clock: delivered?.clock ?? null,
    delivered_summary: deliveredSummary,
    flight_time_label: `Flight time ${formatMinutes(live ?? null)}`,
    door_to_door_label: `Est. total door-to-door ${formatMinutes(doorMin)}`,
    fastest: false,
    cheapest: false,
    delivered_at_ms: timing
      ? timing.destEtaUtc
          .plus({ minutes: DEFAULT_DEST_HANDOFF_MIN })
          .toMillis()
      : null,
    price: Math.round(input.client_total),
    taxes_fees_note: CLIENT_QUOTE_TAXES_NOTE,
    all_in_note: CLIENT_QUOTE_ALL_IN_NOTE,
  }
}

/**
 * Rank options for desk (fastest / cheapest). Client surfaces must not show
 * these flags — no "Recommended" badge on email or accept.
 */
export function finalizeLogisticsQuoteOptions(
  options: LogisticsQuoteOptionView[],
): LogisticsQuoteOptionView[] {
  if (!options.length) return options
  const withTimes = options.filter((o) => o.delivered_at_ms != null)
  const earliestMs =
    withTimes.length > 0
      ? Math.min(...withTimes.map((o) => o.delivered_at_ms!))
      : null
  const lowestPrice = Math.min(...options.map((o) => o.price))
  const only = options.length === 1
  // Single option: nothing to compare — leave flags off.
  const rank = options.length > 1

  return options.map((o, i) => {
    const fastest =
      rank && earliestMs != null && o.delivered_at_ms === earliestMs
    const cheapest = rank && o.price === lowestPrice
    return {
      ...o,
      option_number_label: optionNumberLabel(i),
      fastest,
      cheapest,
      aircraft_blurb: aircraftBlurb(only),
    }
  })
}

/** Desk-only labels for an option (never send to client UI). */
export function deskRankLabels(opt: Pick<LogisticsQuoteOptionView, 'fastest' | 'cheapest'>): string[] {
  const labels: string[] = []
  if (opt.fastest) labels.push('Fastest')
  if (opt.cheapest) labels.push('Cheapest')
  return labels
}

export function formatTtpFromGo(
  ttpMin: number | null,
  departureLabel: string,
): string {
  return `Time to be in ${departureLabel} from Go: ${formatMinutes(ttpMin)}`
}

export function formatTurnLoad(turnMin: number | null): string {
  return `Estimated loading and turn around time: ${formatMinutes(turnMin)}`
}

export function formatLiveLeg(
  liveMin: number | null,
  departureLabel: string,
  destinationLabel: string,
): string {
  return `Live leg time (${departureLabel} to ${destinationLabel}): ${formatMinutes(liveMin)}`
}

/** mailto: for Add details / Change request back to OnFly desk. */
export function buildChangeRequestMailto(input: {
  lane: string
  optionLabel?: string
  acceptToken?: string
  replyTo?: string
}): string {
  const to = (input.replyTo ?? DISPATCH_CHANGE_REQUEST_EMAIL).trim()
  const subject = `Change request · ${input.lane}${
    input.optionLabel ? ` · ${input.optionLabel}` : ''
  }`
  const body = [
    'Hi OnFly —',
    '',
    `I need to add details or request a change on this logistics quote:`,
    `Route: ${input.lane}`,
    input.optionLabel ? `Option: ${input.optionLabel}` : '',
    input.acceptToken ? `Quote ref: ${input.acceptToken}` : '',
    '',
    'Requested changes:',
    '',
  ]
    .filter(Boolean)
    .join('\n')
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
