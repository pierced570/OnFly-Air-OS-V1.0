/**
 * Send / notify for per-trip client ↔ OnFly portal chat.
 * Email adapter is mock-safe. Does not touch the ops SMS thread.
 */

import { createEmailAdapter } from '@/adapters/email'
import {
  clientPortalChatReplySubject,
  clientPortalChatReplyText,
  deskPortalChatNotifySubject,
  deskPortalChatNotifyText,
  mergePortalChatMessages,
  normalizePortalChatMessage,
  renderClientPortalChatReplyHtml,
  type PortalChatMessage,
  type PortalChatRole,
} from '@/domain/portalChat'
import { absoluteAppUrl } from '@/lib/appUrl'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import { getClient, listInvoiceEmails } from '@/lib/clientStore'
import { notifyDispatch } from '@/lib/dispatchNotify'
import { getEtaSheetThreadMeta, portalTrackingUrlForTrip } from '@/lib/etaSheetSender'
import {
  flushPersistTrip,
  getTrip,
  mergePortalChatIntoSession,
  postPortalChatMessage,
  type TripStoreRow,
} from '@/lib/tripStore'

function uniqEmails(emails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of emails) {
    const email = (raw ?? '').trim().toLowerCase()
    if (!email.includes('@') || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

function clientReplyEmails(trip: TripStoreRow): string[] {
  const thread = getEtaSheetThreadMeta(trip)
  const client = trip.client_id ? getClient(trip.client_id) : null
  return uniqEmails([
    ...(thread?.recipients ?? []),
    trip.quick?.invoice_email,
    client?.invoice_email,
    client?.email,
    ...(trip.client_id ? listInvoiceEmails(trip.client_id) : []),
    ...trip.participants
      .filter((p) =>
        ['client', 'client_ap', 'client_supply'].includes(p.role),
      )
      .map((p) => p.email),
  ])
}

async function persistViaRpc(opts: {
  tripId: string
  msg: PortalChatMessage
  token?: string | null
  email?: string | null
}): Promise<PortalChatMessage | null> {
  if (!canPersist()) return null
  const row = await safeQuery<Record<string, unknown>>(
    'append_portal_chat_message',
    () =>
      db().rpc('append_portal_chat_message', {
        p_trip_id: opts.tripId,
        p_role: opts.msg.role,
        p_body: opts.msg.body,
        p_from_label: opts.msg.from_label,
        p_token: opts.token?.trim() || null,
        p_email: opts.email?.trim().toLowerCase() || null,
        p_id: opts.msg.id,
      }),
  )
  return normalizePortalChatMessage(row)
}

async function notifyDeskOfClientMessage(
  trip: TripStoreRow,
  msg: PortalChatMessage,
): Promise<void> {
  const deskUrl = absoluteAppUrl(`/trips/${trip.id}`)
  const portalUrl = portalTrackingUrlForTrip(trip.id)
  const payload = {
    code: trip.code,
    ref: trip.ref,
    lane: trip.lane,
    body: msg.body,
    fromLabel: msg.from_label,
    deskUrl,
    portalUrl,
  }
  await notifyDispatch({
    title: 'Portal chat',
    detail: deskPortalChatNotifyText(payload),
    smsBody: '',
    emailSubject: deskPortalChatNotifySubject(payload),
    href: `/trips/${trip.id}`,
    trip_id: trip.id,
    trip_ref: trip.ref,
    skipSms: true,
  })
}

async function notifyClientOfOnFlyReply(
  trip: TripStoreRow,
  msg: PortalChatMessage,
): Promise<void> {
  const to = clientReplyEmails(trip)
  if (!to.length) return
  const portalUrl = portalTrackingUrlForTrip(trip.id)
  const payload = {
    code: trip.code,
    ref: trip.ref,
    lane: trip.lane,
    body: msg.body,
    portalUrl,
  }
  try {
    await createEmailAdapter().send({
      to,
      subject: clientPortalChatReplySubject(payload),
      text: clientPortalChatReplyText(payload),
      html: renderClientPortalChatReplyHtml(payload),
    })
  } catch (err) {
    console.warn('[portalChat] client reply email failed', err)
  }
}

export async function sendPortalChatMessage(opts: {
  tripId: string
  role: PortalChatRole
  body: string
  fromLabel?: string
  token?: string | null
  email?: string | null
}): Promise<PortalChatMessage> {
  const msg = postPortalChatMessage(opts.tripId, {
    role: opts.role,
    body: opts.body,
    fromLabel: opts.fromLabel,
  })
  const remote = await persistViaRpc({
    tripId: opts.tripId,
    msg,
    token: opts.token,
    email: opts.email,
  })
  if (remote) mergePortalChatIntoSession(opts.tripId, [remote])
  await flushPersistTrip(opts.tripId)

  const trip = getTrip(opts.tripId)
  if (trip && opts.role === 'client') {
    await notifyDeskOfClientMessage(trip, msg)
  } else if (trip && opts.role === 'onfly') {
    await notifyClientOfOnFlyReply(trip, msg)
  }
  return remote ?? msg
}

/**
 * Pull portal_chat from the safe view / token RPC and merge locally
 * without a full trip persist (avoids stub session_meta overwrites).
 */
export async function refreshPortalChat(opts: {
  tripId: string
  token?: string | null
}): Promise<void> {
  const { fetchPortalTripById, fetchPortalTripByToken } = await import(
    '@/lib/portalTripHydrate'
  )
  const remote = opts.token
    ? await fetchPortalTripByToken(opts.token)
    : await fetchPortalTripById(opts.tripId)
  if (!remote?.portal_chat?.length && !remote) return
  if (!getTrip(opts.tripId) && remote) {
    const { ensureTripInSession } = await import('@/lib/tripStore')
    ensureTripInSession(remote)
    return
  }
  mergePortalChatIntoSession(
    opts.tripId,
    mergePortalChatMessages([], remote?.portal_chat ?? []),
  )
}
