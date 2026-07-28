/**
 * Client-facing multi-option logistics / charter quote email.
 * Pure TS — no operator names, tails, costs, or margins.
 */

import type { LogisticsQuoteOptionView } from '@/domain/clientLogisticsQuote'
import { CLIENT_QUOTE_TAXES_NOTE } from '@/domain/clientLogisticsQuote'

export type LogisticsQuoteEmailInput = {
  /** Page title e.g. Charter Quote / Logistics Quote Request */
  title: string
  originLabel: string
  destLabel: string
  options: LogisticsQuoteOptionView[]
  acceptUrl?: string | null
  logoUrl?: string | null
  disclosureText?: string | null
  /** Optional trip / request ref for subject */
  refLabel?: string | null
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
    'Operated by a vetted Part 135 carrier',
    '',
    'Aircraft Options',
    '',
  ]
  for (const opt of input.options) {
    lines.push(
      `${opt.label}: ${opt.aircraft_type}`,
      `Aircraft ready for pickup at ${opt.departure_label}: ${opt.position_eta.duration}${
        opt.position_eta.clock ? ` · ETA ${opt.position_eta.clock}` : ''
      }`,
      `Leg: ${opt.departure_label} → ${opt.destination_label}: ${opt.arrival_eta.duration}`,
      `Loading / turn around: ${opt.etd.duration}${
        opt.etd.clock ? ` · ETD ${opt.etd.clock}` : ''
      }`,
      opt.arrival_eta.clock
        ? `Est. arrival ~ ${opt.arrival_eta.clock}`
        : '',
      `Price: $${opt.price.toLocaleString('en-US')} (${opt.taxes_fees_note || CLIENT_QUOTE_TAXES_NOTE})`,
      '',
    )
  }
  if (input.acceptUrl) {
    lines.push(`Review & accept: ${input.acceptUrl}`, '')
  }
  if (input.disclosureText?.trim()) {
    lines.push('Part 295.24 disclosure:', input.disclosureText.trim(), '')
  }
  lines.push(
    'Times are estimated and may shift.',
    'Questions? Reply to this email or call dispatch 858-529-7860.',
  )
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
}

/** Branded HTML option cards — cream/client family, gold CTA, no carrier name. */
export function renderLogisticsQuoteEmailHtml(
  input: LogisticsQuoteEmailInput,
): string {
  const optionCards = input.options
    .map((opt, i) => renderOptionCard(opt, i + 1))
    .join('')

  const acceptBlock = input.acceptUrl
    ? `<p style="margin:28px 0 0 0;text-align:center">
        <a href="${escapeAttr(input.acceptUrl)}"
           style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px">
          Review &amp; Accept Quote
        </a>
      </p>
      <p style="margin:10px 0 0 0;text-align:center;font-size:12px;color:#6b6560">${escapeHtml(input.acceptUrl)}</p>`
    : ''

  const disclosure = input.disclosureText?.trim()
    ? `<div style="margin-top:24px;padding:14px 16px;border:1px solid #e5dfd0;border-radius:8px;background:#fff">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px">Part 295.24 disclosure</div>
        <p style="margin:0;font-size:12px;color:#6b6560;line-height:1.5">${escapeHtml(input.disclosureText.trim())}</p>
      </div>`
    : ''

  const logoBlock = input.logoUrl?.trim()
    ? `<img src="${escapeAttr(input.logoUrl.trim())}" alt="OnFly Air" width="220" style="display:block;margin:0 auto;max-width:220px;height:auto;border:0" />`
    : `<div style="color:#c9a227;letter-spacing:0.14em;font-weight:700;font-size:12px">ONFLY AIR</div>`

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#ece8df;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0c0c0e">
  <div style="max-width:640px;margin:0 auto;padding:28px 16px">
    <div style="background:#fff;border:1px solid #e5dfd0;border-radius:10px;overflow:hidden">
      <div style="background:#0c0c0e;padding:22px;text-align:center">
        ${logoBlock}
      </div>
      <div style="padding:28px 24px 32px">
        <h1 style="margin:0 0 6px;font-size:26px;font-weight:700;letter-spacing:-0.02em">${escapeHtml(input.title)}</h1>
        <p style="margin:0 0 4px;font-size:15px;color:#6b6560;font-weight:500">
          ${escapeHtml(input.originLabel)} → ${escapeHtml(input.destLabel)}
        </p>
        <p style="margin:0 0 22px;font-size:13px;color:#9a948a">
          Operated by a vetted Part 135 carrier
        </p>

        <h2 style="margin:0 0 14px;font-size:16px;font-weight:700">Aircraft Options</h2>
        ${optionCards || `<p style="margin:0;font-size:13px;color:#6b6560">Options will follow shortly.</p>`}
        ${acceptBlock}
        ${disclosure}
        <p style="margin:24px 0 0;font-size:12px;color:#9a948a;line-height:1.5">
          Times are estimated and may shift. Local times use the stop airport zone; Zulu shown for ops coordination.
          Questions? Reply or call 24/7 dispatch 858-529-7860.
        </p>
      </div>
    </div>
  </div>
</body></html>`
}

function renderOptionCard(opt: LogisticsQuoteOptionView, n: number): string {
  const optionWord = opt.label?.trim() || `Option ${n}`
  const readyValue = opt.position_eta.clock
    ? `${escapeHtml(opt.position_eta.duration)} · ETA ${escapeHtml(opt.position_eta.clock)}`
    : escapeHtml(opt.position_eta.duration)
  const turnValue = opt.etd.clock
    ? `${escapeHtml(opt.etd.duration)} · ETD ${escapeHtml(opt.etd.clock)}`
    : escapeHtml(opt.etd.duration)
  const liveValue = escapeHtml(opt.arrival_eta.duration)
  const etaBits: string[] = []
  if (opt.etd.clock) {
    etaBits.push(
      `<div style="margin:0 0 4px;font-size:13px;color:#4a5568">Est. departure ~ ${escapeHtml(opt.etd.clock)}</div>`,
    )
  }
  if (opt.arrival_eta.clock) {
    etaBits.push(
      `<div style="margin:0;font-size:13px;color:#4a5568">Est. arrival ~ ${escapeHtml(opt.arrival_eta.clock)}</div>`,
    )
  }

  return `<div style="margin:0 0 16px;padding:18px 18px 16px;border:1px solid #e5dfd0;border-radius:10px;background:#faf8f4">
  <div style="margin:0 0 14px;font-size:17px;font-weight:700">
    <span style="background:#f5e6a8;padding:2px 6px;border-radius:3px">${escapeHtml(optionWord)}:</span>
    ${escapeHtml(opt.aircraft_type)}
  </div>
  <table style="width:100%;border-collapse:collapse;margin:0 0 12px">
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#6b6560;vertical-align:top">Aircraft ready for pickup at ${escapeHtml(opt.departure_label)}</td>
      <td style="padding:7px 0;font-size:13px;font-weight:700;text-align:right;vertical-align:top;font-family:ui-monospace,monospace">${readyValue}</td>
    </tr>
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#6b6560;vertical-align:top">Leg: ${escapeHtml(opt.departure_label)} → ${escapeHtml(opt.destination_label)}</td>
      <td style="padding:7px 0;font-size:13px;font-weight:700;text-align:right;vertical-align:top;font-family:ui-monospace,monospace">${liveValue}</td>
    </tr>
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#6b6560;vertical-align:top">Loading / turn around</td>
      <td style="padding:7px 0;font-size:13px;font-weight:700;text-align:right;vertical-align:top;font-family:ui-monospace,monospace">${turnValue}</td>
    </tr>
  </table>
  ${etaBits.length ? `<div style="margin:0 0 14px">${etaBits.join('')}</div>` : ''}
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5dfd0;padding-top:10px">
    <tr>
      <td style="padding:12px 0 0;font-size:13px;color:#9a948a;vertical-align:bottom">Price</td>
      <td style="padding:12px 0 0;text-align:right;vertical-align:bottom">
        <div style="font-size:28px;font-weight:700;letter-spacing:-0.02em;font-family:ui-monospace,monospace">$${opt.price.toLocaleString('en-US')}</div>
        <div style="margin-top:2px;font-size:11px;color:#9a948a;font-style:italic">${escapeHtml(opt.taxes_fees_note || CLIENT_QUOTE_TAXES_NOTE)}</div>
      </td>
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
