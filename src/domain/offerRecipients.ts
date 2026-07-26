/**
 * Operator trip-offer recipient status — UI labels (never "bid").
 * Pure TypeScript.
 */

import { DateTime } from 'luxon'

export type OfferRecipientStatus =
  | 'awaiting'
  | 'yes'
  | 'no'
  | 'quote_submitted'
  | 'selected'
  | 'stood_down'
  | 'expired'

export type OfferStateLike =
  | 'pinged'
  | 'available'
  | 'unavailable'
  | 'quoted'
  | 'selected'
  | 'stood_down'
  | 'expired'
  | string

/** Map offer row state → dispatcher-facing status. */
export function offerRecipientStatus(state: OfferStateLike): OfferRecipientStatus {
  switch (state) {
    case 'available':
      return 'yes'
    case 'unavailable':
      return 'no'
    case 'quoted':
      return 'quote_submitted'
    case 'selected':
      return 'selected'
    case 'stood_down':
      return 'stood_down'
    case 'expired':
      return 'expired'
    case 'pinged':
    default:
      return 'awaiting'
  }
}

export function offerRecipientStatusLabel(
  status: OfferRecipientStatus,
): string {
  switch (status) {
    case 'awaiting':
      return 'Sent — awaiting reply'
    case 'yes':
      return 'Accepted (Yes)'
    case 'no':
      return 'Declined (No)'
    case 'quote_submitted':
      return 'Quote submitted'
    case 'selected':
      return 'Selected'
    case 'stood_down':
      return 'Stood down'
    case 'expired':
      return 'Expired'
  }
}

/** Dispatcher: Sent @ Zulu + browser-local, plus relative age. */
export function formatOfferSentAt(
  utcIso: string | null | undefined,
  nowMs = Date.now(),
): { zulu: string; local: string; ago: string; display: string } | null {
  if (!utcIso) return null
  const utc = DateTime.fromISO(utcIso, { zone: 'utc' })
  if (!utc.isValid) return null
  const local = utc.setZone(DateTime.local().zoneName)
  const zulu = utc.toFormat("dd HHmm'Z'")
  const localStr = local.toFormat('dd MMM h:mm a ZZZZ')
  const ago = formatOfferAge(utcIso, nowMs)
  return {
    zulu,
    local: localStr,
    ago,
    display: `Sent @ ${zulu} · ${localStr}${ago ? ` · ${ago}` : ''}`,
  }
}

export function formatOfferAge(
  utcIso: string | null | undefined,
  nowMs = Date.now(),
): string {
  if (!utcIso) return ''
  const then = DateTime.fromISO(utcIso, { zone: 'utc' })
  if (!then.isValid) return ''
  const mins = Math.max(0, Math.floor(nowMs / 1000 / 60 - then.toSeconds() / 60))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function formatOfferQuoteSummary(o: {
  price_net?: number | null
  time_to_position_min?: number | null
  live_leg_min?: number | null
  fee_scope?: string | null
  tail?: string | null
}): string | null {
  if (o.price_net == null) return null
  const bits = [`NET $${Math.round(o.price_net)}`]
  if (o.time_to_position_min != null) bits.push(`TTP ${o.time_to_position_min}m`)
  if (o.live_leg_min != null) bits.push(`live ${o.live_leg_min}m`)
  if (o.fee_scope === 'aircraft_only') bits.push('aircraft only')
  else if (o.fee_scope === 'aircraft_and_fees') bits.push('fees included')
  if (o.tail && o.tail !== 'TBD') bits.push(o.tail)
  return bits.join(' · ')
}
