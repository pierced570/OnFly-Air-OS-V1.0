/**
 * Branded invoice payment-request email HTML — QBO PDF attached separately.
 * Matches live OFA / Intuit-style layout: dark gold header, amount, ACH,
 * trip card, optional contract link, summary table.
 * Pure TS (no React / adapters).
 */

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
 * Client-facing payment-request subject — always includes real PO when known.
 * Matches the QBO-style line ops expect: "… - PO #00346".
 */
export function invoiceEmailSubject(po?: string | null): string {
  const base = 'New payment request from OnFly Air LLC'
  const display = invoicePoDisplay(po)
  if (!display || isInvoicePoPlaceholder(display)) return base
  return `${base} - PO #${display}`
}

/** @deprecated Prefer invoiceEmailSubject */
export const INVOICE_EMAIL_SUBJECT = (po?: string) => invoiceEmailSubject(po)

export type InvoiceEmailItineraryLine = string

export type InvoiceEmailTemplate = {
  poNumber: string
  clientName?: string | null
  lane?: string | null
  /** Absolute URL to full wordmark for dark header. */
  logoUrl?: string | null
  supportEmail?: string
  /** Client-facing total (USD). */
  amountUsd?: number | null
  flightDate?: string | null
  aircraftType?: string | null
  tail?: string | null
  /** Trip itinerary lines under the trip card. */
  itineraryLines?: InvoiceEmailItineraryLine[] | null
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
  const poDisplay = escapeHtml(invoicePoDisplay(tpl.poNumber) || 'Invoice')
  const client = tpl.clientName?.trim()
  const lane = tpl.lane?.trim() || ''
  const support = escapeHtml(tpl.supportEmail?.trim() || 'info@onflyair.com')
  const logo = tpl.logoUrl?.trim()
  const logoBlock = logo
    ? `<img src="${escapeAttr(logo)}" alt="OnFly Air" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0" />`
    : `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:20px;line-height:1.1;font-weight:700;letter-spacing:0.14em;color:#c9a227">ONFLY AIR</div>`

  const headlineBits = [client, lane].filter(Boolean).join(' · ')
  const amount =
    tpl.amountUsd != null && Number.isFinite(tpl.amountUsd)
      ? formatInvoiceUsd(tpl.amountUsd)
      : null
  const payUrl = tpl.payUrl?.trim()
  const contractUrl = tpl.contractUrl?.trim()
  const tail = tpl.tail?.trim().toUpperCase() || null
  const aircraft = tpl.aircraftType?.trim() || null
  const flightDate = tpl.flightDate?.trim() || null
  const itinerary = (tpl.itineraryLines ?? [])
    .map((l) => l.trim())
    .filter(Boolean)

  const achButton = payUrl
    ? `<a href="${escapeAttr(payUrl)}" style="display:inline-block;padding:8px 14px;border:1px solid #cfcfcf;border-radius:6px;background:#ffffff;color:#0c0c0e;text-decoration:none;font-size:13px;font-weight:600">ACH</a>`
    : `<span style="display:inline-block;padding:8px 14px;border:1px solid #cfcfcf;border-radius:6px;background:#ffffff;color:#0c0c0e;font-size:13px;font-weight:600">ACH</span>`

  const itineraryHtml = itinerary.length
    ? itinerary
        .map(
          (line) =>
            `<div style="margin:0 0 4px;color:#0c0c0e;font-size:14px;line-height:1.45">${escapeHtml(line)}</div>`,
        )
        .join('')
    : lane
      ? `<div style="margin:0 0 4px;color:#0c0c0e;font-size:14px;line-height:1.45">${escapeHtml(lane)}</div>`
      : ''

  const summaryRows: Array<[string, string]> = [
    flightDate ? (['Date', flightDate] as [string, string]) : null,
    lane ? (['Route', lane] as [string, string]) : null,
    aircraft || tail
      ? ([
          'Aircraft',
          [aircraft, tail ? `(${tail})` : null].filter(Boolean).join(' '),
        ] as [string, string])
      : null,
    poDisplay ? (['PO #', poDisplay] as [string, string]) : null,
  ].filter(Boolean) as Array<[string, string]>

  const summaryHtml = summaryRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse">
        ${summaryRows
          .map(
            ([label, value], i) => `
          <tr>
            <td style="padding:10px 0;border-top:1px solid ${i === 0 ? '#e5e5e5' : '#ececec'};color:#6b6560;font-size:14px;width:40%">${escapeHtml(label)}</td>
            <td style="padding:10px 0;border-top:1px solid ${i === 0 ? '#e5e5e5' : '#ececec'};color:#0c0c0e;font-size:14px;text-align:right;font-weight:600">${escapeHtml(value)}</td>
          </tr>`,
          )
          .join('')}
        <tr><td colspan="2" style="border-top:1px solid #e5e5e5;padding:0;height:1px;font-size:0;line-height:0">&nbsp;</td></tr>
      </table>`
    : ''

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:0">
    <tr>
      <td style="background:#0c0c0e;padding:28px 24px;text-align:center">
        ${logoBlock}
      </td>
    </tr>
    <tr><td align="center" style="padding:28px 16px 8px">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
        <tr>
          <td style="padding:8px 28px 28px;background:#ffffff">
            <h1 style="font-size:22px;margin:0 0 10px;color:#2a2a2e;font-weight:700;line-height:1.3">New payment request from OnFly Air LLC</h1>
            ${
              headlineBits
                ? `<p style="margin:0 0 4px;font-size:14px;color:#6b6560;line-height:1.5">${escapeHtml(headlineBits)}</p>`
                : ''
            }
            <p style="margin:0 0 16px;font-size:14px;color:#6b6560;line-height:1.5">PO #${poDisplay}</p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.5">
              <a href="${payUrl ? escapeAttr(payUrl) : '#'}" style="color:#1a56db;font-weight:700;text-decoration:underline">Open the attached PDF invoice to access your payment options.</a>
            </p>
            ${
              amount
                ? `<div style="font-size:34px;font-weight:700;color:#0c0c0e;margin:0 0 18px;line-height:1.1">${escapeHtml(amount)}</div>`
                : ''
            }
            <div style="margin:0 0 8px;font-size:13px;color:#6b6560">Online payment options:</div>
            <div style="margin:0 0 24px">${achButton}</div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f4;border-radius:10px;margin:0 0 22px">
              <tr><td style="padding:18px 18px 16px">
                ${
                  tail
                    ? `<div style="font-size:12px;color:#6b6560;margin:0 0 4px">Tail Number</div>
                <div style="font-size:22px;font-weight:700;color:#0c0c0e;margin:0 0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${escapeHtml(tail)}</div>`
                    : ''
                }
                <div style="font-size:12px;color:#6b6560;margin:0 0 8px">Trip Itinerary</div>
                ${itineraryHtml}
              </td></tr>
            </table>

            ${
              contractUrl
                ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0c0c0e">Please sign charter contract linked below:</p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.5;word-break:break-all">
              <a href="${escapeAttr(contractUrl)}" style="color:#1a56db;text-decoration:underline">${escapeHtml(contractUrl)}</a>
            </p>`
                : ''
            }

            ${summaryHtml}
          </td>
        </tr>
      </table>
    </td></tr>
    <tr>
      <td align="center" style="padding:20px 16px 32px;background:#ececee">
        <p style="margin:0 0 6px;font-size:13px;color:#6b6560">OnFly Air LLC — Charter Brokerage</p>
        <p style="margin:0;font-size:13px;color:#6b6560">
          For questions, reply to this email or contact
          <a href="mailto:${support}" style="color:#1a56db;text-decoration:underline">${support}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderInvoiceEmailText(tpl: InvoiceEmailTemplate): string {
  const poDisplay = invoicePoDisplay(tpl.poNumber) || 'Invoice'
  const client = tpl.clientName?.trim()
  const lane = tpl.lane?.trim()
  const support = tpl.supportEmail?.trim() || 'info@onflyair.com'
  const amount =
    tpl.amountUsd != null && Number.isFinite(tpl.amountUsd)
      ? formatInvoiceUsd(tpl.amountUsd)
      : null
  const lines = [
    'New payment request from OnFly Air LLC',
    '',
    [client, lane].filter(Boolean).join(' · '),
    `PO #${poDisplay}`,
    '',
    'Open the attached PDF invoice to access your payment options.',
    amount ? amount : null,
    '',
    'Online payment options: ACH',
    tpl.tail?.trim() ? `Tail Number: ${tpl.tail.trim().toUpperCase()}` : null,
    'Trip Itinerary:',
    ...(tpl.itineraryLines?.filter(Boolean) ?? (lane ? [lane] : [])),
    tpl.contractUrl?.trim()
      ? `\nPlease sign charter contract:\n${tpl.contractUrl.trim()}`
      : null,
    '',
    `Questions? Reply to this email or contact ${support}.`,
  ]
  return lines.filter((l) => l != null && l !== '').join('\n')
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
