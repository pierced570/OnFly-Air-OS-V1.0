/**
 * Client setup invite — resolve /client URL + send via EmailAdapter.
 */

import { createEmailAdapter } from '@/adapters/email'
import {
  clientInviteEmailSubject,
  defaultClientInviteTemplate,
  renderClientInviteEmailHtml,
  renderClientInviteEmailText,
  type ClientInviteTemplate,
} from '@/domain/clientInviteEmail'

export type { ClientInviteTemplate }

/** Public client setup form URL (shareable). */
export function resolveClientOnboardUrl(override?: string): string {
  if (override?.trim()) return override.trim()
  const envUrl = import.meta.env?.VITE_CLIENT_ONBOARD_URL as string | undefined
  if (envUrl?.trim()) return envUrl.trim()
  const appUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_APP_URL as string | undefined)) ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  if (appUrl) return `${appUrl.replace(/\/$/, '')}/client`
  return '/client'
}

export function buildClientInviteTemplate(
  overrides?: Partial<ClientInviteTemplate>,
): ClientInviteTemplate {
  return defaultClientInviteTemplate({
    onboardUrl: resolveClientOnboardUrl(overrides?.onboardUrl),
    ...overrides,
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
