/**
 * Client-facing logistics quote copy — clear labels, no carrier names.
 */

import { DateTime } from 'luxon'
import { formatAirportShort, lookupAirport } from '@/domain/airports'
import { parseLaneAirports } from '@/domain/offerMissionDisplay'
import { formatMinutes } from '@/domain/offerQuotePreview'
import {
  DEFAULT_QUICK_TURN_MIN,
  computeOfferQuoteTiming,
  type ZuluLocal,
} from '@/domain/offerQuoteTiming'

export const CLIENT_QUOTE_TAXES_NOTE = 'All taxes and fees included'

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
  aircraft_type: string
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
  price: number
  taxes_fees_note: string
}

export function airportDisplayLabel(icao: string): string {
  const code = icao.trim().toUpperCase()
  if (!code) return 'Departure'
  const info = lookupAirport(code)
  return info ? formatAirportShort(info) : code
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
    originLabel: originIcao ? airportDisplayLabel(originIcao) : 'Departure',
    destLabel: destIcao ? airportDisplayLabel(destIcao) : 'Destination',
  }
}

export function logisticsQuoteTitle(lane: string): string {
  const { originLabel, destLabel } = laneEndpoints(lane)
  return `Logistics Quote Request (${originLabel} → ${destLabel})`
}

export function formatClientClock(times: ZuluLocal): string {
  return `${times.zulu} · ${times.local} ${times.tzLabel}`
}

export function buildLogisticsQuoteOption(input: {
  offer_id: string
  label: string
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

  return {
    offer_id: input.offer_id,
    label: input.label,
    aircraft_type: (input.type_name ?? '').trim() || 'Aircraft',
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
    price: Math.round(input.client_total),
    taxes_fees_note: CLIENT_QUOTE_TAXES_NOTE,
  }
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
