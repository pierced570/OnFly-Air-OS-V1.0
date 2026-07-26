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

/** Plain-text body for email / SMS — Yes/No is on the link, not a text reply. */
export function availabilityPingBody(
  lane: string,
  payload: string,
  ready: string,
): string {
  return [
    'OnFly Air Charter Quote Request',
    '',
    'Click the link to see a request for a flight. On the page you’ll see the details and can tap Yes or No — even a No helps us (no need to reply to this email).',
    '',
    `${lane} · ${payload} · ready ${ready}`,
  ].join('\n')
}

/** SMS / email body with magic link (desk + pings). */
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

/** Branded HTML for the quote-request email. */
export function availabilityPingHtml(
  lane: string,
  payload: string,
  ready: string,
  token: string,
  appBase = '',
): string {
  const url = offerLinkUrl(token, appBase)
  return [
    `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.45;color:#0c0c0e">`,
    `<p style="margin:0 0 12px"><strong>OnFly Air Charter Quote Request</strong></p>`,
    `<p style="margin:0 0 16px">Click the link to see a <strong>request for a flight</strong>. On the page you’ll see the details and can tap <strong>Yes</strong> or <strong>No</strong> — even a No helps us move on quickly. No need to reply to this email.</p>`,
    `<p style="margin:0 0 20px;color:#6b6560">${escapeHtml(lane)} · ${escapeHtml(payload)} · ready ${escapeHtml(ready)}</p>`,
    `<p style="margin:0"><a href="${escapeAttr(url)}" style="display:inline-block;background:#c9a227;color:#0c0c0e;font-weight:600;text-decoration:none;padding:12px 18px;border-radius:6px">View flight request →</a></p>`,
    `<p style="margin:16px 0 0;font-size:12px;color:#8a8680">${escapeHtml(url)}</p>`,
    `</div>`,
  ].join('')
}

export function availabilityEmailSubject(_lane: string): string {
  return 'OnFly Air Charter Quote Request'
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
