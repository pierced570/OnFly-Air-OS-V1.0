/**
 * Operator network invite email — preview + send via EmailAdapter.
 */

import { createEmailAdapter } from '@/adapters/email'

export const DEFAULT_SKYIQ_URL = 'https://info.skyiq.net/'

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
        <tr><td style="background:#0c0c0e;padding:22px 24px;text-align:center">
          <img src="https://onflyair.com/wp-content/uploads/2024/02/onflyair-ff-01.png" alt="OnFly Air" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0" />
        </td></tr>
        <tr><td style="padding:28px 28px 8px">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0c0c0e;font-weight:600">Join our operator network</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2a2a2e">
            OnFly Air is a nationwide charter brokerage — AOG and logistics for MROs, airlines, and manufacturers, plus VIP charter. Most of our trips are ASAP airline recovery; our dispatchers are professional pilots (Part 135 / 91K / 121) who set realistic expectations and keep ops smooth for your crew.
          </p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#2a2a2e">
            We aim to be your preferred broker: fast payments, transparency, and operators who already work with us as references.
          </p>
          <p style="margin:0 0 6px;font-size:13px;color:#6b6560">References</p>
          ${refs}
        </td></tr>
        <tr><td style="padding:20px 28px;text-align:center">
          <a href="${escapeAttr(tpl.onboardUrl)}"
             style="display:inline-block;background:#c9a227;color:#0c0c0e;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:6px">
            ${escapeHtml(tpl.buttonText)}
          </a>
          <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#4a4540">
            ${escapeHtml(tpl.closingMessage)} Questions? Reply or call ${escapeHtml(tpl.phone)}.
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 20px;border-top:1px solid #ebe4d4">
          <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b6560">
            ${escapeHtml(tpl.skyiqPitch)}
            <a href="${escapeAttr(tpl.skyiqUrl)}" style="color:#c9a227;font-weight:600;text-decoration:none">${escapeHtml(tpl.skyiqLinkText)}</a>
          </p>
        </td></tr>
        <tr><td style="padding:12px 28px 18px;text-align:center;font-size:12px;color:#6b6560">
          OnFly Air LLC
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
    'Join our operator network',
    '',
    'OnFly Air is a nationwide charter brokerage — AOG and logistics for MROs, airlines, and manufacturers, plus VIP charter. Fast payments, transparent ops; references below.',
    '',
    'References',
    refs,
    '',
    `${tpl.buttonText}: ${tpl.onboardUrl}`,
    '',
    `${tpl.closingMessage} Questions? Reply or call ${tpl.phone}.`,
    '',
    `${tpl.skyiqPitch} ${tpl.skyiqLinkText} ${tpl.skyiqUrl}`,
    '',
    'OnFly Air LLC',
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
