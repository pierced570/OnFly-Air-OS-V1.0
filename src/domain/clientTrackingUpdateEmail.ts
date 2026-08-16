/**
 * Client tracking update email — reply in the ETA sheet thread.
 * Pure TS (cream client look). Dispatch drafts; this only renders.
 */

import { BRAND_EMAIL, BRAND_PHONE } from '@/domain/brand'
import { etaSheetEmailSubject } from '@/domain/etaSheetEmail'

export type ClientTrackingUpdateTemplate = {
  logoUrl?: string | null
  poNumber: string
  laneShort: string
  tail: string
  /** Freeform update from dispatch (ETA change, stop change, ops note). */
  body: string
  /** Optional headline e.g. "ETA update" / "Stop change". */
  headline?: string | null
  /** Optional revised delivery / landing line. */
  etaLine?: string | null
  portalUrl: string
  phone?: string | null
  supportEmail?: string | null
}

export function clientTrackingUpdateSubject(opts: {
  poNumber: string
  laneShort: string
  tail?: string | null
  /** Original ETA sheet subject — preferred so clients stay in one thread. */
  priorSubject?: string | null
}): string {
  const prior = (opts.priorSubject ?? '').trim()
  if (prior) {
    return /^re:\s*/i.test(prior) ? prior : `Re: ${prior}`
  }
  return `Re: ${etaSheetEmailSubject({
    poNumber: opts.poNumber,
    laneShort: opts.laneShort,
    tail: opts.tail,
  })}`
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

function displayPortalHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Paragraph-preserving plain text → simple HTML blocks. */
function bodyHtml(raw: string): string {
  const parts = raw
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return '<p style="margin:0;font-size:15px;line-height:1.55;color:#0c0c0e">—</p>'
  return parts
    .map((p) => {
      const lines = escapeHtml(p).replace(/\n/g, '<br />')
      return `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#0c0c0e">${lines}</p>`
    })
    .join('')
}

export function renderClientTrackingUpdateHtml(
  tpl: ClientTrackingUpdateTemplate,
): string {
  const po = escapeHtml(
    tpl.poNumber.replace(/^PO\s*#?\s*/i, '').trim() || '—',
  )
  const lane = escapeHtml(tpl.laneShort.trim() || '—')
  const tail = escapeHtml(tpl.tail.trim().toUpperCase() || 'TBD')
  const phone = escapeHtml(tpl.phone?.trim() || BRAND_PHONE)
  const support = escapeHtml(tpl.supportEmail?.trim() || BRAND_EMAIL)
  const portal = tpl.portalUrl.trim()
  const portalAttr = escapeAttr(portal)
  const portalDisplay = escapeHtml(displayPortalHost(portal))
  const headline = escapeHtml(
    (tpl.headline ?? 'Trip update').trim() || 'Trip update',
  )
  const etaLine = tpl.etaLine?.trim()
  const logo = tpl.logoUrl?.trim()
  const logoBlock = logo
    ? `<img src="${escapeAttr(logo)}" alt="OnFly Air" width="168" style="display:block;max-width:168px;height:auto;border:0;background:transparent" />`
    : `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.14em"><span style="color:#c9a227">ONFLY</span> <span style="color:#f7f2e3">AIR</span></div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OnFly trip update · PO #${po}</title>
</head>
<body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e3">
    <tr>
      <td style="background:#0c0c0e;padding:16px 20px;border-bottom:3px solid #c9a227">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle">${logoBlock}</td>
            <td align="right" style="vertical-align:middle;font-size:11px;color:#f7f2e3;letter-spacing:0.06em;text-transform:uppercase">
              24-hr ops <span style="color:#c9a227;font-weight:700;text-transform:none;letter-spacing:0">${phone}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 12px">
        <table role="presentation" width="100%" style="max-width:640px">
          <tr>
            <td style="padding:22px 8px 8px">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c9a227">${headline}</div>
              <div style="margin-top:6px;font-size:24px;font-weight:700;color:#0c0c0e;letter-spacing:-0.02em">PO #${po}</div>
              <div style="margin-top:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:16px;font-weight:700">${lane}</div>
              <div style="margin-top:4px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#6b6560">Tail ${tail}</div>
            </td>
          </tr>
          ${
            etaLine
              ? `<tr><td style="padding:8px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5dfd0;border-radius:8px">
              <tr><td style="padding:14px 16px">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6b6560">Revised timing</div>
                <div style="margin-top:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;font-weight:700;color:#0c0c0e">${escapeHtml(etaLine)}</div>
              </td></tr>
            </table>
          </td></tr>`
              : ''
          }
          <tr>
            <td style="padding:8px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5dfd0;border-radius:8px">
                <tr><td style="padding:18px 16px">
                  ${bodyHtml(tpl.body)}
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 8px 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;border-radius:8px">
                <tr>
                  <td style="padding:18px 16px;text-align:center">
                    <a href="${portalAttr}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:6px">Open live tracking</a>
                    <div style="margin-top:10px;font-size:11px;color:rgba(247,242,227,0.55)">${portalDisplay}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 4px 0;font-size:12px;color:#6b6560;line-height:1.5">
                Questions? ${support} · ${phone}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderClientTrackingUpdateText(
  tpl: ClientTrackingUpdateTemplate,
): string {
  const po = tpl.poNumber.replace(/^PO\s*#?\s*/i, '').trim() || '—'
  const lines = [
    `OnFly trip update · PO #${po}`,
    tpl.laneShort.trim() || '—',
    `Tail ${(tpl.tail || 'TBD').toUpperCase()}`,
    '',
    (tpl.headline ?? 'Trip update').trim(),
    '',
  ]
  if (tpl.etaLine?.trim()) {
    lines.push(`Revised timing: ${tpl.etaLine.trim()}`, '')
  }
  lines.push(tpl.body.trim(), '', `Live tracking: ${tpl.portalUrl.trim()}`)
  return lines.join('\n')
}
