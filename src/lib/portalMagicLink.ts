/**
 * Send portal magic-link login emails via EmailAdapter.
 * Optionally also tries Supabase signInWithOtp when configured (does not
 * replace our token email — mock/demo must work with zero API keys).
 */

import { createEmailAdapter } from '@/adapters/email'
import {
  defaultPortalMagicLinkEmail,
  portalMagicLinkSubject,
  renderPortalMagicLinkHtml,
  renderPortalMagicLinkText,
} from '@/domain/portalMagicLink'
import { safePortalNextPath } from '@/domain/portalShareLinks'
import { absoluteAppUrl } from '@/lib/appUrl'
import { createPortalLoginToken } from '@/lib/portalLoginStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type SendPortalMagicLinkResult = {
  id: string
  to: string
  loginUrl: string
  /** True when we also invoked Supabase OTP (best-effort). */
  otpAttempted: boolean
}

export async function sendPortalMagicLink(opts: {
  email: string
  next?: string | null
  expectedClientId?: string | null
}): Promise<SendPortalMagicLinkResult> {
  const to = opts.email.trim().toLowerCase()
  if (!to.includes('@')) throw new Error('Enter a valid email')

  const next = safePortalNextPath(opts.next ?? null)
  const token = createPortalLoginToken({
    email: to,
    next,
    expectedClientId: opts.expectedClientId ?? null,
  })
  const path = next
    ? `/portal/auth?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`
    : `/portal/auth?token=${encodeURIComponent(token)}`
  const loginUrl = absoluteAppUrl(path)

  const tpl = defaultPortalMagicLinkEmail({ loginUrl })
  const email = createEmailAdapter()
  const { id } = await email.send({
    to,
    subject: portalMagicLinkSubject(),
    html: renderPortalMagicLinkHtml(tpl),
    text: renderPortalMagicLinkText(tpl),
  })

  let otpAttempted = false
  if (isSupabaseConfigured && supabase) {
    try {
      const redirectTo = absoluteAppUrl(
        next
          ? `/portal/auth?next=${encodeURIComponent(next)}`
          : '/portal/auth',
      )
      await supabase.auth.signInWithOtp({
        email: to,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      })
      otpAttempted = true
    } catch (err) {
      console.warn('[portal] signInWithOtp optional', err)
    }
  }

  return { id, to, loginUrl, otpAttempted }
}
