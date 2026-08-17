/**
 * Email adapter — mock (default) or Resend via Supabase edge `send-email`.
 * Never put RESEND_API_KEY in VITE_* — secret lives in edge function secrets.
 */

import { adapterMode } from '@/adapters/types'
import { messageFromEdgeInvoke } from '@/lib/edgeFunctionError'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type EmailMessage = {
  /** Primary recipient(s). Arrays are sent as multiple To addresses. */
  to: string | string[]
  subject: string
  html?: string
  text?: string
  reply_to?: string
  /** Optional carbon copies (Resend / mock). */
  cc?: string[]
  bcc?: string[]
  /**
   * SMTP headers for threading (Resend).
   * Use In-Reply-To + References with RFC Message-IDs from prior sends.
   */
  headers?: Record<string, string>
}

export interface EmailAdapter {
  send(msg: EmailMessage): Promise<{ id: string; messageId?: string | null }>
}

const sent: EmailMessage[] = []

export class MockEmailAdapter implements EmailAdapter {
  async send(msg: EmailMessage) {
    sent.push(msg)
    console.info('[MockEmail]', msg.to, msg.subject)
    const n = sent.length
    return {
      id: `mock-email-${n}`,
      messageId: `<mock-email-${n}@onfly.local>`,
    }
  }
}

/**
 * Calls supabase/functions/send-email (Resend).
 * Requires VITE_EMAIL_ADAPTER=real + deployed function + RESEND_API_KEY secret.
 */
export class ResendEmailAdapter implements EmailAdapter {
  async send(msg: EmailMessage) {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error(
        'Resend email requires Supabase — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
      )
    }
    const toList = (Array.isArray(msg.to) ? msg.to : [msg.to])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'))
    if (!toList.length) throw new Error('Valid email required')
    const to = toList.length === 1 ? toList[0]! : toList
    if (!msg.subject?.trim()) throw new Error('Subject required')
    if (!msg.html && !msg.text) throw new Error('html or text required')

    const primarySet = new Set(toList)
    const cc = (msg.cc ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@') && !primarySet.has(e))
    const bcc = (msg.bcc ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter(
        (e) => e.includes('@') && !primarySet.has(e) && !cc.includes(e),
      )

    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: msg.reply_to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        headers: msg.headers,
      },
    })

    const body = data as {
      id?: string
      message_id?: string | null
      error?: string
      detail?: unknown
    } | null

    if (error) {
      throw new Error(
        await messageFromEdgeInvoke({
          data: body,
          error,
          fallback: 'Email send failed (send-email)',
        }),
      )
    }

    const id = body?.id
    if (!id) {
      throw new Error(
        await messageFromEdgeInvoke({
          data: body,
          error: null,
          fallback:
            'send-email returned no id — check RESEND_API_KEY / EMAIL_FROM secrets',
        }),
      )
    }
    sent.push(msg)
    console.info('[ResendEmail]', to, msg.subject, id, body?.message_id)
    return { id, messageId: body?.message_id ?? null }
  }
}

export function getMockSentEmails() {
  return [...sent]
}

export function createEmailAdapter(): EmailAdapter {
  const mode = adapterMode('VITE_EMAIL_ADAPTER', 'real')
  if (mode === 'real' && isSupabaseConfigured) return new ResendEmailAdapter()
  if (mode === 'real' && !isSupabaseConfigured) {
    console.warn('[email] real mode needs Supabase — using mock')
  }
  return new MockEmailAdapter()
}

/** True when the app will attempt live Resend (still needs edge secrets). */
export function isRealEmailEnabled(): boolean {
  return adapterMode('VITE_EMAIL_ADAPTER', 'real') === 'real'
}

/** Ready to call the edge function (adapter=real + Supabase public URL/key). */
export function isLiveEmailConfigured(): boolean {
  return isRealEmailEnabled() && isSupabaseConfigured
}
