/**
 * Client setup invite — resolve /client URL + send via EmailAdapter.
 */

import { createEmailAdapter } from '@/adapters/email'
import {
  BRAND_LOGO_PATH,
  BRAND_MARK_PATH,
  clientInviteEmailSubject,
  defaultClientInviteTemplate,
  renderClientInviteEmailHtml,
  renderClientInviteEmailText,
  type ClientInviteTemplate,
} from '@/domain/clientInviteEmail'

export type { ClientInviteTemplate }

function appOrigin(): string {
  const appUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_APP_URL as string | undefined)) ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  return (appUrl || '').replace(/\/$/, '')
}

/** Public client setup form URL (shareable). */
export function resolveClientOnboardUrl(override?: string): string {
  if (override?.trim()) return override.trim()
  const envUrl = import.meta.env?.VITE_CLIENT_ONBOARD_URL as string | undefined
  if (envUrl?.trim()) return envUrl.trim()
  const origin = appOrigin()
  if (origin) return `${origin}/client`
  return '/client'
}

function absoluteBrandUrl(path: string, override?: string): string {
  if (override?.trim()) return override.trim()
  const origin = appOrigin()
  if (origin) return `${origin}${path}`
  return path
}

/** Absolute URL for the mini brand mark. */
export function resolveBrandMarkUrl(override?: string): string {
  const envUrl = import.meta.env?.VITE_BRAND_MARK_URL as string | undefined
  if (!override?.trim() && envUrl?.trim()) return envUrl.trim()
  return absoluteBrandUrl(BRAND_MARK_PATH, override)
}

/** Absolute URL for the full ONFLYAIR wordmark (forms / email headers). */
export function resolveBrandLogoUrl(override?: string): string {
  const envUrl = import.meta.env?.VITE_BRAND_LOGO_URL as string | undefined
  if (!override?.trim() && envUrl?.trim()) return envUrl.trim()
  return absoluteBrandUrl(BRAND_LOGO_PATH, override)
}

export function buildClientInviteTemplate(
  overrides?: Partial<ClientInviteTemplate>,
): ClientInviteTemplate {
  const onboardUrl = resolveClientOnboardUrl(overrides?.onboardUrl)
  const logoUrl = resolveBrandMarkUrl(overrides?.logoUrl)
  const fullLogoUrl = resolveBrandLogoUrl(overrides?.fullLogoUrl)
  return defaultClientInviteTemplate({
    ...overrides,
    onboardUrl,
    logoUrl,
    fullLogoUrl,
  })
}

export async function sendClientOnboardInvite(opts: {
  to: string
  companyName?: string
  recipientName?: string
  template?: Partial<ClientInviteTemplate>
}): Promise<{ id: string; to: string; onboardUrl: string }> {
  const to = opts.to.trim().toLowerCase()
  if (!to.includes('@')) throw new Error('Valid email required')
  const company = opts.companyName?.trim()
  const tpl = buildClientInviteTemplate({
    ...opts.template,
    companyName: company || opts.template?.companyName,
    recipientName: opts.recipientName?.trim() || opts.template?.recipientName,
  })
  const email = createEmailAdapter()
  const { id } = await email.send({
    to,
    subject: clientInviteEmailSubject({ companyName: company }),
    html: renderClientInviteEmailHtml(tpl),
    text: renderClientInviteEmailText(tpl),
  })
  return { id, to, onboardUrl: tpl.onboardUrl }
}
