/**
 * Client hard-quote email — aircraft, times, ETAs, price.
 * Pure TS. Never includes operator name, cost, or margin.
 * Ground / forklift / courier legs can extend options later via the same view model.
 */

import type { LogisticsQuoteOptionView } from '@/domain/clientLogisticsQuote'
import { logisticsQuoteTitle } from '@/domain/clientLogisticsQuote'

export type HardQuoteEmailInput = {
  /** e.g. Logistics Quote Request (Akron, OH (KCAK) → White Plains, NY (KHPN)) */
  title: string
  options: LogisticsQuoteOptionView[]
  acceptUrl?: string | null
  /** Absolute URL to ONFLYAIR wordmark for email header */
  logoUrl?: string | null
}

export function hardQuoteEmailSubject(title: string): string {
  return `OnFly Air — ${title}`
}

export function hardQuoteEmailSubjectFromLane(lane: string): string {
  return hardQuoteEmailSubject(logisticsQuoteTitle(lane))
}

export function renderHardQuoteEmailText(input: HardQuoteEmailInput): string {
  const blocks = input.options.map((opt) =>
    [
      `${opt.label}: ${opt.aircraft_type}`,
      `Time to be in (${opt.departure_label}) from Go: ${opt.position_eta.duration}`,
      opt.position_eta.clock ? `  ETA ${opt.position_eta.clock}` : null,
      `Estimated loading and turn around time: ${opt.etd.duration}`,
      opt.etd.clock ? `  ETD ${opt.etd.clock}` : null,
      `Live leg time (${opt.departure_label} to ${opt.destination_label}): ${opt.arrival_eta.duration}`,
      opt.arrival_eta.clock ? `  ETA ${opt.arrival_eta.clock}` : null,
      `Price: $${opt.price.toFixed(0)} (${opt.taxes_fees_note})`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const lines = [
    `OnFly Air — ${input.title}`,
    'Operated by a vetted Part 135 carrier',
    '',
    ...blocks.flatMap((b, i) => (i === 0 ? [b] : ['', b])),
  ]
  if (input.acceptUrl) {
    lines.push('', `Accept / Deny / Change request: ${input.acceptUrl}`)
  }
  lines.push(
    '',
    'Questions? Reply to this email or call dispatch 858-529-7860.',
  )
  return lines.join('\n')
}

/** Branded HTML: logo header, aircraft + times + ETAs + price per option. */
export function renderHardQuoteEmailHtml(input: HardQuoteEmailInput): string {
  const logoBlock = input.logoUrl?.trim()
    ? `<img src="${escapeAttr(input.logoUrl.trim())}" alt="OnFly Air" width="220" style="display:block;margin:0 auto;max-width:220px;height:auto;border:0" />`
    : `<div style="color:#c9a227;letter-spacing:0.14em;font-weight:700;font-size:12px">ONFLY AIR</div>`

  const optionBlocks = input.options
    .map((opt) => {
      const rows = [
        clockRow(
          `Time to be in (${opt.departure_label}) from Go`,
          opt.position_eta.duration,
          opt.position_eta.clock ? `ETA ${opt.position_eta.clock}` : null,
        ),
        clockRow(
          'Estimated loading and turn around time',
          opt.etd.duration,
          opt.etd.clock ? `ETD ${opt.etd.clock}` : null,
        ),
        clockRow(
          `Live leg time (${opt.departure_label} to ${opt.destination_label})`,
          opt.arrival_eta.duration,
          [
            opt.etd.clock ? `ETD ${opt.etd.clock}` : null,
            opt.arrival_eta.clock ? `ETA ${opt.arrival_eta.clock}` : null,
          ]
            .filter(Boolean)
            .join('<br/>') || null,
        ),
      ].join('')

      return `
      <div style="margin:0 0 20px;padding:18px 16px;border:1px solid #e5dfd0;border-radius:8px;background:#faf8f2">
        <div style="font-size:17px;font-weight:600;color:#0c0c0e;margin:0 0 12px">
          ${escapeHtml(opt.label)}: ${escapeHtml(opt.aircraft_type)}
        </div>
        ${rows}
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e5dfd0">
          <div style="font-size:12px;color:#6b6560;margin:0 0 4px">Price</div>
          <div style="font-family:ui-monospace,monospace;font-size:28px;font-weight:600;color:#0c0c0e">
            $${opt.price.toFixed(0)}
          </div>
          <div style="font-size:12px;color:#6b6560;margin-top:4px">${escapeHtml(opt.taxes_fees_note)}</div>
        </div>
      </div>`
    })
    .join('')

  const acceptBlock = input.acceptUrl
    ? `<p style="margin:8px 0 0 0">
        <a href="${escapeAttr(input.acceptUrl)}"
           style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;font-size:14px">
          Review — Accept / Deny / Change request
        </a>
      </p>
      <p style="margin:8px 0 0 0;font-size:12px;color:#6b6560">${escapeHtml(input.acceptUrl)}</p>`
    : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0c0c0e">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border:1px solid #e5dfd0;border-radius:8px;overflow:hidden">
      <div style="background:#0c0c0e;padding:20px;text-align:center">
        ${logoBlock}
      </div>
      <div style="padding:24px">
        <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3">${escapeHtml(input.title)}</h1>
        <p style="margin:0 0 20px;font-size:13px;color:#6b6560">
          Operated by a vetted Part 135 carrier
        </p>
        ${optionBlocks}
        ${acceptBlock}
        <p style="margin:24px 0 0;font-size:12px;color:#9a948a;line-height:1.5">
          Times are estimated from Go and may shift. Local times use the stop airport zone; Zulu shown for ops coordination.
          Questions? Reply or call 24/7 dispatch 858-529-7860.
        </p>
      </div>
    </div>
  </div>
</body></html>`
}

function clockRow(
  label: string,
  duration: string,
  clockHtml: string | null,
): string {
  return `
    <div style="margin:0 0 12px">
      <div style="font-size:12px;color:#6b6560;margin:0 0 2px">${escapeHtml(label)}</div>
      <div style="font-family:ui-monospace,monospace;font-size:15px;font-weight:600;color:#0c0c0e">${escapeHtml(duration)}</div>
      ${
        clockHtml
          ? `<div style="font-family:ui-monospace,monospace;font-size:12px;color:#6b6560;margin-top:2px">${clockHtml}</div>`
          : ''
      }
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
