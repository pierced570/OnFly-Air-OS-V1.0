/**
 * Branded invoice email HTML — QB PDF attached separately.
 * Matches desk invoice mail: cream canvas, black header + logo, white body.
 * Pure TS (no React / adapters).
 */

export const INVOICE_EMAIL_SUBJECT = (po: string) =>
  `Invoice #${po.trim() || 'Invoice'} - OnFly Air`

export type InvoiceEmailTemplate = {
  poNumber: string
  clientName?: string | null
  /** Absolute URL to full wordmark for dark header. */
  logoUrl?: string | null
  supportEmail?: string
}

export function renderInvoiceEmailHtml(tpl: InvoiceEmailTemplate): string {
  const po = escapeHtml(tpl.poNumber.trim() || 'Invoice')
  const client = tpl.clientName?.trim()
  const support = escapeHtml(tpl.supportEmail?.trim() || 'info@onflyair.com')
  const logo = tpl.logoUrl?.trim()
  const logoBlock = logo
    ? `<img src="${escapeAttr(logo)}" alt="OnFly Air" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0" />`
    : `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:20px;line-height:1.1;font-weight:700;letter-spacing:0.14em;color:#c9a227">ONFLY AIR</div>`

  const greet = client
    ? `Hi ${escapeHtml(client)},`
    : 'Hello,'

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e3;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5dfd0;border-radius:8px;overflow:hidden">
        <tr>
          <td style="background:#0c0c0e;padding:22px 24px;text-align:center">
            ${logoBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:24px;background:#ffffff">
            <h1 style="font-size:20px;margin:0 0 12px;color:#0c0c0e;font-weight:700">Invoice #${po}</h1>
            <p style="margin:0 0 12px;line-height:1.5;color:#2a2a2e">
              ${greet}
              please find your OnFly Air invoice attached as a PDF.
            </p>
            <p style="margin:0;font-size:14px;color:#6b6560;line-height:1.5">
              Questions? Reply to this email or contact accounts at
              <a href="mailto:${support}" style="color:#1a56db;text-decoration:underline">${support}</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function renderInvoiceEmailText(tpl: InvoiceEmailTemplate): string {
  const po = tpl.poNumber.trim() || 'Invoice'
  const client = tpl.clientName?.trim()
  const support = tpl.supportEmail?.trim() || 'info@onflyair.com'
  const greet = client ? `Hi ${client},` : 'Hello,'
  return [
    `Invoice #${po} - OnFly Air`,
    '',
    greet,
    'please find your OnFly Air invoice attached as a PDF.',
    '',
    `Questions? Reply to this email or contact accounts at ${support}.`,
  ].join('\n')
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
