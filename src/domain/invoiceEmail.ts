/**
 * Branded invoice payment-request email — matches ETA sheet chrome:
 * ink header, cream body, stop cards, projected timeline, portal CTA.
 * Balance due + ACH / PDF pay sit above the trip block. Pure TS.
 */

import { BRAND_EMAIL, BRAND_PHONE } from '@/domain/brand'
import type {
  EtaSheetEmailMilestone,
  EtaSheetEmailStop,
} from '@/domain/etaSheetEmail'

/** Strip PO# / PO prefix for display + subject. */
export function invoicePoDisplay(po?: string | null): string {
  const raw = (po ?? '').trim()
  if (!raw) return ''
  return raw.replace(/^PO\s*#?\s*/i, '').trim() || raw
}

/** True when PO is missing or still a human placeholder (never send as-is). */
export function isInvoicePoPlaceholder(po?: string | null): boolean {
  const d = invoicePoDisplay(po)
    .replace(/^[(\[{]+|[)\]}]+$/g, '')
    .trim()
  if (!d) return true
  return /^(INSERT\s*INVOICE|ENTER\s*(PO|INVOICE|TAIL|FBO|ETA)|TBD|TODO|N\/?A)$/i.test(
    d,
  )
}

/**
 * Client-facing invoice subject — same shape as ETA sheet:
 * OnFly invoice · PO #T-76 · CAK → HPN · N6209X
 */
export function invoiceEmailSubject(tpl: {
  poNumber?: string | null
  laneShort?: string | null
  tail?: string | null
}): string {
  const po = invoicePoDisplay(tpl.poNumber)
  const lane = (tpl.laneShort ?? '').trim()
  const tail = (tpl.tail ?? '').trim().toUpperCase()
  return [
    'OnFly invoice',
    po && !isInvoicePoPlaceholder(po) ? `PO #${po}` : null,
    lane || null,
    tail || null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** @deprecated Prefer invoiceEmailSubject({ poNumber }) */
export const INVOICE_EMAIL_SUBJECT = (po?: string) =>
  invoiceEmailSubject({ poNumber: po })

export type InvoiceEmailTemplate = {
  logoUrl?: string | null
  poNumber: string
  /** Short lane e.g. CAK → HPN */
  laneShort: string
  preparedLabel: string
  /** DOOR → DOOR / AIRPORT → AIRPORT */
  patternLabel: string
  aircraftType: string
  aircraftBlurb?: string | null
  tail: string
  pickup: EtaSheetEmailStop
  dropoff: EtaSheetEmailStop
  milestones: EtaSheetEmailMilestone[]
  /** Live tracking portal URL (required for client CTA). */
  portalUrl: string
  timezoneNote?: string | null
  phone?: string | null
  supportEmail?: string | null
  clientName?: string | null
  /** Client-facing total (USD). */
  amountUsd?: number | null
  /** QuickBooks / ACH "View and pay" URL when known. */
  payUrl?: string | null
  /** Jotform (or other) charter contract sign URL. */
  contractUrl?: string | null
}

export function formatInvoiceUsd(amount: number): string {
  const n = Math.round(amount * 100) / 100
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })
}

export function renderInvoiceEmailHtml(tpl: InvoiceEmailTemplate): string {
  const po = escapeHtml(invoicePoDisplay(tpl.poNumber) || '—')
  const lane = escapeHtml(tpl.laneShort.trim() || '—')
  const phone = escapeHtml(tpl.phone?.trim() || BRAND_PHONE)
  const support = escapeHtml(tpl.supportEmail?.trim() || BRAND_EMAIL)
  const portal = tpl.portalUrl.trim()
  const portalAttr = escapeAttr(portal)
  const portalDisplay = escapeHtml(displayPortalHost(portal))
  const logo = tpl.logoUrl?.trim()
  const logoBlock = logo
    ? `<img src="${escapeAttr(logo)}" alt="OnFly Air" width="160" style="display:block;max-width:160px;height:auto;border:0" />`
    : `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:0.14em;color:#c9a227">ONFLYAIR</div>`

  const aircraft = escapeHtml(tpl.aircraftType.trim() || 'TBD')
  const aircraftBlurb = escapeHtml(
    tpl.aircraftBlurb?.trim() || 'Cargo configuration',
  )
  const tail = escapeHtml(tpl.tail.trim().toUpperCase() || 'TBD')
  const pattern = escapeHtml(tpl.patternLabel.trim() || 'AIRPORT → AIRPORT')
  const prepared = escapeHtml(tpl.preparedLabel.trim())
  const tzNote = escapeHtml(
    tpl.timezoneNote?.trim() ||
      'Stop-local times · Zulu in parentheses',
  )
  const amount =
    tpl.amountUsd != null && Number.isFinite(tpl.amountUsd)
      ? formatInvoiceUsd(tpl.amountUsd)
      : null
  const payUrl = tpl.payUrl?.trim()
  const contractUrl = tpl.contractUrl?.trim()
  const client = tpl.clientName?.trim()

  const stopCard = (stop: EtaSheetEmailStop) => {
    const kind = stop.kind === 'pickup' ? 'PICKUP' : 'DROP-OFF'
    const badge = stop.placeBadge?.trim()
    const lines = stop.addressLines.map((l) => l.trim()).filter(Boolean)
    return `<td style="width:50%;padding:8px;vertical-align:top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:10px">
        <tr><td style="padding:16px 16px 14px">
          <div>
            <span style="display:inline-block;background:#0c0c0e;color:#f7f2e3;font-size:10px;font-weight:700;letter-spacing:0.12em;padding:4px 8px;border-radius:999px">${kind}</span>
            ${
              badge
                ? `<span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:10px;font-weight:700;letter-spacing:0.12em;padding:4px 8px;border-radius:999px;margin-left:6px">${escapeHtml(badge)}</span>`
                : ''
            }
          </div>
          <div style="margin-top:12px;font-size:15px;font-weight:700;color:#0c0c0e;line-height:1.35">${escapeHtml(stop.title)}</div>
          ${lines
            .map(
              (l) =>
                `<div style="margin-top:4px;font-size:13px;color:#5c5852;line-height:1.45">${escapeHtml(l)}</div>`,
            )
            .join('')}
          ${
            stop.footer?.trim()
              ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #ececec;font-size:12px;color:#0c0c0e;line-height:1.45">${escapeHtml(stop.footer.trim())}</div>`
              : ''
          }
        </td></tr>
      </table>
    </td>`
  }

  const milestoneRows = tpl.milestones
    .map((m, i) => {
      const actual = m.actual?.trim()
      const actualHtml = actual
        ? `<span style="color:#0c0c0e;font-weight:600">${escapeHtml(actual)}</span>`
        : `<span style="color:#9a948a;font-style:italic">— live on portal</span>`
      return `<tr>
        <td style="padding:14px 12px;border-top:1px solid ${i === 0 ? '#e5e5e5' : '#ececec'};vertical-align:top">
          <div style="font-size:14px;font-weight:700;color:#0c0c0e">${escapeHtml(m.label)}</div>
          ${
            m.detail?.trim()
              ? `<div style="margin-top:3px;font-size:12px;color:#6b6560;line-height:1.4">${escapeHtml(m.detail.trim())}</div>`
              : ''
          }
        </td>
        <td style="padding:14px 12px;border-top:1px solid ${i === 0 ? '#e5e5e5' : '#ececec'};vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#0c0c0e;white-space:nowrap">${escapeHtml(m.projected || '—')}</td>
        <td style="padding:14px 12px;border-top:1px solid ${i === 0 ? '#e5e5e5' : '#ececec'};vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px">${actualHtml}</td>
      </tr>`
    })
    .join('')

  const payButton = payUrl
    ? `<a href="${escapeAttr(payUrl)}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px">View and pay →</a>`
    : `<span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px">Open attached PDF to pay</span>`

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:0">
    <tr>
      <td style="background:#0c0c0e;padding:22px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle">${logoBlock}</td>
            <td align="right" style="vertical-align:middle">
              <span style="display:inline-block;border:1px solid rgba(201,162,39,0.45);border-radius:999px;padding:6px 12px;font-size:11px;color:#f7f2e3;letter-spacing:0.02em">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#2E7D32;margin-right:6px;vertical-align:middle"></span>
                24-hr ops · ${phone}
              </span>
            </td>
          </tr>
        </table>
        <div style="margin-top:22px;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#c9a227">INVOICE</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
          <tr>
            <td style="vertical-align:top">
              <div style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.2">PO #${po} · ${lane}</div>
              <div style="margin-top:8px;font-size:13px;color:#b8b2a6;line-height:1.45">${prepared}${
                client ? ` · ${escapeHtml(client)}` : ''
              } — trip details below; track live on your portal.</div>
            </td>
            <td align="right" style="vertical-align:top;padding-left:12px">
              <span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:10px;font-weight:700;letter-spacing:0.1em;padding:6px 10px;border-radius:6px">${pattern}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr><td align="center" style="padding:0 12px">
      <table role="presentation" width="100%" style="max-width:640px;background:#ffffff">
        <tr>
          <td style="padding:22px 22px 18px;background:#ffffff;border-bottom:1px solid #e8e4dc">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;color:#c9a227">BALANCE DUE</div>
            ${
              amount
                ? `<div style="margin-top:8px;font-size:34px;font-weight:700;color:#0c0c0e;line-height:1.1">${escapeHtml(amount)}</div>`
                : `<div style="margin-top:8px;font-size:18px;font-weight:700;color:#0c0c0e">See attached PDF</div>`
            }
            <div style="margin-top:8px;font-size:13px;color:#6b6560;line-height:1.45">
              Open the attached PDF invoice for full line items. ACH available online.
            </div>
            <div style="margin-top:16px">${payButton}</div>
            ${
              contractUrl
                ? `<div style="margin-top:16px;font-size:13px;line-height:1.45">
              <div style="font-weight:700;color:#0c0c0e;margin-bottom:4px">Please sign the charter contract</div>
              <a href="${escapeAttr(contractUrl)}" style="color:#1a56db;text-decoration:underline;word-break:break-all">${escapeHtml(contractUrl)}</a>
            </div>`
                : ''
            }
          </td>
        </tr>

        <tr>
          <td style="padding:0;border-bottom:1px solid #e8e4dc">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding:20px 22px;border-right:1px solid #e8e4dc;vertical-align:top">
                  <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;color:#c9a227">AIRCRAFT</div>
                  <div style="margin-top:8px;font-size:22px;font-weight:700;color:#0c0c0e">${aircraft}</div>
                  <div style="margin-top:4px;font-size:12px;color:#6b6560">${aircraftBlurb}</div>
                </td>
                <td style="width:50%;padding:20px 22px;vertical-align:top">
                  <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;color:#c9a227">TAIL NUMBER</div>
                  <div style="margin-top:8px;font-size:22px;font-weight:700;color:#0c0c0e;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${tail}</div>
                  <div style="margin-top:4px;font-size:12px;color:#6b6560">
                    <a href="${portalAttr}" style="color:#1a56db;text-decoration:underline">Track this tail live on your portal</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 14px;background:#f3f1eb">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                ${stopCard(tpl.pickup)}
                ${stopCard(tpl.dropoff)}
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 22px 8px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#0c0c0e">PROJECTED TIMELINE</td>
                <td align="right" style="font-size:11px;color:#6b6560">${tzNote}</td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse">
              <tr>
                <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700">MILESTONE</th>
                <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700">PROJECTED</th>
                <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700">ACTUAL</th>
              </tr>
              ${milestoneRows || `<tr><td colspan="3" style="padding:14px 12px;border-top:1px solid #e5e5e5;font-size:13px;color:#6b6560;font-style:italic">Timeline fills in on your portal as the trip progresses.</td></tr>`}
            </table>
            <p style="margin:14px 0 0;font-size:12px;color:#6b6560;line-height:1.45">
              Projections assume current winds and slot times. If any milestone slips more than 15 minutes, dispatch calls your urgent number.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr>
      <td align="center" style="padding:0 12px 0">
        <table role="presentation" width="100%" style="max-width:640px;background:#0c0c0e">
          <tr>
            <td style="padding:22px 22px;vertical-align:middle">
              <div style="font-size:18px;font-weight:700;color:#ffffff">Watch it move, live</div>
              <div style="margin-top:6px;font-size:13px;color:#b8b2a6;line-height:1.45;max-width:320px">
                Your portal shows live ADS-B position and milestone actuals as they fill in.
              </div>
            </td>
            <td align="right" style="padding:22px 22px;vertical-align:middle">
              <a href="${portalAttr}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-size:14px;font-weight:700;padding:12px 16px;border-radius:8px">Open live tracking portal →</a>
              <div style="margin-top:10px;font-size:11px;color:#8a847a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all">${portalDisplay}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:18px 16px 28px">
        <div style="font-size:12px;color:#6b6560">
          OnFly Air · 24-hr ops ${phone} ·
          <a href="mailto:${support}" style="color:#1a56db;text-decoration:underline">${support}</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderInvoiceEmailText(tpl: InvoiceEmailTemplate): string {
  const po = invoicePoDisplay(tpl.poNumber) || '—'
  const amount =
    tpl.amountUsd != null && Number.isFinite(tpl.amountUsd)
      ? formatInvoiceUsd(tpl.amountUsd)
      : null
  const lines = [
    `OnFly invoice — PO #${po} · ${tpl.laneShort}`,
    tpl.preparedLabel,
    tpl.clientName?.trim() || null,
    amount ? `Balance due: ${amount}` : null,
    tpl.payUrl?.trim() ? `View and pay: ${tpl.payUrl.trim()}` : null,
    '',
    `Aircraft: ${tpl.aircraftType}`,
    `Tail: ${tpl.tail}`,
    '',
    'PICKUP',
    tpl.pickup.title,
    ...tpl.pickup.addressLines,
    tpl.pickup.footer || null,
    '',
    'DROP-OFF',
    tpl.dropoff.title,
    ...tpl.dropoff.addressLines,
    tpl.dropoff.footer || null,
    '',
    'Projected timeline',
    ...(tpl.milestones.length
      ? tpl.milestones.map(
          (m) =>
            `${m.label}: ${m.projected || '—'} | Actual: ${m.actual?.trim() || 'live on portal'}`,
        )
      : ['Timeline fills in on your portal.']),
    '',
    `Open live tracking portal: ${tpl.portalUrl}`,
    tpl.contractUrl?.trim()
      ? `Charter contract: ${tpl.contractUrl.trim()}`
      : null,
    '',
    `OnFly Air · 24-hr ops ${tpl.phone || BRAND_PHONE} · ${tpl.supportEmail || BRAND_EMAIL}`,
  ]
  return lines.filter((l) => l != null && l !== '').join('\n')
}

function displayPortalHost(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`.replace(/\/$/, '')
  } catch {
    return url.replace(/^https?:\/\//i, '')
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}
