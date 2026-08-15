/**
 * Client-facing multi-option logistics / charter quote email.
 * Pure TS — no operator names, tails, costs, or margins.
 */

import { BRAND_EMAIL, BRAND_PHONE } from '@/domain/brand'
import type {
  CharterQuoteMissionChip,
  LogisticsQuoteOptionView,
} from '@/domain/clientLogisticsQuote'
import {
  CLIENT_QUOTE_ALL_IN_NOTE,
  CLIENT_QUOTE_TAXES_NOTE,
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
    'Operated by a vetted Part 135 carrier',
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
      `${opt.recommended_badge ? `${opt.recommended_badge} — ` : ''}${opt.option_number_label} · ${opt.aircraft_type}`,
      opt.aircraft_blurb,
      ...opt.milestones.map((m) => `${m.label}: ${m.clock}`),
      opt.delivered_summary ?? '',
      `${opt.flight_time_label} · ${opt.door_to_door_label}`,
      `Price: $${opt.price.toLocaleString('en-US')} (${opt.all_in_note || CLIENT_QUOTE_ALL_IN_NOTE})`,
      '',
    )
  }
  if (input.acceptUrl) {
    lines.push(`Review & accept: ${input.acceptUrl}`, '')
  }
  if (input.disclosureText?.trim()) {
    lines.push(input.disclosureText.trim(), '')
  }
  lines.push(
    'Included: repositioning, crew, fuel, FET, and segment fees where applicable.',
    'On acceptance: trip confirmation, ETA sheet, and live tracking link.',
    input.validityNote?.trim() ||
      'ETAs assume ready-now at quote send. Quote valid for 4 hours.',
    '',
    `Questions? 24-hr ops · ${BRAND_PHONE}`,
    input.dispatcherLine?.trim() || `OnFly Air dispatch · ${BRAND_EMAIL}`,
  )
  if (input.trackingHintUrl?.trim()) {
    lines.push('', `Once booked, watch it move live: ${input.trackingHintUrl}`)
  }
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
}

/** Branded HTML option cards — cream/client family, gold CTA, no carrier name. */
export function renderLogisticsQuoteEmailHtml(
  input: LogisticsQuoteEmailInput,
): string {
  const optionCards = input.options
    .map((opt) => renderOptionCard(opt, input.acceptUrl))
    .join('')

  const disclosure = input.disclosureText?.trim()
    ? `<p style="margin:12px 0 0;padding:8px 4px 0;border-top:1px solid #e5dfd0;font-size:9px;line-height:1.35;color:#8a8680">${escapeHtml(input.disclosureText.trim())}</p>`
    : ''

  const logoBlock = input.logoUrl?.trim()
    ? `<img src="${escapeAttr(input.logoUrl.trim())}" alt="OnFly Air" width="160" style="display:block;max-width:160px;height:auto;border:0" />`
    : `<div style="color:#c9a227;letter-spacing:0.16em;font-weight:700;font-size:13px">ONFLY AIR</div>`

  const refBadge = input.refLabel?.trim()
    ? `<div style="display:inline-block;border:1px solid #c9a227;color:#c9a227;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Quote · ${escapeHtml(input.refLabel.trim())}</div>`
    : ''

  const chips = (input.missionChips ?? [])
    .map(
      (c) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:#1a1a1c;color:#f7f2e3;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(c.label)}</span>`,
    )
    .join('')

  const intro =
    input.intro?.trim() ||
    defaultIntro(input.options.length)

  const validity =
    input.validityNote?.trim() ||
    'ETAs assume ready-now at quote send. Quote valid for 4 hours unless withdrawn sooner.'

  const dispatcher =
    input.dispatcherLine?.trim() || `OnFly Air dispatch · ${BRAND_EMAIL}`

  const track = input.trackingHintUrl?.trim()
    ? `<p style="margin:18px 0 0;text-align:center;font-size:12px;color:#6b6560">
        Once booked, watch it move live:
        <a href="${escapeAttr(input.trackingHintUrl.trim())}" style="color:#0c0c0e;font-weight:600">${escapeHtml(input.trackingHintUrl.trim())}</a>
      </p>`
    : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#ece8df;font-family:Georgia,'Times New Roman',serif;color:#0c0c0e">
  <div style="max-width:680px;margin:0 auto;padding:24px 12px">
    <div style="background:#fff;border:1px solid #e5dfd0;border-radius:12px;overflow:hidden">
      <div style="background:#0c0c0e;padding:22px 24px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle">${logoBlock}</td>
            <td style="vertical-align:middle;text-align:right">${refBadge}</td>
          </tr>
        </table>
        <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;font-weight:700;color:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:-0.02em">
          ${escapeHtml(input.originLabel)} → ${escapeHtml(input.destLabel)}
        </h1>
        ${chips ? `<div style="margin:0 0 12px">${chips}</div>` : ''}
        <p style="margin:0;font-size:13px;line-height:1.55;color:#b8b2a6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
          ${escapeHtml(intro)}
        </p>
        <p style="margin:10px 0 0;font-size:12px;color:#8a8478;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
          Operated by a vetted Part 135 carrier
        </p>
      </div>

      <div style="padding:22px 20px 8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
        ${optionCards || `<p style="margin:0;font-size:13px;color:#6b6560">Options will follow shortly.</p>`}

        <table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:8px 0 0">
          <tr>
            <td style="width:50%;vertical-align:top;background:#f7f2e3;border-radius:10px;padding:14px 14px">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0c0c0e;margin-bottom:8px">Included</div>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#4a5568">
                Repositioning, crew, fuel, FET, and segment fees where applicable — all-in client total.
              </p>
            </td>
            <td style="width:50%;vertical-align:top;background:#f7f2e3;border-radius:10px;padding:14px 14px">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0c0c0e;margin-bottom:8px">On acceptance</div>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#4a5568">
                Trip confirmation, ETA sheet, and a live tracking link for your loop.
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:14px 4px 0;font-size:11px;line-height:1.5;color:#9a948a">${escapeHtml(validity)}</p>
      </div>

      <div style="background:#0c0c0e;padding:18px 22px;margin-top:18px">
        <table style="width:100%;border-collapse:collapse;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
          <tr>
            <td style="vertical-align:top;font-size:12px;line-height:1.5;color:#f7f2e3">
              Questions or need it faster?<br/>
              <strong style="color:#c9a227">24-hr ops · ${escapeHtml(BRAND_PHONE)}</strong>
            </td>
            <td style="vertical-align:top;text-align:right;font-size:12px;line-height:1.5;color:#b8b2a6">
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
    return 'One aircraft option below, able to launch on your timeline. Price is all-in — taxes and fees included. Accept to lock it.'
  }
  return `${optionCount === 2 ? 'Two' : String(optionCount)} aircraft options below. Prices are all-in — taxes and fees included. Pick one and we lock it.`
}

function renderOptionCard(
  opt: LogisticsQuoteOptionView,
  acceptUrl?: string | null,
): string {
  const recommended = Boolean(opt.recommended)
  const border = recommended ? '#c9a227' : '#e5dfd0'
  const bg = recommended ? '#fffdf6' : '#fff'
  const badge = opt.recommended_badge
    ? `<div style="margin:-18px -18px 14px;padding:8px 14px;background:#c9a227;color:#0c0c0e;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;border-radius:10px 10px 0 0">${escapeHtml(opt.recommended_badge)}</div>`
    : ''

  const milestones =
    opt.milestones.length > 0
      ? `<table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin:0 0 12px"><tr>${opt.milestones
          .map((m) => {
            const hi = m.key === 'delivered'
            return `<td style="width:25%;vertical-align:top;background:${hi ? '#0c0c0e' : '#f3ebda'};border-radius:8px;padding:10px 8px">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${hi ? '#c9a227' : '#6b6560'}">${escapeHtml(m.label)}</div>
              <div style="margin-top:4px;font-size:15px;font-weight:700;font-family:ui-monospace,Menlo,monospace;color:${hi ? '#c9a227' : '#0c0c0e'}">${escapeHtml(m.clock)}</div>
            </td>`
          })
          .join('')}</tr></table>`
      : ''

  const acceptHref = acceptUrl?.trim()
    ? `${acceptUrl.trim()}${acceptUrl.includes('?') ? '&' : '?'}option=${encodeURIComponent(opt.offer_id)}`
    : null
  const cta = acceptHref
    ? recommended
      ? `<a href="${escapeAttr(acceptHref)}" style="display:inline-block;background:#0c0c0e;color:#c9a227;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700;font-size:13px">Accept ${escapeHtml(opt.option_number_label)}</a>`
      : `<a href="${escapeAttr(acceptHref)}" style="display:inline-block;background:#fff;color:#c9a227;border:1px solid #c9a227;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;font-size:13px">Accept ${escapeHtml(opt.option_number_label)}</a>`
    : ''

  return `<div style="margin:0 0 16px;padding:18px;border:2px solid ${border};border-radius:12px;background:${bg}">
  ${badge}
  <table style="width:100%;border-collapse:collapse;margin:0 0 14px">
    <tr>
      <td style="vertical-align:top;padding-right:12px">
        <div style="font-size:18px;font-weight:700;color:#0c0c0e">${escapeHtml(opt.option_number_label)} · ${escapeHtml(opt.aircraft_type)}</div>
        <div style="margin-top:4px;font-size:12px;color:#6b6560;line-height:1.4">${escapeHtml(opt.aircraft_blurb)}</div>
      </td>
      <td style="vertical-align:top;text-align:right;white-space:nowrap">
        <div style="font-size:28px;font-weight:700;letter-spacing:-0.02em;font-family:ui-monospace,Menlo,monospace;color:#0c0c0e">$${opt.price.toLocaleString('en-US')}</div>
        <div style="margin-top:2px;font-size:11px;color:#2e7d32;font-weight:600">${escapeHtml(opt.all_in_note || CLIENT_QUOTE_TAXES_NOTE)}</div>
      </td>
    </tr>
  </table>
  ${milestones}
  ${
    opt.delivered_summary
      ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.45;color:#4a5568">${escapeHtml(opt.delivered_summary)}</p>`
      : ''
  }
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="vertical-align:middle;font-size:12px;color:#6b6560">${escapeHtml(opt.flight_time_label)} · ${escapeHtml(opt.door_to_door_label)}</td>
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
