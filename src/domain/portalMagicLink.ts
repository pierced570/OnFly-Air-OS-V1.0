/**
 * Portal magic-link login email — pure TypeScript (no React / adapters).
 * Cream client family. Never includes operator/margin/cost.
 */

import { BRAND_EMAIL, BRAND_PHONE, BRAND_TAGLINE } from '@/domain/brand'

export const PORTAL_LOGIN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export type PortalMagicLinkEmail = {
  loginUrl: string
  phone: string
  supportEmail: string
  tagline: string
}

export function defaultPortalMagicLinkEmail(
  overrides?: Partial<PortalMagicLinkEmail>,
): PortalMagicLinkEmail {
  return {
    loginUrl: '/portal/auth',
    phone: BRAND_PHONE,
    supportEmail: BRAND_EMAIL,
    tagline: BRAND_TAGLINE,
    ...overrides,
  }
}

export function portalMagicLinkSubject(): string {
  return 'Your OnFly Air sign-in link'
}

export function renderPortalMagicLinkText(tpl: PortalMagicLinkEmail): string {
  return [
    'ONFLY Air',
    tpl.tagline,
    '',
    'Sign in to track your trips',
    '',
    'Use this one-time link to open your OnFly portal. It expires in 24 hours.',
    '',
    tpl.loginUrl,
    '',
    'Live tracking and status updates need a signed-in session. Soft and hard quotes still work without an account.',
    '',
    `Questions? Call ${tpl.phone} or email ${tpl.supportEmail}.`,
    '',
    '— OnFly Air',
  ].join('\n')
}

export function renderPortalMagicLinkHtml(tpl: PortalMagicLinkEmail): string {
  const url = escapeHtml(tpl.loginUrl)
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F7F2E3;font-family:Georgia,serif;color:#0C0C0E;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F2E3;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #E5DFD0;border-radius:12px;padding:28px 24px;">
        <tr><td>
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#C9A227;font-family:system-ui,sans-serif;">ONFLY Air</p>
          <h1 style="margin:12px 0 0;font-size:24px;font-weight:600;color:#0C0C0E;">Sign in to track your trips</h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.5;color:#4A463C;">
            Use this one-time link to open your portal. It expires in 24 hours.
          </p>
          <p style="margin:24px 0 0;">
            <a href="${url}" style="display:inline-block;background:#C9A227;color:#0C0C0E;text-decoration:none;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;padding:14px 22px;border-radius:8px;">
              Open my trips
            </a>
          </p>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.45;color:#6B6558;font-family:system-ui,sans-serif;word-break:break-all;">
            ${url}
          </p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.45;color:#6B6558;">
            Live tracking needs a signed-in session. Quotes and book requests still work without an account.
          </p>
          <p style="margin:24px 0 0;font-size:12px;color:#6B6558;font-family:system-ui,sans-serif;">
            Questions? Call ${escapeHtml(tpl.phone)} · ${escapeHtml(tpl.supportEmail)}
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

/** True when a createdAt ISO is still within the magic-link TTL. */
export function isPortalLoginTokenFresh(
  createdAtIso: string,
  nowMs = Date.now(),
  ttlMs = PORTAL_LOGIN_TOKEN_TTL_MS,
): boolean {
  const t = Date.parse(createdAtIso)
  if (!Number.isFinite(t)) return false
  return nowMs - t <= ttlMs
}
