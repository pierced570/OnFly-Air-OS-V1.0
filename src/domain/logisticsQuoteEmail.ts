/**
 * Client-facing multi-option logistics / charter quote email.
 * Pure TS — no operator names, tails, costs, or margins.
 * Keep the card about price + times; supporting copy stays fine print.
 */

import { BRAND_EMAIL, BRAND_PHONE } from '@/domain/brand'
import type {
  CharterQuoteMissionChip,
  LogisticsQuoteOptionView,
} from '@/domain/clientLogisticsQuote'
import {
  CLIENT_QUOTE_ALL_IN_NOTE,
  CLIENT_QUOTE_TAXES_NOTE,
  PORTAL_ACCEPT_CTA,
} from '@/domain/clientLogisticsQuote'

export type LogisticsQuoteEmailInput = {
  /** Page title e.g. Charter Quote */
  title: string
  /** Lane headline e.g. Akron CAK → White Plains HPN */
  originLabel: string
  destLabel: string
  options: LogisticsQuoteOptionView[]
  acceptUrl?: string | null
  logoUrl?: string | null
  disclosureText?: string | null
  /** Optional trip / request ref for subject + badge */
  refLabel?: string | null
  /** Mission chips under the lane (cargo / dims / ready). */
  missionChips?: CharterQuoteMissionChip[]
  /** Intro under chips. */
  intro?: string | null
  /** Ready-now assumption fine print. */
  validityNote?: string | null
  /** Optional dispatcher line for footer. */
  dispatcherLine?: string | null
  /** Optional post-book tracking hint URL/path. */
  trackingHintUrl?: string | null
}

export function logisticsQuoteEmailSubject(
  input: LogisticsQuoteEmailInput,
): string {
  const lane = `${input.originLabel} → ${input.destLabel}`
  const ref = input.refLabel?.trim() ? ` · ${input.refLabel.trim()}` : ''
  return `OnFly Air — ${input.title} (${lane})${ref}`
}

export function renderLogisticsQuoteEmailText(
  input: LogisticsQuoteEmailInput,
): string {
  const lines = [
    `OnFly Air — ${input.title}`,
    `${input.originLabel} → ${input.destLabel}`,
    input.refLabel?.trim() ? `Quote · ${input.refLabel.trim()}` : '',
    '',
  ]
  if (input.missionChips?.length) {
    lines.push(input.missionChips.map((c) => c.label).join(' · '), '')
  }
  if (input.intro?.trim()) {
    lines.push(input.intro.trim(), '')
  }
  for (const opt of input.options) {
    lines.push(
      `${opt.option_number_label} · ${opt.aircraft_type}`,
      ...opt.milestones.map((m) => `${m.label}: ${m.clock}`),
      `${opt.flight_time_label} · ${opt.door_to_door_label}`,
      `Price: $${opt.price.toLocaleString('en-US')} (${opt.all_in_note || CLIENT_QUOTE_ALL_IN_NOTE})`,
      '',
    )
  }
  if (input.acceptUrl) {
    lines.push(`Go to portal to accept: ${input.acceptUrl}`, '')
  }
  lines.push(
    'All-in includes repositioning, crew, fuel, FET & segment fees where applicable. On accept: confirmation, ETA sheet, live tracking.',
    input.validityNote?.trim() ||
      'ETAs assume ready-now. Quote valid 4 hours unless withdrawn.',
    '',
    `Questions? 24-hr ops · ${BRAND_PHONE}`,
    input.dispatcherLine?.trim() || `OnFly Air dispatch · ${BRAND_EMAIL}`,
  )
  if (input.trackingHintUrl?.trim()) {
    lines.push('', `Once booked: ${input.trackingHintUrl}`)
  }
  lines.push(
    '',
    input.disclosureText?.trim() ||
      'Operated by a vetted Part 135 carrier. OnFly Air acts as broker and is not the air carrier.',
  )
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
}

/** Branded HTML option cards — cream/client family, gold CTA, no carrier name. */
export function renderLogisticsQuoteEmailHtml(
  input: LogisticsQuoteEmailInput,
): string {
  const optionCards = input.options
    .map((opt) => renderOptionCard(opt, input.acceptUrl))
    .join('')

  const disclosure = `<p style="margin:10px 0 0;padding:6px 4px 0;border-top:1px solid #e5dfd0;font-size:9px;line-height:1.35;color:#8a8680">${escapeHtml(
    input.disclosureText?.trim() ||
      'Operated by a vetted Part 135 carrier. OnFly Air acts as broker and is not the air carrier.',
  )}</p>`

  const logoBlock = input.logoUrl?.trim()
    ? `<img src="${escapeAttr(input.logoUrl.trim())}" alt="OnFly Air" width="140" style="display:block;max-width:140px;height:auto;border:0" />`
    : `<div style="color:#c9a227;letter-spacing:0.16em;font-weight:700;font-size:12px">ONFLY AIR</div>`

  const refBadge = input.refLabel?.trim()
    ? `<div style="display:inline-block;border:1px solid #c9a227;color:#c9a227;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Quote · ${escapeHtml(input.refLabel.trim())}</div>`
    : ''

  const chips = (input.missionChips ?? [])
    .map(
      (c) =>
        `<span style="display:inline-block;margin:0 4px 4px 0;padding:3px 8px;border-radius:999px;background:#1a1a1c;color:#f7f2e3;font-size:9px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(c.label)}</span>`,
    )
    .join('')

  const intro = input.intro?.trim() || defaultIntro(input.options.length)

  const validity =
    input.validityNote?.trim() ||
    'ETAs assume ready-now. Quote valid 4 hours unless withdrawn.'

  const dispatcher =
    input.dispatcherLine?.trim() || `OnFly Air dispatch · ${BRAND_EMAIL}`

  const track = input.trackingHintUrl?.trim()
    ? `<p style="margin:12px 0 0;text-align:center;font-size:11px;color:#6b6560">
        Once booked:
        <a href="${escapeAttr(input.trackingHintUrl.trim())}" style="color:#0c0c0e;font-weight:600">${escapeHtml(input.trackingHintUrl.trim())}</a>
      </p>`
    : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#ece8df;font-family:Georgia,'Times New Roman',serif;color:#0c0c0e">
  <div style="max-width:680px;margin:0 auto;padding:20px 12px">
    <div style="background:#f7f2e3;border:1px solid #e5dfd0;border-radius:12px;overflow:hidden">
      <div style="background:#0c0c0e;padding:18px 20px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle">${logoBlock}</td>
            <td style="vertical-align:middle;text-align:right">${refBadge}</td>
          </tr>
        </table>
        <h1 style="margin:14px 0 8px;font-size:24px;line-height:1.2;font-weight:700;color:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:-0.02em">
          ${escapeHtml(input.originLabel)} → ${escapeHtml(input.destLabel)}
        </h1>
        ${chips ? `<div style="margin:0 0 8px">${chips}</div>` : ''}
        <p style="margin:0;font-size:12px;line-height:1.4;color:#b8b2a6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
          ${escapeHtml(intro)}
        </p>
      </div>

      <div style="padding:16px 16px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
        ${optionCards || `<p style="margin:0;font-size:13px;color:#6b6560">Options will follow shortly.</p>`}

        <p style="margin:10px 4px 0;font-size:10px;line-height:1.4;color:#8a8680">
          All-in includes repositioning, crew, fuel, FET &amp; segment fees where applicable. On accept: confirmation, ETA sheet, live tracking. ${escapeHtml(validity)}
        </p>
      </div>

      <div style="background:#0c0c0e;padding:14px 18px;margin-top:12px">
        <table style="width:100%;border-collapse:collapse;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
          <tr>
            <td style="vertical-align:top;font-size:11px;line-height:1.45;color:#f7f2e3">
              Questions? <strong style="color:#c9a227">24-hr ops · ${escapeHtml(BRAND_PHONE)}</strong>
            </td>
            <td style="vertical-align:top;text-align:right;font-size:11px;line-height:1.45;color:#b8b2a6">
              ${escapeHtml(dispatcher)}
            </td>
          </tr>
        </table>
      </div>
    </div>
    ${track}
    ${disclosure}
  </div>
</body></html>`
}

function defaultIntro(optionCount: number): string {
  if (optionCount <= 1) {
    return 'All-in price · taxes & fees included. Go to the portal to accept and lock it.'
  }
  return `${optionCount} options · all-in prices. Go to the portal to pick one and lock it.`
}

/** Email / desk-preview CTA — real Accept buttons live on /accept only. */
export { PORTAL_ACCEPT_CTA } from '@/domain/clientLogisticsQuote'

function renderOptionCard(
  opt: LogisticsQuoteOptionView,
  acceptUrl?: string | null,
): string {
  const milestones =
    opt.milestones.length > 0
      ? `<table style="width:100%;border-collapse:separate;border-spacing:4px 0;margin:0 0 10px"><tr>${opt.milestones
          .map((m) => {
            const hi = m.key === 'delivered'
            const ring = hi ? 'border:1px solid #c9a227;' : ''
            return `<td style="width:25%;vertical-align:top;background:#f7f2e3;${ring}border-radius:6px;padding:6px 6px">
              <div style="font-size:8px;font-weight:700;letter-spacing:0.06em;line-height:1.2;text-transform:uppercase;color:${hi ? '#c9a227' : '#6b6560'}">${escapeHtml(m.label)}</div>
              <div style="margin-top:2px;font-size:14px;font-weight:700;font-family:ui-monospace,Menlo,monospace;color:#0c0c0e">${escapeHtml(m.clock)}</div>
            </td>`
          })
          .join('')}</tr></table>`
      : ''

  const portalHref = acceptUrl?.trim() || null
  const cta = portalHref
    ? `<a href="${escapeAttr(portalHref)}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;padding:9px 14px;border-radius:8px;font-weight:700;font-size:13px">${escapeHtml(PORTAL_ACCEPT_CTA)}</a>`
    : ''

  return `<div style="margin:0 0 12px;padding:14px;border:1px solid #e5dfd0;border-radius:12px;background:#fff">
  <table style="width:100%;border-collapse:collapse;margin:0 0 10px">
    <tr>
      <td style="vertical-align:baseline;padding-right:10px">
        <div style="font-size:16px;font-weight:700;color:#0c0c0e">${escapeHtml(opt.option_number_label)} · ${escapeHtml(opt.aircraft_type)}</div>
      </td>
      <td style="vertical-align:baseline;text-align:right;white-space:nowrap">
        <div style="font-size:26px;font-weight:700;letter-spacing:-0.02em;font-family:ui-monospace,Menlo,monospace;color:#0c0c0e">$${opt.price.toLocaleString('en-US')}</div>
        <div style="margin-top:1px;font-size:10px;color:#2e7d32;font-weight:600">${escapeHtml(opt.all_in_note || CLIENT_QUOTE_TAXES_NOTE)}</div>
      </td>
    </tr>
  </table>
  ${milestones}
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="vertical-align:middle;font-size:11px;color:#6b6560">${escapeHtml(opt.flight_time_label)} · ${escapeHtml(opt.door_to_door_label)}</td>
      <td style="vertical-align:middle;text-align:right">${cta}</td>
    </tr>
  </table>
</div>`
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
