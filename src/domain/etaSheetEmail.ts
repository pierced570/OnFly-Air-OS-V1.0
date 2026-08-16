/**
 * Branded client ETA sheet — cream portal tracking look (not a separate email skin).
 * Pure TS. UTF-8 + HTML entities so preview/email never mojibake · / →.
 * Email is static: no progress dots (portal only). Stages show ETAs + disclosure.
 */

import { BRAND_EMAIL, BRAND_PHONE } from '@/domain/brand'

export type EtaSheetEmailStop = {
  /** PICKUP / DROP-OFF */
  kind: 'pickup' | 'dropoff'
  /** DOCK ADDRESS / FBO / etc. */
  placeBadge?: string | null
  title: string
  addressLines: string[]
  footer?: string | null
}

export type EtaSheetEmailMilestone = {
  label: string
  detail?: string | null
  projected: string | null
  /** When null, shows “live on portal”. */
  actual?: string | null
}

export type EtaSheetEmailTemplate = {
  logoUrl?: string | null
  poNumber: string
  /** Full route e.g. CAK → HPN · HPN → CAK */
  laneShort: string
  preparedLabel: string
  /** Door to door / Airport to airport — portal wording */
  patternLabel: string
  aircraftType: string
  aircraftBlurb?: string | null
  tail: string
  pickup: EtaSheetEmailStop
  dropoff: EtaSheetEmailStop
  milestones: EtaSheetEmailMilestone[]
  portalUrl: string
  timezoneNote?: string | null
  phone?: string | null
  supportEmail?: string | null
  /** Shown under trip stages — ETAs may move. */
  etaDisclosure?: string | null
}

export const DEFAULT_ETA_DISCLOSURE =
  'All ETAs are estimates and may change for weather, ATC, passenger or cargo readiness, loading, or safety of flight. Live stage progress is on your tracking portal.'

export function etaSheetEmailSubject(tpl: {
  poNumber: string
  laneShort: string
  tail?: string | null
}): string {
  const po = tpl.poNumber.trim() || 'Trip'
  const lane = tpl.laneShort.trim()
  const tail = tpl.tail?.trim()
  return [
    'OnFly ETA sheet',
    po ? `PO #${po.replace(/^PO\s*#?\s*/i, '')}` : null,
    lane || null,
    tail || null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Match portal tracking pattern copy. */
export function patternLabelForService(
  pattern: string | null | undefined,
): string {
  switch ((pattern ?? '').toUpperCase()) {
    case 'D2D':
      return 'Door to door'
    case 'D2A':
      return 'Door to airport'
    case 'A2D':
      return 'Airport to door'
    case 'A2A':
      return 'Airport to airport'
    default:
      return 'Airport to airport'
  }
}

function shortIcaoToken(icao: string): string {
  const c = icao.replace(/[^A-Z0-9]/g, '')
  return c.length === 4 && c.startsWith('K') ? c.slice(1) : c || icao
}

/**
 * First → last only (compact). Prefer {@link fullLaneLabel} on the sheet body.
 */
export function shortLaneLabel(lane: string): string {
  const parts = lane
    .split(/\s*(?:→|->|–|—)\s*/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
  if (parts.length < 2) return lane.trim() || '—'
  return `${shortIcaoToken(parts[0]!)} → ${shortIcaoToken(parts[parts.length - 1]!)}`
}

/**
 * Full multi-leg route for the ETA sheet header.
 * e.g. "KCAK → KHPN · KHPN → KCAK" → "CAK → HPN · HPN → CAK"
 */
export function fullLaneLabel(lane: string): string {
  const raw = lane.trim()
  if (!raw) return '—'
  const legs = raw
    .split(/\s*·\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  const formatLeg = (leg: string) => {
    const parts = leg
      .split(/\s*(?:→|->|–|—)\s*/)
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean)
    if (!parts.length) return leg
    return parts.map(shortIcaoToken).join(' → ')
  }
  if (legs.length > 1) return legs.map(formatLeg).join(' · ')
  return formatLeg(raw)
}

export function renderEtaSheetEmailHtml(tpl: EtaSheetEmailTemplate): string {
  const po = escapeHtml(
    tpl.poNumber.replace(/^PO\s*#?\s*/i, '').trim() || tpl.poNumber.trim() || '—',
  )
  const lane = escapeHtml(tpl.laneShort.trim() || '—')
  const phone = escapeHtml(tpl.phone?.trim() || BRAND_PHONE)
  const support = escapeHtml(tpl.supportEmail?.trim() || BRAND_EMAIL)
  const portal = tpl.portalUrl.trim()
  const portalAttr = escapeAttr(portal)
  const portalDisplay = escapeHtml(displayPortalHost(portal))
  const logo = tpl.logoUrl?.trim()
  // Dark near-black banner — logo art is cream/gold (light); never put it on white.
  const logoBlock = logo
    ? `<img src="${escapeAttr(logo)}" alt="OnFly Air" width="168" style="display:block;max-width:168px;height:auto;border:0;background:transparent" />`
    : `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.14em"><span style="color:#c9a227">ONFLY</span> <span style="color:#f7f2e3">AIR</span></div>`

  const aircraft = escapeHtml(tpl.aircraftType.trim() || 'TBD')
  const aircraftBlurb = escapeHtml(
    tpl.aircraftBlurb?.trim() || 'Cargo configuration',
  )
  const tail = escapeHtml(tpl.tail.trim().toUpperCase() || 'TBD')
  const pattern = escapeHtml(tpl.patternLabel.trim() || 'Airport to airport')
  const prepared = escapeHtml(tpl.preparedLabel.trim())
  const tzNote = escapeHtml(
    tpl.timezoneNote?.trim() || 'Stop-local times · Zulu in parentheses',
  )
  const disclosure = escapeHtml(
    tpl.etaDisclosure?.trim() || DEFAULT_ETA_DISCLOSURE,
  )

  const stopCard = (stop: EtaSheetEmailStop) => {
    const kind = stop.kind === 'pickup' ? 'PICKUP' : 'DROP-OFF'
    const badge = stop.placeBadge?.trim()
    const lines = stop.addressLines.map((l) => l.trim()).filter(Boolean)
    return `<td style="width:50%;padding:6px;vertical-align:top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5dfd0;border-radius:8px">
        <tr><td style="padding:14px 14px 12px">
          <div>
            <span style="display:inline-block;background:#0c0c0e;color:#f7f2e3;font-size:10px;font-weight:700;letter-spacing:0.12em;padding:4px 8px;border-radius:4px">${kind}</span>
            ${
              badge
                ? `<span style="display:inline-block;background:#c9a227;color:#0c0c0e;font-size:10px;font-weight:700;letter-spacing:0.12em;padding:4px 8px;border-radius:4px;margin-left:6px">${escapeHtml(badge)}</span>`
                : ''
            }
          </div>
          <div style="margin-top:10px;font-size:15px;font-weight:700;color:#0c0c0e;line-height:1.35">${escapeHtml(stop.title)}</div>
          ${lines
            .map(
              (l) =>
                `<div style="margin-top:4px;font-size:13px;color:#6b6560;line-height:1.45">${escapeHtml(l)}</div>`,
            )
            .join('')}
          ${
            stop.footer?.trim()
              ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #e5dfd0;font-size:12px;color:#0c0c0e;line-height:1.45">${escapeHtml(stop.footer.trim())}</div>`
              : ''
          }
        </td></tr>
      </table>
    </td>`
  }

  // Stages as a list with ETAs — no progress dots (email is static; portal fills stages).
  const stageList =
    tpl.milestones.length > 0
      ? tpl.milestones
          .map((m, i) => {
            const eta = (m.actual?.trim() || m.projected?.trim() || '').trim()
            const etaLabel = m.actual?.trim()
              ? 'Actual'
              : eta
                ? 'ETA'
                : 'Portal'
            const etaColor = m.actual?.trim()
              ? '#2e7d32'
              : eta
                ? '#0c0c0e'
                : '#6b6560'
            return `<tr style="${i % 2 === 0 ? 'background:#fffdf8' : 'background:#ffffff'}">
        <td style="padding:14px 14px;border-top:1px solid #e5dfd0;vertical-align:top">
          <div style="font-size:15px;font-weight:700;color:#0c0c0e">${escapeHtml(m.label)}</div>
          ${
            m.detail?.trim()
              ? `<div style="margin-top:3px;font-size:12px;color:#6b6560;line-height:1.4">${escapeHtml(m.detail.trim())}</div>`
              : ''
          }
        </td>
        <td style="padding:14px 14px;border-top:1px solid #e5dfd0;vertical-align:top;text-align:right;white-space:nowrap">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b6560">${etaLabel}</div>
          <div style="margin-top:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;font-weight:700;color:${etaColor}">${escapeHtml(eta || 'Live on portal')}</div>
        </td>
      </tr>`
          })
          .join('')
      : `<tr><td colspan="2" style="padding:18px 14px;border-top:1px solid #e5dfd0;font-size:13px;color:#6b6560">
        Open the portal for live stage progress, aircraft position, and tail.
      </td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <title>OnFly ETA sheet · PO #${po}</title>
</head>
<body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e3">
    <tr>
      <td style="background:#0c0c0e;padding:16px 20px;border-bottom:3px solid #c9a227">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e">
          <tr>
            <td style="vertical-align:middle;background:#0c0c0e">${logoBlock}</td>
            <td align="right" style="vertical-align:middle;font-size:11px;color:#f7f2e3;letter-spacing:0.06em;text-transform:uppercase;background:#0c0c0e">
              24-hr ops <span style="color:#c9a227;font-weight:700;text-transform:none;letter-spacing:0">${phone}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:0 12px">
        <table role="presentation" width="100%" style="max-width:720px">
          <tr>
            <td style="padding:22px 8px 8px">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c9a227">${pattern}</div>
              <div style="margin-top:6px;font-size:26px;font-weight:700;color:#0c0c0e;line-height:1.2;letter-spacing:-0.02em">PO #${po}</div>
              <div style="margin-top:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:18px;font-weight:700;color:#0c0c0e;line-height:1.35">${lane}</div>
              <div style="margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#6b6560">${prepared}</div>
              <div style="margin-top:4px;font-size:12px;color:#6b6560;line-height:1.45">
                Track aircraft position and live stage progress on your portal.
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;border-radius:8px;overflow:hidden">
                <tr>
                  <td style="padding:10px 16px 4px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#c9a227">Aircraft</td>
                  <td align="right" style="padding:10px 16px 4px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(247,242,227,0.55)">Live portal below</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:4px 16px 18px">
                    <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:36px;font-weight:800;letter-spacing:0.06em;line-height:1.1;color:#c9a227">${tail}</div>
                    <div style="margin-top:8px;font-size:14px;font-weight:600;color:#f7f2e3;line-height:1.35">${aircraft.toUpperCase()}</div>
                    <div style="margin-top:4px;font-size:12px;color:rgba(247,242,227,0.65);line-height:1.4">${escapeHtml(aircraftBlurb)} &middot; ${lane}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:4px 0 12px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${stopCard(tpl.pickup)}
                  ${stopCard(tpl.dropoff)}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 16px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5dfd0;border-radius:8px;overflow:hidden">
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #e5dfd0;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6b6560">
                    Trip stages &amp; ETAs
                  </td>
                  <td align="right" style="padding:10px 14px;border-bottom:1px solid #e5dfd0;font-size:11px;color:#6b6560">${tzNote}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:0">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                      ${stageList}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 4px 0;font-size:12px;color:#6b6560;line-height:1.5">
                ${disclosure}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 20px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;border-radius:8px">
                <tr>
                  <td style="padding:18px 18px;vertical-align:middle">
                    <div style="font-size:16px;font-weight:700;color:#f7f2e3">Open your tracking portal</div>
                    <div style="margin-top:6px;font-size:13px;color:#b8b2a6;line-height:1.45;max-width:340px">
                      Live aircraft position and stage progress update as the trip moves.
                    </div>
                  </td>
                  <td align="right" style="padding:18px 18px;vertical-align:middle">
                    <a href="${portalAttr}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-size:13px;font-weight:700;padding:11px 14px;border-radius:6px">Open tracking portal &rarr;</a>
                    <div style="margin-top:10px;font-size:11px;color:#8a847a;font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all">${portalDisplay}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:8px 16px 28px;border-top:1px solid #e5dfd0">
        <div style="font-size:12px;color:#6b6560">
          <a href="https://onflyair.com" style="color:#6b6560;text-decoration:none">onflyair.com</a>
          &nbsp;&middot;&nbsp;
          <span style="color:#c9a227">${phone}</span>
          &nbsp;&middot;&nbsp;
          <a href="mailto:${support}" style="color:#0c0c0e;text-decoration:underline">${support}</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderEtaSheetEmailText(tpl: EtaSheetEmailTemplate): string {
  const po = tpl.poNumber.replace(/^PO\s*#?\s*/i, '').trim() || tpl.poNumber
  const disclosure = tpl.etaDisclosure?.trim() || DEFAULT_ETA_DISCLOSURE
  const lines = [
    `OnFly ETA sheet — PO #${po}`,
    `Route: ${tpl.laneShort}`,
    tpl.patternLabel,
    tpl.preparedLabel,
    '',
    `TAIL: ${tpl.tail}`,
    `Aircraft: ${tpl.aircraftType}`,
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
    'Trip stages & ETAs',
    ...tpl.milestones.map((m) => {
      const eta = m.actual?.trim() || m.projected?.trim() || 'Live on portal'
      return `${m.label}: ${eta}`
    }),
    '',
    disclosure,
    '',
    `Open tracking portal: ${tpl.portalUrl}`,
    '',
    `OnFly Air · 24-hr ops ${tpl.phone || BRAND_PHONE} · ${tpl.supportEmail || BRAND_EMAIL}`,
  ]
  return lines.filter((l) => l != null).join('\n')
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
