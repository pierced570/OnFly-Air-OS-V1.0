/** Operator trip-offer copy — never say "bid". */

export function parseAvailabilityReply(body: string): 'available' | 'unavailable' | null {
  const t = body.trim().toLowerCase()
  if (/^(1|yes|y|available|avail)\b/.test(t)) return 'available'
  if (/^(2|no|n|unavailable|unavail)\b/.test(t)) return 'unavailable'
  return null
}

export function offerLinkUrl(token: string, appBase = ''): string {
  const base = appBase.replace(/\/$/, '')
  return `${base}/offer/${token}`
}

/**
 * Plain-text body for email.
 * No route / payload / ready details here — those live on the offer page.
 * Params kept for call-site compatibility.
 */
export function availabilityPingBody(
  _lane: string,
  _payload: string,
  _ready: string,
): string {
  return [
    'Charter flight quote request',
    '',
    'Tap the link to open the request and answer Yes or No.',
    'Takes under a minute — even a No helps us move on.',
    'No need to reply to this email.',
  ].join('\n')
}

/** Short SMS body + magic link to the public offer / quote page. */
export function availabilityPingSmsWithLink(
  token: string,
  appBase = '',
): string {
  const url = offerLinkUrl(token, appBase)
  return [
    'OnFly charter quote request',
    'Tap to open and answer Yes or No (under a minute):',
    url,
  ].join('\n')
}

/** Email/SMS plain body with magic link (desk + pings). */
export function availabilityPingWithLink(
  lane: string,
  payload: string,
  ready: string,
  token: string,
  appBase = '',
): string {
  const url = offerLinkUrl(token, appBase)
  return `${availabilityPingBody(lane, payload, ready)}\n\n${url}`
}

/** Branded HTML for the quote-request email — short, link-first. */
export function availabilityPingHtml(
  _lane: string,
  _payload: string,
  _ready: string,
  token: string,
  appBase = '',
): string {
  const url = offerLinkUrl(token, appBase)
  return [
    `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.45;color:#0c0c0e">`,
    `<p style="margin:0 0 12px;font-size:20px;font-weight:700">Charter flight quote request</p>`,
    `<p style="margin:0 0 20px;font-size:15px">Tap below to open the request and answer <strong>Yes</strong> or <strong>No</strong>. Takes under a minute — even a No helps us move on. No need to reply to this email.</p>`,
    `<p style="margin:0 0 8px"><a href="${escapeAttr(url)}" style="display:inline-block;background:#c9a227;color:#0c0c0e;font-weight:700;font-size:16px;text-decoration:none;padding:16px 22px;border-radius:8px">Open request &amp; reply Yes or No →</a></p>`,
    `<p style="margin:14px 0 0;font-size:13px"><a href="${escapeAttr(url)}" style="color:#0c0c0e;font-weight:600">${escapeHtml(url)}</a></p>`,
    `</div>`,
  ].join('')
}

export function availabilityEmailSubject(_lane: string): string {
  return 'Charter flight quote request'
}

export function quoteLinkBody(token: string, appBase = ''): string {
  return `Great — quote here: ${offerLinkUrl(token, appBase)}`
}

export function standDownBody(lane: string): string {
  return `OnFly trip ${lane} is covered — thank you for the fast response. You're first in line on the next one.`
}

export const DISCLOSURE_295_24_TEMPLATE =
  'Part 295.24 disclosure: The air carrier providing this charter is a certificated Part 135 operator. OnFly Air acts as broker and is not the air carrier.'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}
