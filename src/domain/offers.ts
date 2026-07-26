/** Offer SMS reply parsing — never say "bid" operator-facing. */

export function parseAvailabilityReply(body: string): 'available' | 'unavailable' | null {
  const t = body.trim().toLowerCase()
  if (/^(1|yes|y|available|avail)\b/.test(t)) return 'available'
  if (/^(2|no|n|unavailable|unavail)\b/.test(t)) return 'unavailable'
  return null
}

export function availabilityPingBody(lane: string, payload: string, ready: string): string {
  return `OnFly trip offer: ${lane}, ${payload}, ready ${ready}. Available to quote? Reply 1 YES / 2 NO.`
}

export function offerLinkUrl(token: string, appBase = ''): string {
  const base = appBase.replace(/\/$/, '')
  return `${base}/offer/${token}`
}

/** SMS / email body with magic link (desk + pings). */
export function availabilityPingWithLink(
  lane: string,
  payload: string,
  ready: string,
  token: string,
  appBase = '',
): string {
  return `${availabilityPingBody(lane, payload, ready)}\nRespond here: ${offerLinkUrl(token, appBase)}`
}

export function availabilityEmailSubject(lane: string): string {
  return `OnFly trip offer — ${lane}`
}

export function quoteLinkBody(token: string, appBase = ''): string {
  return `Great — quote here: ${offerLinkUrl(token, appBase)}`
}

export function standDownBody(lane: string): string {
  return `OnFly trip ${lane} is covered — thank you for the fast response. You're first in line on the next one.`
}

export const DISCLOSURE_295_24_TEMPLATE =
  'Part 295.24 disclosure: The air carrier providing this charter is a certificated Part 135 operator. OnFly Air acts as broker and is not the air carrier.'
