/**
 * Page the desk when work lands from a client door (portal request, email/SMS
 * intake). Soft-quote / cost-inquiry path is email-only to info@onflyair.com
 * (no SMS / no desk ring). Desk + hard-quote paths SMS and/or RingOut the 858
 * desk line via RingCentral. Uses Comms + Email adapters — mock-safe.
 */

import { createCommsAdapter } from '@/adapters/comms'
import { createEmailAdapter } from '@/adapters/email'
import { BRAND_PHONE_E164 } from '@/domain/brand'
import { BRAND_EMAIL } from '@/domain/clientInviteEmail'
import type { TripRequestRecord } from '@/domain/tripRequest'
import { raiseException } from '@/lib/exceptionStore'
import { getOnShift } from '@/lib/shiftStore'

/** Demo fallback when nobody has started a shift yet. */
export const FALLBACK_DISPATCH_PHONE = '+10000000000'

/** Portal / hard-quote SMS destination — RingCentral desk, not on-shift cell. */
export const DESK_ALERT_PHONE_E164 = BRAND_PHONE_E164

export function resolveDispatchPhone(): string {
  const phone = getOnShift()?.phone?.trim()
  return phone || FALLBACK_DISPATCH_PHONE
}

/**
 * Desk inbox for portal / intake alerts.
 * Defaults to info@onflyair.com; override with VITE_DISPATCH_ALERT_EMAIL.
 */
export function dispatchAlertEmail(): string {
  const raw = import.meta.env.VITE_DISPATCH_ALERT_EMAIL
  if (typeof raw === 'string') {
    const to = raw.trim().toLowerCase()
    if (to.includes('@')) return to
  }
  return BRAND_EMAIL
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
  row: Pick<
    TripRequestRecord,
    'id' | 'ref' | 'lane' | 'summary' | 'email' | 'urgent_phone'
  >,
): string {
  const path = portalRequestReviewPath(row.id)
  const base = appBase()
  const link = base ? `${base}${path}` : path
  const who = row.email?.trim() || 'client'
  const phone = row.urgent_phone?.trim()
  const reach = phone ? ` · reach ${phone}` : ''
  return `OnFly: portal request R-${row.ref} · ${row.lane} · ${row.summary} · ${who}${reach} — review ${link}`
}

export function formatCostInquiryEmail(
  row: Pick<
    TripRequestRecord,
    'id' | 'ref' | 'lane' | 'summary' | 'email' | 'client_name' | 'urgent_phone'
  >,
): { subject: string; text: string } {
  const who = row.email?.trim() || row.client_name?.trim() || 'client'
  const phone = row.urgent_phone?.trim()
  const href = portalRequestReviewPath(row.id)
  const base = appBase()
  const link = base ? `${base}${href}` : href
  const text = [
    'A cost inquiry has been made.',
    '',
    `R-${row.ref} · ${row.lane}`,
    row.summary,
    who + (phone ? ` · ${phone}` : ''),
    '',
    `Review: ${link}`,
  ].join('\n')
  return {
    subject: `OnFly cost inquiry R-${row.ref} · ${row.lane}`,
    text,
  }
}

export function formatHardQuoteEmail(
  row: Pick<
    TripRequestRecord,
    'id' | 'ref' | 'lane' | 'summary' | 'email' | 'client_name' | 'urgent_phone'
  >,
): { subject: string; text: string } {
  const who = row.email?.trim() || row.client_name?.trim() || 'client'
  const phone = row.urgent_phone?.trim()
  const href = portalRequestReviewPath(row.id)
  const base = appBase()
  const link = base ? `${base}${href}` : href
  const text = [
    'Hard quote requested from the client portal.',
    '',
    `R-${row.ref} · ${row.lane}`,
    row.summary,
    who + (phone ? ` · ${phone}` : ''),
    '',
    `Review: ${link}`,
  ].join('\n')
  return {
    subject: `OnFly hard quote R-${row.ref} · ${row.lane}`,
    text,
  }
}

export type DispatchNotifyResult = {
  phone: string
  sms_id: string | null
  email_id: string | null
  exception_id: string | null
  /** RingCentral RingOut id when the 858 desk line was rung. */
  ring_id: string | null
}

/**
 * SMS a desk/on-shift phone, optionally email the desk inbox, optionally
 * RingOut the 858 desk line, and raise a Board exception card so the queue
 * lights up even if the phone is in a pocket.
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
  /**
   * SMS destination. Portal / hard-quote pass DESK_ALERT_PHONE_E164 (858).
   * Defaults to on-shift phone (or demo fallback).
   */
  phone?: string
  /** Soft-quote cost inquiries: email only — no SMS page. */
  skipSms?: boolean
  /**
   * Ring the company desk line via RingCentral RingOut (858).
   * Soft quotes leave this off; desk + hard-quote paths turn it on.
   */
  ringDesk?: boolean
  /** Logged on the RingOut (not spoken). */
  ringReason?: string
}): Promise<DispatchNotifyResult> {
  const phone = opts.phone?.trim() || resolveDispatchPhone()
  const raiseBoard = opts.raiseBoard !== false
  let sms_id: string | null = null
  let email_id: string | null = null
  let exception_id: string | null = null
  let ring_id: string | null = null

  if (!opts.skipSms) {
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
  }

  if (opts.ringDesk) {
    try {
      const ring = await createCommsAdapter().ringDesk({
        reason:
          opts.ringReason?.trim() ||
          opts.title ||
          `desk ring R-${opts.trip_ref ?? '?'}`,
      })
      ring_id = ring.id
    } catch (err) {
      console.error('[dispatchNotify] desk ring failed', err)
    }
  }

  const to = dispatchAlertEmail()
  if (to) {
    try {
      const mail = await createEmailAdapter().send({
        to,
        subject: opts.emailSubject ?? opts.title,
        text: opts.detail,
        html: `<p>${escapeHtml(opts.detail).replace(/\n/g, '<br/>')}</p>${
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

  return { phone, sms_id, email_id, exception_id, ring_id }
}

export async function notifyPortalRequest(
  row: TripRequestRecord,
): Promise<DispatchNotifyResult> {
  const href = portalRequestReviewPath(row.id)
  const who = row.email?.trim() || row.client_name?.trim() || 'client'
  const phone = row.urgent_phone?.trim()
  const detail = `R-${row.ref} · ${row.lane} · ${row.summary} · ${who}${
    phone ? ` · urgent ${phone}` : ''
  }`
  return notifyDispatch({
    title: 'Portal request',
    detail,
    smsBody: formatPortalRequestSms(row),
    emailSubject: `OnFly portal request R-${row.ref} · ${row.lane}`,
    href,
    trip_id: null,
    trip_ref: row.ref,
    phone: DESK_ALERT_PHONE_E164,
    ringDesk: true,
    ringReason: `portal request R-${row.ref} · ${row.lane}`,
  })
}

/**
 * Soft quote / “Have OnFly quote this NOW” — email info@ only, no SMS / no ring.
 */
export async function notifyCostInquiry(
  row: TripRequestRecord,
): Promise<DispatchNotifyResult> {
  const href = portalRequestReviewPath(row.id)
  const mail = formatCostInquiryEmail(row)
  return notifyDispatch({
    title: 'Cost inquiry',
    detail: mail.text,
    smsBody: '',
    emailSubject: mail.subject,
    href,
    trip_id: null,
    trip_ref: row.ref,
    phone: DESK_ALERT_PHONE_E164,
    skipSms: true,
  })
}

/**
 * Hard quote from the client portal — email + RingOut the 858 desk line
 * (no SMS; soft quotes stay email-only).
 */
export async function notifyHardQuoteRequest(
  row: TripRequestRecord,
): Promise<DispatchNotifyResult> {
  const href = portalRequestReviewPath(row.id)
  const mail = formatHardQuoteEmail(row)
  return notifyDispatch({
    title: 'Hard quote requested',
    detail: mail.text,
    smsBody: '',
    emailSubject: mail.subject,
    href,
    trip_id: null,
    trip_ref: row.ref,
    phone: DESK_ALERT_PHONE_E164,
    skipSms: true,
    ringDesk: true,
    ringReason: `hard quote R-${row.ref} · ${row.lane}`,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
