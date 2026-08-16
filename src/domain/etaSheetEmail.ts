/**
 * Branded client ETA sheet — cream portal tracking look (not a separate email skin).
 * Pure TS. UTF-8 + HTML entities so preview/email never mojibake · / →.
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
  /** Short lane e.g. CAK → HPN */
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
}

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

/** KCAK→KHPN / KCAK → KHPN → CAK → HPN */
export function shortLaneLabel(lane: string): string {
  const parts = lane
    .split(/\s*(?:→|->|–|—)\s*/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
  if (parts.length < 2) return lane.trim() || '—'
  const short = (icao: string) => {
    const c = icao.replace(/[^A-Z0-9]/g, '')
    return c.length === 4 && c.startsWith('K') ? c.slice(1) : c || icao
  }
  return `${short(parts[0]!)} → ${short(parts[parts.length - 1]!)}`
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
  const logoBlock = logo
    ? `<img src="${escapeAttr(logo)}" alt="OnFly Air" width="160" style="display:block;max-width:160px;height:auto;border:0" />`
    : `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.16em;color:#c9a227">ONFLY AIR</div>`

  const aircraft = escapeHtml(tpl.aircraftType.trim() || 'TBD')
  const aircraftBlurb = escapeHtml(
    tpl.aircraftBlurb?.trim() || 'Cargo configuration',
  )
  const tail = escapeHtml(tpl.tail.trim().toUpperCase() || 'TBD')
  const pattern = escapeHtml(tpl.patternLabel.trim() || 'Airport to airport')
  const prepared = escapeHtml(tpl.preparedLabel.trim())
  const tzNote = escapeHtml(
    tpl.timezoneNote?.trim() ||
      'Stop-local times &middot; Zulu in parentheses',
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

  const milestoneRows =
    tpl.milestones.length > 0
      ? tpl.milestones
          .map((m, i) => {
            const actual = m.actual?.trim()
            const actualHtml = actual
              ? `<span style="color:#0c0c0e;font-weight:600">${escapeHtml(actual)}</span>`
              : `<span style="color:#c9a227;font-weight:600">Live on portal</span>`
            return `<tr style="${i % 2 === 0 ? 'background:#fffdf8' : 'background:#ffffff'}">
        <td style="padding:12px 12px;border-top:1px solid #e5dfd0;vertical-align:top">
          <div style="font-size:14px;font-weight:700;color:#0c0c0e">${escapeHtml(m.label)}</div>
          ${
            m.detail?.trim()
              ? `<div style="margin-top:3px;font-size:12px;color:#6b6560;line-height:1.4">${escapeHtml(m.detail.trim())}</div>`
              : ''
          }
        </td>
        <td style="padding:12px 12px;border-top:1px solid #e5dfd0;vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#6b6560;white-space:nowrap">${escapeHtml(m.projected || '—')}</td>
        <td style="padding:12px 12px;border-top:1px solid #e5dfd0;vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px">${actualHtml}</td>
      </tr>`
          })
          .join('')
      : `<tr><td colspan="3" style="padding:18px 12px;border-top:1px solid #e5dfd0;font-size:13px;color:#6b6560">
        Milestone timeline fills in once the trip is booked with an ETA chain &mdash; open the portal for live actuals.
      </td></tr>`

  // Stepper dots (portal-style) when we have milestones
  const stepper =
    tpl.milestones.length > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>${tpl.milestones
          .map((m) => {
            const n = tpl.milestones.length
            const w = Math.floor(100 / n)
            return `<td style="width:${w}%;padding:0 4px;vertical-align:top;text-align:center">
            <div style="margin:0 auto 8px;width:12px;height:12px;border-radius:50%;border:2px solid #c9a227;background:#f7f2e3"></div>
            <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0c0c0e;line-height:1.3">${escapeHtml(m.label)}</div>
            <div style="margin-top:4px;font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6b6560">${escapeHtml(m.projected || '—')}</div>
          </td>`
          })
          .join('')}</tr></table>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OnFly ETA sheet · PO #${po}</title>
</head>
<body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e3">
    <tr>
      <td style="background:#0c0c0e;padding:14px 20px;border-bottom:1px solid rgba(247,242,227,0.12)">
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
        <table role="presentation" width="100%" style="max-width:720px">
          <tr>
            <td style="padding:22px 8px 8px">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c9a227">${pattern}</div>
              <div style="margin-top:6px;font-size:26px;font-weight:700;color:#0c0c0e;line-height:1.2;letter-spacing:-0.02em">PO #${po} &middot; ${lane}</div>
              <div style="margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#6b6560">${prepared}</div>
              <div style="margin-top:4px;font-size:12px;color:#6b6560;line-height:1.45">Projected times below; actuals fill in live on your portal.</div>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;border-radius:8px;overflow:hidden">
                <tr>
                  <td style="padding:8px 14px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#c9a227">&#9679; Live ETA track</td>
                  <td align="right" style="padding:8px 14px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(247,242,227,0.55)">Standing by</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:14px 14px 16px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#c9a227">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:2px 8px 2px 0;color:#c9a227">${tail} &middot; ${aircraft.toUpperCase()}</td>
                        <td style="padding:2px 8px;color:#c9a227">${escapeHtml(aircraftBlurb)}</td>
                        <td align="right" style="padding:2px 0 2px 8px;color:#f7f2e3">Open portal for ADS-B</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 0 4px">
              ${stepper}
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
                    Actual vs forecast
                  </td>
                  <td align="right" style="padding:10px 14px;border-bottom:1px solid #e5dfd0;font-size:11px;color:#6b6560">${tzNote}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:0">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                      <tr>
                        <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700;text-transform:uppercase">Milestone</th>
                        <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700;text-transform:uppercase">Estimated</th>
                        <th align="left" style="padding:8px 12px;font-size:10px;letter-spacing:0.12em;color:#6b6560;font-weight:700;text-transform:uppercase">Actual / Forecast</th>
                      </tr>
                      ${milestoneRows}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 4px 0;font-size:12px;color:#6b6560;line-height:1.45">
                Projections assume current winds and slot times. If any milestone slips more than 15 minutes, dispatch calls your urgent number.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 20px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0e;border-radius:8px">
                <tr>
                  <td style="padding:18px 18px;vertical-align:middle">
                    <div style="font-size:16px;font-weight:700;color:#f7f2e3">Watch it move, live</div>
                    <div style="margin-top:6px;font-size:13px;color:#b8b2a6;line-height:1.45;max-width:340px">
                      Your portal shows live ADS-B position and milestone actuals as they fill in.
                    </div>
                  </td>
                  <td align="right" style="padding:18px 18px;vertical-align:middle">
                    <a href="${portalAttr}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-size:13px;font-weight:700;padding:11px 14px;border-radius:6px">Open live tracking portal &rarr;</a>
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
  const lines = [
    `OnFly ETA sheet — PO #${po} · ${tpl.laneShort}`,
    tpl.patternLabel,
    tpl.preparedLabel,
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
    'Actual vs forecast',
    ...tpl.milestones.map(
      (m) =>
        `${m.label}: ${m.projected || '—'} | Actual: ${m.actual?.trim() || 'live on portal'}`,
    ),
    '',
    `Open live tracking portal: ${tpl.portalUrl}`,
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
