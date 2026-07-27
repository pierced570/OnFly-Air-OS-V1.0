/**
 * Client-facing estimated quote email — totals + ETA sheet.
 * Pure TS. Never includes operator name, cost, or margin.
 */

import type { ChainLeg } from '@/domain/etaChain'
import { formatStopLocal } from '@/domain/timeFmt'

export type QuoteEmailTaxLine = {
  code: string
  amount: number
  note?: string
}

export type QuoteEmailInput = {
  originLabel: string
  destLabel: string
  total: number
  airSubtotal: number
  taxLines: QuoteEmailTaxLine[]
  chain: ChainLeg[]
  /** Optional accept / follow-up URL */
  acceptUrl?: string | null
  /** Request / trip ref for subject */
  refLabel?: string | null
  /** Estimated vs hard */
  kind?: 'estimated' | 'hard'
  /** Absolute URL to full ONFLYAIR wordmark for email header */
  logoUrl?: string | null
}

export type QuoteEmailEtaRow = {
  seq: number
  label: string
  startLocal: string
  endLocal: string
  endZulu: string
  fromIcao: string
  toIcao: string
}

/** Format domain ETA chain for client docs (stop-local + Zulu). */
export function etaRowsFromChain(chain: ChainLeg[]): QuoteEmailEtaRow[] {
  return chain.map((leg) => {
    const start = formatStopLocal(leg.est_start, leg.from.tz ?? 'UTC')
    const end = formatStopLocal(leg.est_end, leg.to.tz ?? 'UTC')
    return {
      seq: leg.seq,
      label: leg.label,
      startLocal: start.local,
      endLocal: end.local,
      endZulu: end.zulu,
      fromIcao: (leg.from.icao ?? '').toUpperCase(),
      toIcao: (leg.to.icao ?? '').toUpperCase(),
    }
  })
}

export function quoteEmailSubject(input: QuoteEmailInput): string {
  const lane = `${input.originLabel} → ${input.destLabel}`
  const ref = input.refLabel?.trim() ? ` · ${input.refLabel.trim()}` : ''
  if (input.kind === 'hard') {
    return `OnFly Air — Logistics Quote Request (${lane})${ref}`
  }
  return `OnFly Air — Estimated quote${ref} · ${lane}`
}

export function renderQuoteEmailText(input: QuoteEmailInput): string {
  const rows = etaRowsFromChain(input.chain)
  const title =
    input.kind === 'hard'
      ? `Logistics Quote Request (${input.originLabel} → ${input.destLabel})`
      : `Estimated quote · ${input.originLabel} → ${input.destLabel}`
  const lines = [
    `OnFly Air — ${title}`,
    'Operated by a vetted Part 135 carrier',
    `Price: $${input.total.toFixed(2)}`,
    'All taxes and fees included',
    '',
    'Estimated timeline:',
    ...rows.map(
      (r) =>
        `${r.seq}. ${r.label}: ${r.startLocal} → ${r.endLocal} (${r.endZulu})`,
    ),
  ]
  if (input.acceptUrl) {
    lines.push('', `Accept / Deny / Change request: ${input.acceptUrl}`)
  }
  lines.push('', 'Questions? Reply to this email or call dispatch 858-529-7860.')
  return lines.join('\n')
}

/** Branded HTML: cream/client family, ETA table, no carrier name. */
export function renderQuoteEmailHtml(input: QuoteEmailInput): string {
  const rows = etaRowsFromChain(input.chain)
  const kind =
    input.kind === 'hard'
      ? `Logistics Quote Request (${input.originLabel} → ${input.destLabel})`
      : 'Estimated quote'
  const taxRows = input.taxLines
    .filter((t) => t.amount > 0)
    .map(
      (t) => `
      <tr>
        <td style="padding:6px 0;color:#6b6560;font-size:13px">${escapeHtml(t.code)}${
          t.note ? ` <span style="color:#9a948a">(${escapeHtml(t.note)})</span>` : ''
        }</td>
        <td style="padding:6px 0;text-align:right;font-family:ui-monospace,monospace;font-size:13px">$${t.amount.toFixed(2)}</td>
      </tr>`,
    )
    .join('')

  const etaRows = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5dfd0;font-weight:600;font-size:13px">${escapeHtml(r.label)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5dfd0;font-family:ui-monospace,monospace;font-size:12px;color:#6b6560">${escapeHtml(r.fromIcao || '—')} → ${escapeHtml(r.toIcao || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5dfd0;font-family:ui-monospace,monospace;font-size:12px">${escapeHtml(r.startLocal)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5dfd0;font-family:ui-monospace,monospace;font-size:12px">${escapeHtml(r.endLocal)} <span style="color:#9a948a">(${escapeHtml(r.endZulu)})</span></td>
      </tr>`,
    )
    .join('')

  const acceptBlock = input.acceptUrl
    ? `<p style="margin:20px 0 0 0">
        <a href="${escapeAttr(input.acceptUrl)}"
           style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;font-size:14px">
          Review — Accept / Deny / Change request
        </a>
      </p>
      <p style="margin:8px 0 0 0;font-size:12px;color:#6b6560">${escapeHtml(input.acceptUrl)}</p>`
    : ''

  const logoBlock = input.logoUrl?.trim()
    ? `<img src="${escapeAttr(input.logoUrl.trim())}" alt="OnFly Air" width="220" style="display:block;margin:0 auto;max-width:220px;height:auto;border:0" />`
    : `<div style="color:#c9a227;letter-spacing:0.14em;font-weight:700;font-size:12px">ONFLY AIR</div>`

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0c0c0e">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border:1px solid #e5dfd0;border-radius:8px;overflow:hidden">
      <div style="background:#0c0c0e;padding:20px;text-align:center">
        ${logoBlock}
      </div>
      <div style="padding:24px">
        <h1 style="margin:0 0 6px;font-size:22px">${escapeHtml(kind)}</h1>
        ${
          input.kind === 'hard'
            ? ''
            : `<p style="margin:0 0 4px;font-size:15px">
          ${escapeHtml(input.originLabel)} → ${escapeHtml(input.destLabel)}
        </p>`
        }
        <p style="margin:0 0 16px;font-size:13px;color:#6b6560">
          Operated by a vetted Part 135 carrier
        </p>
        <p style="margin:0 0 4px;font-family:ui-monospace,monospace;font-size:28px;font-weight:600">
          $${input.total.toFixed(2)}
        </p>
        <p style="margin:0 0 20px;font-size:12px;color:#6b6560">
          All taxes and fees included
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
          <tr>
            <td style="padding:6px 0;color:#6b6560;font-size:13px">Air transportation</td>
            <td style="padding:6px 0;text-align:right;font-family:ui-monospace,monospace;font-size:13px">$${input.airSubtotal.toFixed(2)}</td>
          </tr>
          ${taxRows}
          <tr>
            <td style="padding:10px 0 0;border-top:1px solid #e5dfd0;font-weight:600">Total</td>
            <td style="padding:10px 0 0;border-top:1px solid #e5dfd0;text-align:right;font-family:ui-monospace,monospace;font-weight:600">$${input.total.toFixed(2)}</td>
          </tr>
        </table>
        <h2 style="margin:28px 0 10px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6560">
          Estimated timeline
        </h2>
        ${
          rows.length
            ? `<table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5dfd0;font-size:11px;color:#6b6560;text-transform:uppercase">Leg</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5dfd0;font-size:11px;color:#6b6560;text-transform:uppercase">Route</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5dfd0;font-size:11px;color:#6b6560;text-transform:uppercase">Start (local)</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5dfd0;font-size:11px;color:#6b6560;text-transform:uppercase">End (local / Z)</th>
            </tr>
          </thead>
          <tbody>${etaRows}</tbody>
        </table>`
            : `<p style="margin:0;font-size:13px;color:#6b6560">Timeline will follow once routing is locked.</p>`
        }
        ${acceptBlock}
        <p style="margin:24px 0 0;font-size:12px;color:#9a948a;line-height:1.5">
          Times are estimated and may shift. Local times use the stop airport zone; Zulu shown for ops coordination.
          Questions? Reply or call 24/7 dispatch 858-529-7860.
        </p>
      </div>
    </div>
  </div>
</body></html>`
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
