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

/** Email subject/body when an operator does not get the trip. */
export function standDownEmail(lane: string): { subject: string; text: string } {
  return {
    subject: `OnFly update — ${lane}`,
    text: [
      `Thanks for quoting ${lane}.`,
      '',
      'Another carrier is covering this one. We appreciate the fast turnaround — you\'re first in line on the next fit.',
      '',
      '— OnFly Air dispatch',
    ].join('\n'),
  }
}

/** SMS when the operator wins the trip. */
export function missionGoSms(lane: string, tail: string): string {
  const t = tail.trim() || 'TBD'
  return `OnFly: mission is a go for ${lane}. Tail ${t} assigned. Dispatch will confirm details.`
}

/** Email when the operator wins the trip. */
export function missionGoEmail(opts: {
  lane: string
  tail?: string | null
  typeName?: string | null
}): { subject: string; text: string } {
  const lane = opts.lane.trim() || 'your trip'
  const tail = (opts.tail ?? '').trim() || 'TBD'
  const type = (opts.typeName ?? '').trim()
  return {
    subject: `OnFly — you're on ${lane}`,
    text: [
      `Mission is a go for ${lane}.`,
      '',
      `Aircraft: ${type ? `${type} · ` : ''}${tail}`,
      'Dispatch will confirm details and timing shortly.',
      '',
      '— OnFly Air dispatch',
    ].join('\n'),
  }
}

export const DISCLOSURE_295_24_TEMPLATE =
  'Part 295.24 disclosure: The air carrier providing this charter is a certificated Part 135 operator. OnFly Air acts as broker and is not the air carrier.'

/** Desk SMS when an operator submits a trip offer quote (magic link / form). */
export function quoteSubmittedDeskSms(
  operatorName: string,
  opts?: { lane?: string | null; tripCode?: string | null },
): string {
  const who = operatorName.trim() || 'an operator'
  const bits = [`OnFly: quote submitted by ${who}`]
  const lane = opts?.lane?.trim()
  const code = opts?.tripCode?.trim()
  if (lane) bits.push(lane)
  if (code) bits.push(code)
  return bits.join(' · ')
}

/** Desk email when an operator submits a trip offer quote (no SMS). */
export function quoteSubmittedDeskEmail(opts: {
  operatorName: string
  lane?: string | null
  tripCode?: string | null
  typeName?: string | null
  tail?: string | null
  priceNet?: number | null
  tripPath?: string | null
}): { subject: string; text: string } {
  const who = opts.operatorName.trim() || 'an operator'
  const lane = opts.lane?.trim() || '—'
  const code = opts.tripCode?.trim() || '—'
  const typeName = opts.typeName?.trim() || '—'
  const tail = opts.tail?.trim() || '—'
  const price =
    opts.priceNet != null && Number.isFinite(opts.priceNet)
      ? `$${Math.round(opts.priceNet).toLocaleString('en-US')} NET`
      : '—'
  const subject = `OnFly: quote submitted by ${who} · ${lane}`
  const lines = [
    'A trip offer quote was submitted.',
    '',
    `Operator: ${who}`,
    `Lane: ${lane}`,
    `Trip: ${code}`,
    `Aircraft: ${typeName} · ${tail}`,
    `Price NET: ${price}`,
  ]
  const path = opts.tripPath?.trim()
  if (path) {
    lines.push('', `Open trip: ${path}`)
  }
  lines.push('', 'No SMS was sent — email notification only.')
  return { subject, text: lines.join('\n') }
}

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
