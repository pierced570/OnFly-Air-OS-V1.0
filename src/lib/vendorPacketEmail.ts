/**
 * Vendor packet invite — email (+ link) via EmailAdapter.
 */

import { createEmailAdapter } from '@/adapters/email'

export type VendorPacketInviteTemplate = {
  buttonText: string
  closingMessage: string
  phone: string
  packetUrl: string
}

export function defaultVendorPacketTemplate(
  overrides?: Partial<VendorPacketInviteTemplate>,
): VendorPacketInviteTemplate {
  const appUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_APP_URL as string | undefined)) ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  const envUrl = import.meta.env?.VITE_VENDOR_PACKET_URL as string | undefined

  return {
    buttonText: 'Complete W-9 & vendor packet',
    closingMessage:
      'Please complete our short W-9 and banking packet so we can set you up for payment — legal name, TIN, remit address, and ACH details.',
    phone: '(858) 529-7860',
    packetUrl:
      envUrl?.trim() ||
      (appUrl ? `${appUrl.replace(/\/$/, '')}/vendor` : '/vendor'),
    ...overrides,
  }
}

export function renderVendorPacketEmailHtml(
  tpl: VendorPacketInviteTemplate,
  companyName?: string,
): string {
  const greeting = companyName?.trim()
    ? `Hi ${escapeHtml(companyName.trim())} team,`
    : 'Hi,'
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f0e8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e8;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5dfd0">
        <tr><td style="background:#0c0c0e;padding:22px 24px;text-align:center">
          <div style="font-size:20px;letter-spacing:0.14em;color:#c9a227;font-weight:700">ONFLY AIR</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0c0c0e;font-weight:600">W-9 &amp; vendor packet</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2a2a2e">${greeting}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#2a2a2e">
            ${escapeHtml(tpl.closingMessage)}
          </p>
          <p style="margin:0 0 28px;text-align:center">
            <a href="${escapeHtml(tpl.packetUrl)}" style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">${escapeHtml(tpl.buttonText)}</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b6560">
            Or open: <a href="${escapeHtml(tpl.packetUrl)}" style="color:#8a7018">${escapeHtml(tpl.packetUrl)}</a>
          </p>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b6560">
            Questions? Reply or call ${escapeHtml(tpl.phone)}.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #e5dfd0">
          <p style="margin:0;font-size:11px;color:#9a948a">OnFly Air — on-demand, time-critical air freight. For payees we remit to only.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function renderVendorPacketEmailText(
  tpl: VendorPacketInviteTemplate,
  companyName?: string,
): string {
  const greeting = companyName?.trim()
    ? `Hi ${companyName.trim()} team,`
    : 'Hi,'
  return [
    greeting,
    '',
    tpl.closingMessage,
    '',
    `${tpl.buttonText}: ${tpl.packetUrl}`,
    '',
    `Questions? Reply or call ${tpl.phone}.`,
    '',
    '— OnFly Air',
  ].join('\n')
}

export async function sendVendorPacketInvite(opts: {
  to: string
  companyName?: string
  template?: VendorPacketInviteTemplate
}): Promise<{ to: string; id: string }> {
  const to = opts.to.trim().toLowerCase()
  if (!to.includes('@')) throw new Error('Valid email required')
  const tpl = opts.template ?? defaultVendorPacketTemplate()
  const subject = opts.companyName?.trim()
    ? `OnFly Air W-9 / vendor packet — ${opts.companyName.trim()}`
    : 'OnFly Air W-9 & vendor packet'
  const email = createEmailAdapter()
  const result = await email.send({
    to,
    subject,
    html: renderVendorPacketEmailHtml(tpl, opts.companyName),
    text: renderVendorPacketEmailText(tpl, opts.companyName),
  })
  return { to, id: result.id }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
