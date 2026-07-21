/**
 * Client setup invite email — welcome + /client form link.
 * Pure TypeScript (no React / adapters). Cream client family branding.
 */

export type ClientInviteTemplate = {
  recipientName?: string
  companyName?: string
  buttonText: string
  onboardUrl: string
  phone: string
  /** Short intro under the welcome headline */
  intro: string
  closingMessage: string
}

export function defaultClientInviteTemplate(
  overrides?: Partial<ClientInviteTemplate>,
): ClientInviteTemplate {
  return {
    buttonText: 'Complete your client setup',
    onboardUrl: '/client',
    phone: '(858) 529-7860',
    intro:
      'Welcome to OnFly Air — on-demand, time-critical air freight with a vetted Part 135 carrier network. We move AOG and logistics for MROs, airlines, and manufacturers with pilot-led dispatch and clear ETAs.',
    closingMessage:
      'It takes a few minutes. Once your profile is in, you can request trips and track live deliveries from the client portal.',
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
  const companyLine = tpl.companyName?.trim()
    ? `\nThis invite is for ${tpl.companyName.trim()}.\n`
    : ''
  return [
    'Welcome to OnFly Air',
    '',
    greet,
    '',
    tpl.intro,
    companyLine,
    `${tpl.buttonText}: ${tpl.onboardUrl}`,
    '',
    tpl.closingMessage,
    '',
    `Questions? Reply to this email or call ${tpl.phone}.`,
    '',
    'OnFly Air LLC',
    'Operated with vetted Part 135 carriers — carrier identity is shared only when required for your trip.',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** Branded HTML: cream background, ink header, gold CTA — client family. */
export function renderClientInviteEmailHtml(tpl: ClientInviteTemplate): string {
  const greet = tpl.recipientName?.trim()
    ? `Hello ${escapeHtml(tpl.recipientName.trim())},`
    : 'Hello,'
  const companyBlock = tpl.companyName?.trim()
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#6b6560">
        This invite is for <strong style="color:#0c0c0e">${escapeHtml(tpl.companyName.trim())}</strong>.
      </p>`
    : ''

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f2e3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e3;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5dfd0">
        <tr><td style="background:#0c0c0e;padding:24px 28px;text-align:center">
          <div style="font-size:11px;letter-spacing:0.2em;color:#c9a227;font-weight:700">ONFLY AIR</div>
          <div style="margin-top:8px;font-size:13px;color:#f7f2e3;letter-spacing:0.04em;opacity:0.85">
            Time-critical air freight
          </div>
        </td></tr>
        <tr><td style="padding:32px 28px 12px">
          <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#0c0c0e;font-weight:600">
            Welcome to OnFly Air
          </h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2a2a2e">${greet}</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2a2a2e">
            ${escapeHtml(tpl.intro)}
          </p>
          ${companyBlock}
          <p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:#2a2a2e">
            Please complete your client setup form so we have your company profile, contacts, and routing preferences on file.
          </p>
        </td></tr>
        <tr><td style="padding:8px 28px 24px;text-align:center">
          <a href="${escapeAttr(tpl.onboardUrl)}"
             style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:6px">
            ${escapeHtml(tpl.buttonText)}
          </a>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#6b6560;word-break:break-all">
            ${escapeHtml(tpl.onboardUrl)}
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 28px">
          <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#4a4540">
            ${escapeHtml(tpl.closingMessage)}
          </p>
          <p style="margin:0;font-size:14px;line-height:1.55;color:#4a4540">
            Questions? Reply to this email or call
            <a href="tel:+18585297860" style="color:#c9a227;text-decoration:none;font-weight:600">${escapeHtml(tpl.phone)}</a>.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px 20px;border-top:1px solid #ebe4d4;text-align:center">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#6b6560">
            OnFly Air LLC · Operated with vetted Part 135 carriers
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
