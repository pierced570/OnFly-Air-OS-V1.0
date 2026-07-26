/** Offer SMS/email copy + reply parsing — never say "bid" operator-facing. */

export function parseAvailabilityReply(
  body: string,
): 'available' | 'unavailable' | null {
  const t = body.trim().toLowerCase()
  if (/^(1|yes|y|available|avail)\b/.test(t)) return 'available'
  if (/^(2|no|n|unavailable|unavail)\b/.test(t)) return 'unavailable'
  return null
}

export function offerPublicUrl(token: string, appBase = ''): string {
  const base = appBase.replace(/\/$/, '')
  return `${base}/offer/${token}`
}

/** SMS: link-first Yes/No (reply 1/2 still works). */
export function availabilityPingBody(
  lane: string,
  payload: string,
  ready: string,
  offerUrl?: string,
): string {
  const link = offerUrl?.trim()
    ? ` Tap Yes/No: ${offerUrl.trim()}`
    : ''
  return `OnFly trip offer: ${lane}, ${payload}, ready ${ready}.${link} Or reply 1 YES / 2 NO.`
}

export function quoteLinkBody(token: string, appBase = ''): string {
  const url = offerPublicUrl(token, appBase)
  return `Great — quote here: ${url}`
}

export function availabilityEmailSubject(lane: string): string {
  return `OnFly trip offer — ${lane}`
}

export function availabilityEmailText(opts: {
  lane: string
  payload: string
  ready: string
  offerUrl: string
  operatorName: string
}): string {
  return [
    `Hi ${opts.operatorName},`,
    '',
    `OnFly trip offer: ${opts.lane}`,
    `${opts.payload} · ready ${opts.ready}`,
    '',
    `Open this link to answer Yes or No (then quote if Yes):`,
    opts.offerUrl,
    '',
    `— OnFly Air desk`,
  ].join('\n')
}

export function availabilityEmailHtml(opts: {
  lane: string
  payload: string
  ready: string
  offerUrl: string
  operatorName: string
}): string {
  const url = opts.offerUrl.replace(/"/g, '&quot;')
  return `<div style="font-family:system-ui,sans-serif;line-height:1.45;color:#141414">
<p>Hi ${escapeHtml(opts.operatorName)},</p>
<p><strong>OnFly trip offer:</strong> ${escapeHtml(opts.lane)}<br/>
${escapeHtml(opts.payload)} · ready ${escapeHtml(opts.ready)}</p>
<p><a href="${url}" style="display:inline-block;background:#c9a227;color:#0c0c0e;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open — Yes / No</a></p>
<p style="font-size:13px;color:#555">If Yes, enter aircraft tail, time to position, live leg, and cost.</p>
<p style="font-size:12px;color:#777">— OnFly Air desk</p>
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function standDownBody(lane: string): string {
  return `OnFly trip ${lane} is covered — thank you for the fast response. You're first in line on the next one.`
}

export const DISCLOSURE_295_24_TEMPLATE =
  'Part 295.24 disclosure: The air carrier providing this charter is a certificated Part 135 operator. OnFly Air acts as broker and is not the air carrier.'

/** Map tax/fees checkboxes → compare fee_scope. */
export function feeScopeFromIncludes(
  includesAircraftTax: boolean,
  includesFees: boolean,
): 'aircraft_only' | 'aircraft_and_fees' {
  return includesAircraftTax || includesFees
    ? 'aircraft_and_fees'
    : 'aircraft_only'
}
