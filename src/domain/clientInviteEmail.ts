/**
 * Client setup invite email — welcome + /client form link.
 * Pure TypeScript (no React / adapters). Cream client family branding.
 */

export const BRAND_TAGLINE = 'ASAP AIRCRAFT SOLUTIONS AND LOGISTICS'
export const BRAND_PHONE = '(858) 529-7860'
export const BRAND_EMAIL = 'info@onflyair.com'
export const BRAND_MARK_PATH = '/brand/onfly-mark.svg'

export type ClientInviteTemplate = {
  recipientName?: string
  companyName?: string
  buttonText: string
  onboardUrl: string
  /** Absolute URL to brand mark (email clients need a full URL). */
  logoUrl: string
  phone: string
  supportEmail: string
  tagline: string
  /** Thank-you / value prop under the greeting */
  intro: string
  /** After CTA — portal / tracking benefits */
  closingMessage: string
}

export function defaultClientInviteTemplate(
  overrides?: Partial<ClientInviteTemplate>,
): ClientInviteTemplate {
  return {
    buttonText: 'Complete your client setup',
    onboardUrl: '/client',
    logoUrl: '',
    phone: BRAND_PHONE,
    supportEmail: BRAND_EMAIL,
    tagline: BRAND_TAGLINE,
    intro:
      "Thank you for choosing OnFly Air. When freight can't wait, we arrange the aircraft — a vetted Part 135 carrier network, pilot-led dispatch, and ETAs you can hold us to.",
    closingMessage:
      'Once your profile is in, your team can request trips from the portal, follow live status on every shipment, and receive delivery confirmations automatically.',
    ...overrides,
  }
}

export function clientInviteEmailSubject(opts: {
  companyName?: string
}): string {
  const company = opts.companyName?.trim()
  return company
    ? `Welcome to OnFly Air — complete your setup (${company})`
    : 'Welcome to OnFly Air — complete your client setup'
}

export function renderClientInviteEmailText(tpl: ClientInviteTemplate): string {
  const greet = tpl.recipientName?.trim()
    ? `Hello ${tpl.recipientName.trim()},`
    : 'Hello,'
  const company = tpl.companyName?.trim() || 'your company'
  const setupPara = `This setup is for ${company}. It takes a few minutes and puts your contacts, billing, and routing preferences on file — so when you need us, we quote first and ask questions never.`
  return [
    'ONFLY Air',
    tpl.tagline,
    '',
    'Welcome to OnFly Air',
    '',
    greet,
    '',
    tpl.intro,
    '',
    setupPara,
    '',
    `${tpl.buttonText}: ${tpl.onboardUrl}`,
    '',
    tpl.closingMessage,
    '',
    `Questions? Reply to this email or call ${tpl.phone} — you'll get a dispatcher, not a phone tree.`,
    '',
    'ONFLY AIR',
    tpl.tagline,
    `${tpl.phone} · ${tpl.supportEmail}`,
    '',
    `You received this because ${company} is being set up as an OnFly Air client.`,
  ].join('\n')
}

/** Branded HTML matching the welcome invite: black header + mark, cream body, gold CTA. */
export function renderClientInviteEmailHtml(tpl: ClientInviteTemplate): string {
  const greet = tpl.recipientName?.trim()
    ? `Hello ${escapeHtml(tpl.recipientName.trim())},`
    : 'Hello,'
  const company = tpl.companyName?.trim() || 'your company'
  const companyEsc = escapeHtml(company)
  const logoBlock = tpl.logoUrl.trim()
    ? `<img src="${escapeAttr(tpl.logoUrl.trim())}" width="56" height="56" alt="OnFly Air" style="display:block;margin:0 auto 14px;border:0;border-radius:10px" />`
    : ''

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ebe6d8;font-family:Georgia,'Times New Roman',serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ebe6d8;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#f7f2e3;border-radius:4px;overflow:hidden;border:1px solid #ddd6c4">
        <tr><td style="background:#0c0c0e;padding:28px 28px 24px;text-align:center">
          ${logoBlock}
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:28px;line-height:1.1;font-weight:700;letter-spacing:0.06em">
            <span style="color:#f7f2e3">ONFLY</span><span style="color:#c9a227"> Air</span>
          </div>
          <div style="margin-top:10px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.18em;color:#c9a227;font-weight:600">
            ${escapeHtml(tpl.tagline)}
          </div>
        </td></tr>
        <tr><td style="padding:36px 28px 8px;background:#f7f2e3">
          <h1 style="margin:0 0 22px;font-size:28px;line-height:1.25;color:#0c0c0e;font-weight:700;font-family:Georgia,'Times New Roman',serif">
            Welcome to OnFly Air
          </h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#0c0c0e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${greet}</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2a2a2e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            ${escapeHtml(tpl.intro)}
          </p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#2a2a2e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            This setup is for <strong style="color:#0c0c0e">${companyEsc}</strong>. It takes a few minutes and puts your contacts, billing, and routing preferences on file — so when you need us, we quote first and ask questions never.
          </p>
        </td></tr>
        <tr><td style="padding:20px 28px 8px;text-align:center;background:#f7f2e3">
          <a href="${escapeAttr(tpl.onboardUrl)}"
             style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700;font-size:15px;padding:14px 28px;border-radius:6px">
            ${escapeHtml(tpl.buttonText)}
          </a>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6b6560;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;word-break:break-all">
            Button not working? Copy this link:<br/>
            <a href="${escapeAttr(tpl.onboardUrl)}" style="color:#a8882a;text-decoration:underline">${escapeHtml(tpl.onboardUrl)}</a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 28px 32px;background:#f7f2e3">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2a2a2e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            ${escapeHtml(tpl.closingMessage)}
          </p>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#2a2a2e;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            Questions? Reply to this email or call
            <a href="tel:+18585297860" style="color:#c9a227;text-decoration:none;font-weight:700">${escapeHtml(tpl.phone)}</a>
            — you&apos;ll get a dispatcher, not a phone tree.
          </p>
        </td></tr>
        <tr><td style="background:#0c0c0e;padding:22px 28px;text-align:center">
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;letter-spacing:0.16em;color:#f7f2e3;font-weight:700">
            ONFLY AIR
          </div>
          <div style="margin-top:8px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:9px;letter-spacing:0.16em;color:#c9a227;font-weight:600">
            ${escapeHtml(tpl.tagline)}
          </div>
          <div style="margin-top:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;color:#c9a227">
            ${escapeHtml(tpl.phone)} · ${escapeHtml(tpl.supportEmail)}
          </div>
        </td></tr>
        <tr><td style="background:#e5dfd0;padding:14px 28px;text-align:center">
          <p style="margin:0;font-size:11px;line-height:1.5;color:#6b6560;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
            You received this because ${companyEsc} is being set up as an OnFly Air client.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
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
