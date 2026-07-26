/**
 * Operator trip-offer recipient status — UI labels (never "bid").
 * Pure TypeScript.
 */

import { DateTime } from 'luxon'
import {
  channelIncludesEmail,
  channelIncludesSms,
  normalizeQuoteLinkChannel,
  quoteLinkChannelLabel,
  type QuoteLinkChannel,
} from '@/domain/quoteLinkChannel'

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

export type OfferDestinationLike = {
  operator_name?: string
  contact_email?: string | null
  contact_cell?: string | null
  quote_link_channel?: QuoteLinkChannel | string | null
  /** True when SMS number was invented for mocks — not a real on-file contact. */
  contact_cell_is_mock?: boolean
  notified_at?: string | null
}

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
  opts?: { notified?: boolean },
): string {
  switch (status) {
    case 'awaiting':
      return opts?.notified
        ? 'Notified — awaiting reply'
        : 'Link ready — not notified'
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

export type OfferDestinationInfo = {
  channel: QuoteLinkChannel
  channel_label: string
  email: string | null
  sms: string | null
  sms_is_mock: boolean
  /** Destinations that would actually receive a notify. */
  will_reach: string[]
  /** Missing / unsafe destinations for the chosen channel. */
  gaps: string[]
  can_notify: boolean
  /** One-line for cards. */
  summary: string
}

/** Where this offer link would go if notified (email / SMS / both). */
export function describeOfferDestination(
  o: OfferDestinationLike,
): OfferDestinationInfo {
  const channel = normalizeQuoteLinkChannel(o.quote_link_channel)
  const email = (o.contact_email ?? '').trim()
  const smsRaw = (o.contact_cell ?? '').trim()
  const sms_is_mock = Boolean(o.contact_cell_is_mock)
  const emailOk = email.includes('@')
  const smsOk = Boolean(smsRaw) && !sms_is_mock
  const will_reach: string[] = []
  const gaps: string[] = []

  if (channelIncludesEmail(channel)) {
    if (emailOk) will_reach.push(`Email ${email}`)
    else gaps.push('No email on file')
  }
  if (channelIncludesSms(channel)) {
    if (smsOk) will_reach.push(`SMS ${smsRaw}`)
    else if (sms_is_mock && smsRaw) {
      gaps.push(`SMS is mock (${smsRaw}) — not a real contact`)
    } else gaps.push('No SMS number on file')
  }

  const summaryParts = [
    quoteLinkChannelLabel(channel),
    emailOk ? email : 'email —',
    smsOk ? smsRaw : sms_is_mock && smsRaw ? `${smsRaw} (mock)` : 'SMS —',
  ]

  return {
    channel,
    channel_label: quoteLinkChannelLabel(channel),
    email: emailOk ? email : null,
    sms: smsRaw || null,
    sms_is_mock,
    will_reach,
    gaps,
    can_notify: will_reach.length > 0,
    summary: summaryParts.join(' · '),
  }
}

/** Confirm dialog body listing exact destinations before create or notify. */
export function formatOfferDestinationConfirm(
  rows: OfferDestinationLike[],
  mode: 'create_links' | 'notify',
): string {
  const blocks = rows.map((o) => {
    const name = o.operator_name?.trim() || 'Operator'
    const d = describeOfferDestination(o)
    const reach =
      d.will_reach.length > 0
        ? d.will_reach.join('\n  ')
        : '(nowhere — fill email/SMS first)'
    const gapBit = d.gaps.length ? `\n  ⚠ ${d.gaps.join('; ')}` : ''
    return `${name}\n  Channel: ${d.channel_label}\n  ${reach}${gapBit}`
  })
  if (mode === 'create_links') {
    return [
      'Create shareable offer links only — no email/SMS will be sent yet.',
      '',
      'Contacts on file for these operators:',
      '',
      ...blocks,
      '',
      'Continue?',
    ].join('\n')
  }
  return [
    'Send trip offer / quote-request links to these destinations now?',
    '',
    ...blocks,
    '',
    'Send offer links?',
  ].join('\n')
}

/** Dispatcher: Link ready / Notified @ Zulu + browser-local, plus relative age. */
export function formatOfferSentAt(
  utcIso: string | null | undefined,
  nowMs = Date.now(),
  kind: 'link' | 'notified' = 'link',
): { zulu: string; local: string; ago: string; display: string } | null {
  if (!utcIso) return null
  const utc = DateTime.fromISO(utcIso, { zone: 'utc' })
  if (!utc.isValid) return null
  const local = utc.setZone(DateTime.local().zoneName)
  const zulu = utc.toFormat("dd HHmm'Z'")
  const localStr = local.toFormat('dd MMM h:mm a ZZZZ')
  const ago = formatOfferAge(utcIso, nowMs)
  const prefix = kind === 'notified' ? 'Notified @' : 'Link ready @'
  return {
    zulu,
    local: localStr,
    ago,
    display: `${prefix} ${zulu} · ${localStr}${ago ? ` · ${ago}` : ''}`,
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
