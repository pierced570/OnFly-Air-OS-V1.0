/**
 * Operator network invite email — preview + send via EmailAdapter.
 */

import { createEmailAdapter } from '@/adapters/email'

export const DEFAULT_SKYIQ_URL = 'https://info.skyiq.net/'
/** External ops form (legacy). Prefer in-app /onboard (no insured-amount field). */
export const LEGACY_ONBOARD_URL = 'https://operations.onflyair.com/onboard'

export const DEFAULT_REFERENCES = [
  { name: 'Sonrise Aviation', phone: '(260) 766-4548' },
  { name: 'Axio', phone: '(864) 397-5082' },
  { name: 'Ameristar', phone: '(972) 248-2478' },
] as const

export type OperatorOnboardTemplate = {
  buttonText: string
  closingMessage: string
  phone: string
  skyiqPitch: string
  skyiqUrl: string
  skyiqLinkText: string
  references: Array<{ name: string; phone: string }>
  onboardUrl: string
}

export function defaultOnboardTemplate(
  overrides?: Partial<OperatorOnboardTemplate>,
): OperatorOnboardTemplate {
  const appUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_APP_URL as string | undefined)) ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  const envOnboard = import.meta.env?.VITE_ONBOARD_URL as string | undefined
  const envSkyiq = import.meta.env?.VITE_SKYIQ_URL as string | undefined

  return {
    buttonText: 'Complete Onboarding Form',
    closingMessage:
      'Please fill out our onboarding form — we would love to have you in our network.',
    phone: '(858) 529-7860',
    skyiqPitch:
      'With fuel prices on the rise, please consider checking out our sister company SkyIQ — your fuel intelligence partner.',
    skyiqUrl: envSkyiq?.trim() || DEFAULT_SKYIQ_URL,
    skyiqLinkText: 'Learn more about SkyIQ →',
    references: [...DEFAULT_REFERENCES],
    onboardUrl:
      envOnboard?.trim() ||
      (appUrl ? `${appUrl.replace(/\/$/, '')}/onboard` : '/onboard'),
    ...overrides,
  }
}

export function renderOperatorOnboardEmailHtml(
  tpl: OperatorOnboardTemplate,
): string {
  const refs = tpl.references
    .map(
      (r) =>
        `<div style="margin:4px 0;font-size:14px;color:#1a1a1a">${escapeHtml(r.name)} — ${escapeHtml(r.phone)}</div>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f0e8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0c0c0e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e8;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5dfd0">
        <tr><td style="background:#0c0c0e;padding:28px 24px;text-align:center">
          <div style="font-size:22px;letter-spacing:0.12em;color:#c9a227;font-weight:700">ONFLY AIR</div>
          <div style="margin-top:6px;font-size:12px;color:#f7f2e3;letter-spacing:0.08em">Operator Network</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;text-align:center">
          <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#0c0c0e">Join the OnFly Air Network</h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2a2a2e;text-align:left">
            OnFly Air is a nationwide charter brokerage. Our background is primarily in AOG and logistics support for large MROs, airlines, and manufacturers, with a growing presence in the VIP and luxury space.
          </p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2a2a2e;text-align:left">
            A majority of our trips are ASAP for airline AOG recovery and we perform hundreds of these every year alongside the standard private aircraft charters for our VIP clients. All of our dispatchers are professional pilots with part 135, 91k, or 121 experience. With thousands of hours of flight experience we set realistic customer expectations and ensure seamless operations for your crew.
          </p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#2a2a2e;text-align:left">
            Our goal is to be your preferred broker to work with. As many of our current operators will tell you, we prioritize fast payments, understand the industry from both sides, and operate with transparency, sound business practices, and integrity.
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 20px">
          <div style="background:#f7f2e3;border-left:3px solid #c9a227;padding:14px 16px;border-radius:0 6px 6px 0">
            <div style="font-size:11px;letter-spacing:0.12em;font-weight:700;color:#0c0c0e;margin-bottom:8px">REFERENCES</div>
            ${refs}
          </div>
        </td></tr>
        <tr><td style="padding:8px 28px 20px;text-align:center">
          <a href="${escapeAttr(tpl.onboardUrl)}"
             style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:6px">
            ${escapeHtml(tpl.buttonText)}
          </a>
          <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#4a4540">
            ${escapeHtml(tpl.closingMessage)}
            If you have any questions, reply directly to this email or call us at ${escapeHtml(tpl.phone)}.
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 24px">
          <div style="background:#f7f2e3;border-left:3px solid #c9a227;padding:14px 16px;border-radius:0 6px 6px 0">
            <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#2a2a2e">${escapeHtml(tpl.skyiqPitch)}</p>
            <a href="${escapeAttr(tpl.skyiqUrl)}" style="color:#c9a227;font-size:14px;font-weight:600;text-decoration:none">${escapeHtml(tpl.skyiqLinkText)}</a>
          </div>
        </td></tr>
        <tr><td style="background:#f0ebe0;padding:14px;text-align:center;font-size:12px;color:#6b6560">
          OnFly Air LLC — Charter Brokerage
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function renderOperatorOnboardEmailText(
  tpl: OperatorOnboardTemplate,
): string {
  const refs = tpl.references
    .map((r) => `• ${r.name} — ${r.phone}`)
    .join('\n')
  return [
    'Join the OnFly Air Network',
    '',
    'OnFly Air is a nationwide charter brokerage. Our background is primarily in AOG and logistics support for large MROs, airlines, and manufacturers, with a growing presence in the VIP and luxury space.',
    '',
    'A majority of our trips are ASAP for airline AOG recovery…',
    '',
    'REFERENCES',
    refs,
    '',
    `${tpl.buttonText}: ${tpl.onboardUrl}`,
    '',
    tpl.closingMessage,
    `Questions? Reply or call ${tpl.phone}.`,
    '',
    tpl.skyiqPitch,
    `${tpl.skyiqLinkText} ${tpl.skyiqUrl}`,
    '',
    'OnFly Air LLC — Charter Brokerage',
  ].join('\n')
}

export async function sendOperatorOnboardInvite(opts: {
  to: string
  companyName?: string
  template?: Partial<OperatorOnboardTemplate>
}): Promise<{ id: string; to: string; onboardUrl: string }> {
  const to = opts.to.trim().toLowerCase()
  if (!to.includes('@')) throw new Error('Valid email required')
  const tpl = defaultOnboardTemplate(opts.template)
  const email = createEmailAdapter()
  const company = opts.companyName?.trim()
  const { id } = await email.send({
    to,
    subject: company
      ? `OnFly Air — join our operator network (${company})`
      : 'OnFly Air — join our operator network',
    html: renderOperatorOnboardEmailHtml(tpl),
    text: renderOperatorOnboardEmailText(tpl),
  })
  return { id, to, onboardUrl: tpl.onboardUrl }
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
