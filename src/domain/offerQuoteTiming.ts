/**
 * Operator quote timing chain (pure):
 * now → +TTP = position ETA at origin → +quick turn = ETD → +live = dest ETA.
 * Turn autofill matches trip spine `BUILTIN_ETA_DEFAULTS.acft_turn` (40).
 */

import { DateTime } from 'luxon'
import { lookupAirport } from '@/domain/airports'
import { DEFAULT_ACFT_TURN_MIN } from '@/domain/etaChain'

/** Same as spine acft_turn — one autofill for QD, waterfall quotes, and ETA chain. */
export const DEFAULT_QUICK_TURN_MIN = DEFAULT_ACFT_TURN_MIN

/** Grey reference placeholders on the operator quote form (not prefilled). */
export const REFERENCE_TTP_MIN = 90
export const REFERENCE_LIVE_LEG_MIN = 75

export type HrsMins = { hours: number; minutes: number }

export function totalMinutesFromHrsMins(h: HrsMins): number {
  const hours = Math.max(0, Math.floor(h.hours) || 0)
  const minutes = Math.max(0, Math.floor(h.minutes) || 0)
  return hours * 60 + minutes
}

export function hrsMinsFromTotal(totalMin: number): HrsMins {
  const t = Math.max(0, Math.floor(totalMin) || 0)
  return { hours: Math.floor(t / 60), minutes: t % 60 }
}

/**
 * Controlled input display for hrs/mins boxes — blank when that part is 0
 * so operators can backspace zeros (never stuck on a forced "0").
 */
export function hrsMinsFieldDisplay(
  totalMinutes: number | null | undefined,
  part: 'hours' | 'minutes',
): string {
  if (totalMinutes == null) return ''
  const { hours, minutes } = hrsMinsFromTotal(totalMinutes)
  const n = part === 'hours' ? hours : minutes
  return n === 0 ? '' : String(n)
}

/** First origin→dest pair from a desk lane string. */
export function parseLaneAirports(lane: string): {
  originIcao: string
  destIcao: string
} {
  const first = (lane.split('·')[0] ?? '').trim()
  const m = first.match(/\b([A-Za-z]{3,4})\b\s*→\s*\b([A-Za-z]{3,4})\b/)
  return {
    originIcao: (m?.[1] ?? '').toUpperCase(),
    destIcao: (m?.[2] ?? '').toUpperCase(),
  }
}

export function airportTz(icao: string): string | null {
  if (!icao) return null
  return lookupAirport(icao)?.tz ?? null
}

export type ZuluLocal = {
  zulu: string
  local: string
  tzLabel: string
}

export function formatZuluLocal(
  utc: DateTime,
  tz: string | null,
): ZuluLocal {
  const z = utc.toUTC()
  const zulu = z.toFormat("HH:mm 'Z'")
  if (!tz) {
    return { zulu, local: zulu, tzLabel: 'UTC' }
  }
  const localDt = z.setZone(tz)
  return {
    zulu,
    local: localDt.toFormat('HH:mm'),
    tzLabel: localDt.toFormat('ZZZZ'),
  }
}

export type OfferQuoteTiming = {
  positionEtaUtc: DateTime
  etdUtc: DateTime
  destEtaUtc: DateTime
  originTz: string | null
  destTz: string | null
  originIcao: string
  destIcao: string
  positionAtOrigin: ZuluLocal
  etd: ZuluLocal
  destEta: ZuluLocal
}

export function computeOfferQuoteTiming(opts: {
  lane: string
  /** UTC instant when the operator starts the clock (usually now). */
  nowUtc?: DateTime
  timeToPositionMin: number
  quickTurnMin: number
  liveLegMin: number
}): OfferQuoteTiming {
  const now = (opts.nowUtc ?? DateTime.utc()).toUTC()
  const { originIcao, destIcao } = parseLaneAirports(opts.lane)
  const originTz = airportTz(originIcao)
  const destTz = airportTz(destIcao)
  const positionEtaUtc = now.plus({
    minutes: Math.max(0, opts.timeToPositionMin),
  })
  const etdUtc = positionEtaUtc.plus({
    minutes: Math.max(0, opts.quickTurnMin),
  })
  const destEtaUtc = etdUtc.plus({ minutes: Math.max(0, opts.liveLegMin) })
  return {
    positionEtaUtc,
    etdUtc,
    destEtaUtc,
    originTz,
    destTz,
    originIcao,
    destIcao,
    positionAtOrigin: formatZuluLocal(positionEtaUtc, originTz),
    etd: formatZuluLocal(etdUtc, originTz),
    destEta: formatZuluLocal(destEtaUtc, destTz),
  }
}

/**
 * Default dest FBO / drop-off handoff after landing (DELIVERED chip).
 * Landing + 5 min unless overridden.
 */
export const DEFAULT_DEST_HANDOFF_MIN = 5

export type DeskQuoteMilestoneKey =
  | 'at_pickup'
  | 'wheels_up'
  | 'landing'
  | 'delivered'

export type DeskQuoteMilestone = {
  key: DeskQuoteMilestoneKey
  label: string
  /** Stop-local 12h clock, e.g. 12:40 PM */
  clock: string
}

export type DeskOfferQuoteTimeline = {
  milestones: DeskQuoteMilestone[]
  /** Compact badge e.g. DELIVERS ~12:40 PM */
  deliversBadge: string
  /** Chain hint under the milestone row. */
  chainHint: string
}

/** Prefer IATA / K-stripped ICAO for subject chips (CAK, HPN). */
export function shortAirportSubject(icao: string): string {
  const code = icao.trim().toUpperCase()
  if (!code) return ''
  const info = lookupAirport(code)
  if (info?.iata) return info.iata
  return code.length === 4 && code.startsWith('K') ? code.slice(1) : code
}

function formatDeskClockAmPm(utc: DateTime, tz: string | null): string {
  const dt = tz ? utc.setZone(tz) : utc.toUTC()
  return dt.toFormat('h:mm a')
}

function formatReadyNowLabel(nowUtc: DateTime, tz: string | null): string {
  const dt = tz ? nowUtc.setZone(tz) : nowUtc.toUTC()
  const clock = dt.toFormat('HH:mm')
  const zone = tz ? dt.toFormat('ZZZZ') : 'UTC'
  return `${clock} ${zone}`
}

function formatChainMinutes(min: number): string {
  const t = Math.max(0, Math.floor(min) || 0)
  const h = Math.floor(t / 60)
  const m = t % 60
  return `${h}h ${m}m`
}

function parenSubject(value: string, fallback: string): string {
  const v = value.trim()
  return v || fallback
}

/** Desk / client quote chips: AT PICKUP → WHEELS UP → LANDING → DELIVERED. */
export function buildDeskOfferQuoteTimeline(opts: {
  lane: string
  nowUtc?: DateTime
  timeToPositionMin: number
  quickTurnMin: number
  liveLegMin: number
  destHandoffMin?: number
  /** Pickup airport or address, e.g. CAK or "Hangar 5". */
  pickupLocation?: string | null
  /** Destination airport / city for wheels-up + landing subjects. */
  destination?: string | null
  /** FBO name or drop-off address for the delivered subject. */
  dropoffLocation?: string | null
}): DeskOfferQuoteTimeline {
  const now = (opts.nowUtc ?? DateTime.utc()).toUTC()
  const handoff = Math.max(
    0,
    opts.destHandoffMin ?? DEFAULT_DEST_HANDOFF_MIN,
  )
  const timing = computeOfferQuoteTiming({
    lane: opts.lane,
    nowUtc: now,
    timeToPositionMin: opts.timeToPositionMin,
    quickTurnMin: opts.quickTurnMin,
    liveLegMin: opts.liveLegMin,
  })
  const originShort = shortAirportSubject(timing.originIcao)
  const destShort = shortAirportSubject(timing.destIcao)
  const pickup = parenSubject(
    opts.pickupLocation ?? '',
    originShort || 'Pickup',
  )
  const destination = parenSubject(
    opts.destination ?? '',
    destShort || 'Destination',
  )
  const dropoff = parenSubject(
    opts.dropoffLocation ?? '',
    destShort ? `${destShort} FBO` : 'Drop-off',
  )
  const deliveredUtc = timing.destEtaUtc.plus({ minutes: handoff })
  const milestones: DeskQuoteMilestone[] = [
    {
      key: 'at_pickup',
      label: `At Pickup Location (${pickup})`,
      clock: formatDeskClockAmPm(timing.positionEtaUtc, timing.originTz),
    },
    {
      key: 'wheels_up',
      label: `Wheels Up For (${destination})`,
      clock: formatDeskClockAmPm(timing.etdUtc, timing.originTz),
    },
    {
      key: 'landing',
      label: `Landing ETA (${destination})`,
      clock: formatDeskClockAmPm(timing.destEtaUtc, timing.destTz),
    },
    {
      key: 'delivered',
      label: `Delivered (${dropoff})`,
      clock: formatDeskClockAmPm(deliveredUtc, timing.destTz),
    },
  ]
  const deliversClock = formatDeskClockAmPm(deliveredUtc, timing.destTz)
  return {
    milestones,
    deliversBadge: `Delivers ~${deliversClock}`,
    chainHint: `From ready-now ${formatReadyNowLabel(now, timing.originTz)}: +TTP ${formatChainMinutes(opts.timeToPositionMin)} → +turn ${formatChainMinutes(opts.quickTurnMin)} → +live ${formatChainMinutes(opts.liveLegMin)} → +handoff ${formatChainMinutes(handoff)}`,
  }
}
