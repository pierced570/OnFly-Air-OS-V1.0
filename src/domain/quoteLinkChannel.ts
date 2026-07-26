/**
 * Where operator trip-offer / quote links are delivered.
 * Default is both unless the operator profile says otherwise.
 */

export type QuoteLinkChannel = 'sms' | 'email' | 'both'

export const DEFAULT_QUOTE_LINK_CHANNEL: QuoteLinkChannel = 'both'

export function normalizeQuoteLinkChannel(
  raw: string | null | undefined,
): QuoteLinkChannel {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'sms' || v === 'email' || v === 'both') return v
  // Legacy preferred_channel values from operator_contacts
  if (v === 'voice' || v === 'web') return DEFAULT_QUOTE_LINK_CHANNEL
  return DEFAULT_QUOTE_LINK_CHANNEL
}

export function channelIncludesSms(ch: QuoteLinkChannel): boolean {
  return ch === 'sms' || ch === 'both'
}

export function channelIncludesEmail(ch: QuoteLinkChannel): boolean {
  return ch === 'email' || ch === 'both'
}

export function quoteLinkChannelLabel(ch: QuoteLinkChannel): string {
  if (ch === 'sms') return 'SMS only'
  if (ch === 'email') return 'Email only'
  return 'Email + SMS'
}
