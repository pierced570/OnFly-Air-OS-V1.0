/**
 * Page the on-shift dispatcher when work lands from a client door
 * (portal request, email/SMS intake). Uses Comms + Email adapters — mock-safe.
 */

import { createCommsAdapter } from '@/adapters/comms'
import { createEmailAdapter } from '@/adapters/email'
import type { TripRequestRecord } from '@/domain/tripRequest'
import { raiseException } from '@/lib/exceptionStore'
import { getOnShift } from '@/lib/shiftStore'

/** Demo fallback when nobody has started a shift yet. */
export const FALLBACK_DISPATCH_PHONE = '+10000000000'

export function resolveDispatchPhone(): string {
  const phone = getOnShift()?.phone?.trim()
  return phone || FALLBACK_DISPATCH_PHONE
}

/** Optional desk inbox — set VITE_DISPATCH_ALERT_EMAIL (public, not a secret). */
export function dispatchAlertEmail(): string | null {
  const raw = import.meta.env.VITE_DISPATCH_ALERT_EMAIL
  if (typeof raw !== 'string') return null
  const to = raw.trim().toLowerCase()
  return to.includes('@') ? to : null
}

function appBase(): string {
  const raw = import.meta.env.VITE_APP_URL
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

export function portalRequestReviewPath(requestId: string): string {
  return `/trips/new?request=${requestId}`
}

export function formatPortalRequestSms(
  row: Pick<TripRequestRecord, 'id' | 'ref' | 'lane' | 'summary' | 'email'>,
): string {
  const path = portalRequestReviewPath(row.id)
  const base = appBase()
  const link = base ? `${base}${path}` : path
  const who = row.email?.trim() || 'client'
  return `OnFly: portal request R-${row.ref} · ${row.lane} · ${row.summary} · ${who} — review ${link}`
}

export type DispatchNotifyResult = {
  phone: string
  sms_id: string | null
  email_id: string | null
  exception_id: string | null
}

/**
 * SMS the on-shift phone, optionally email the desk inbox, and raise a Board
 * exception card so the queue lights up even if the phone is in a pocket.
 */
export async function notifyDispatch(opts: {
  title: string
  detail: string
  smsBody: string
  emailSubject?: string
  href?: string | null
  trip_id?: string | null
  trip_ref?: number | null
  /** Skip Board card (e.g. when another surface already owns attention). */
  raiseBoard?: boolean
}): Promise<DispatchNotifyResult> {
  const phone = resolveDispatchPhone()
  const raiseBoard = opts.raiseBoard !== false
  let sms_id: string | null = null
  let email_id: string | null = null
  let exception_id: string | null = null

  try {
    const sms = await createCommsAdapter().send({
      channel: 'sms',
      to: phone,
      body: opts.smsBody,
    })
    sms_id = sms.id
  } catch (err) {
    console.warn('[dispatchNotify] SMS failed', err)
  }

  const to = dispatchAlertEmail()
  if (to) {
    try {
      const mail = await createEmailAdapter().send({
        to,
        subject: opts.emailSubject ?? opts.title,
        text: opts.detail,
        html: `<p>${escapeHtml(opts.detail)}</p>${
          opts.href
            ? `<p><a href="${escapeHtml(appBase() + opts.href)}">Open in OnFly</a></p>`
            : ''
        }`,
      })
      email_id = mail.id
    } catch (err) {
      console.warn('[dispatchNotify] email failed', err)
    }
  }

  if (raiseBoard) {
    const card = raiseException({
      trip_id: opts.trip_id ?? null,
      trip_ref: opts.trip_ref ?? null,
      title: opts.title,
      detail: opts.detail,
      severity: 'attn',
      href: opts.href ?? null,
    })
    exception_id = card.id
  }

  return { phone, sms_id, email_id, exception_id }
}

export async function notifyPortalRequest(
  row: TripRequestRecord,
): Promise<DispatchNotifyResult> {
  const href = portalRequestReviewPath(row.id)
  const who = row.email?.trim() || row.client_name?.trim() || 'client'
  const detail = `R-${row.ref} · ${row.lane} · ${row.summary} · ${who}`
  return notifyDispatch({
    title: 'Portal request',
    detail,
    smsBody: formatPortalRequestSms(row),
    emailSubject: `OnFly portal request R-${row.ref} · ${row.lane}`,
    href,
    trip_id: null,
    trip_ref: row.ref,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
