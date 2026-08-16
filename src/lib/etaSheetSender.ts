import { createEmailAdapter } from '@/adapters/email'
import {
  clientTrackingUpdateSubject,
  renderClientTrackingUpdateHtml,
  renderClientTrackingUpdateText,
} from '@/domain/clientTrackingUpdateEmail'
import {
  etaSheetEmailSubject,
  fullLaneLabel,
  renderEtaSheetEmailHtml,
  renderEtaSheetEmailText,
} from '@/domain/etaSheetEmail'
import { absoluteAppUrl } from '@/lib/appUrl'
import { buildEtaSheetEmailTemplate } from '@/lib/buildEtaSheetEmail'
import {
  computeEtaSheetFromBookedTrip,
  type EtaSheetContext,
} from '@/lib/etaSheet'
import { createPortalTrackToken } from '@/lib/portalTrackStore'
import type { TripStoreRow } from '@/lib/tripStore'
import { getTrip, mutateTrip } from '@/lib/tripStore'

function makePortalTrackingLink(token: string): string {
  // Always VITE_APP_URL / production — never the desk's Vercel preview origin.
  return absoluteAppUrl(`/portal/track/${token}`)
}

export function portalTrackingUrlForTrip(
  tripId: string,
  email = 'desk@onflyair.com',
): string {
  const token = createPortalTrackToken({ tripId, email })
  return makePortalTrackingLink(token)
}

function uniqLower(emails: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of emails) {
    const email = raw.trim().toLowerCase()
    if (!email || !email.includes('@')) continue
    if (seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

export type EtaSheetThreadMeta = {
  subject: string
  recipients: string[]
  cc: string[]
  /** RFC Message-IDs for In-Reply-To / References (oldest → newest). */
  messageIds: string[]
  /** Resend / mock provider ids. */
  emailIds: string[]
}

/** Last ETA sheet / client-update thread anchors from trip events. */
export function getEtaSheetThreadMeta(
  trip: TripStoreRow,
): EtaSheetThreadMeta | null {
  const hits = [...trip.events]
    .filter(
      (e) =>
        e.kind === 'eta_sheet_sent' || e.kind === 'client_tracking_update_sent',
    )
    .reverse()
  if (!hits.length) return null

  let subject = ''
  const recipients: string[] = []
  const cc: string[] = []
  const messageIds: string[] = []
  const emailIds: string[] = []
  const seenMsg = new Set<string>()
  const seenEmail = new Set<string>()
  const seenTo = new Set<string>()
  const seenCc = new Set<string>()

  // Walk oldest → newest so References stay chronological.
  for (const e of [...hits].reverse()) {
    const p = e.payload ?? {}
    if (!subject && typeof p.subject === 'string' && p.subject.trim()) {
      subject = p.subject.trim().replace(/^re:\s*/i, '').trim()
    }
    for (const r of Array.isArray(p.recipients) ? p.recipients : []) {
      const email = String(r).trim().toLowerCase()
      if (!email.includes('@') || seenTo.has(email)) continue
      seenTo.add(email)
      recipients.push(email)
    }
    for (const r of Array.isArray(p.cc) ? p.cc : []) {
      const email = String(r).trim().toLowerCase()
      if (!email.includes('@') || seenTo.has(email) || seenCc.has(email)) continue
      seenCc.add(email)
      cc.push(email)
    }
    for (const id of Array.isArray(p.message_ids) ? p.message_ids : []) {
      const mid = String(id).trim()
      if (!mid || seenMsg.has(mid)) continue
      seenMsg.add(mid)
      messageIds.push(mid)
    }
    // Singular message_id from older payloads
    if (typeof p.message_id === 'string' && p.message_id.trim()) {
      const mid = p.message_id.trim()
      if (!seenMsg.has(mid)) {
        seenMsg.add(mid)
        messageIds.push(mid)
      }
    }
    for (const id of Array.isArray(p.email_ids) ? p.email_ids : []) {
      const eid = String(id).trim()
      if (!eid || seenEmail.has(eid)) continue
      seenEmail.add(eid)
      emailIds.push(eid)
    }
    if (typeof p.email_id === 'string' && p.email_id.trim()) {
      const eid = p.email_id.trim()
      if (!seenEmail.has(eid)) {
        seenEmail.add(eid)
        emailIds.push(eid)
      }
    }
  }

  if (!recipients.length && !subject && !messageIds.length) return null
  return { subject, recipients, cc, messageIds, emailIds }
}

function threadingHeaders(messageIds: string[]): Record<string, string> | undefined {
  if (!messageIds.length) return undefined
  const last = messageIds[messageIds.length - 1]!
  return {
    'In-Reply-To': last,
    References: messageIds.join(' '),
  }
}

async function sendEtaHtml(opts: {
  trip: TripStoreRow
  sheet: EtaSheetContext
  recipients: string[]
  cc?: string[]
}): Promise<string[]> {
  const recipients = uniqLower(opts.recipients)
  if (!recipients.length) return []
  const cc = uniqLower(opts.cc ?? []).filter((e) => !recipients.includes(e))

  const email = createEmailAdapter()
  const { sheet, trip } = opts
  const emailIds: string[] = []
  const messageIds: string[] = []
  let subject = ''

  for (const recipient of recipients) {
    const token = createPortalTrackToken({ tripId: trip.id, email: recipient })
    const link = makePortalTrackingLink(token)
    const tpl = buildEtaSheetEmailTemplate({
      trip,
      sheet,
      portalUrl: link,
    })
    const html = renderEtaSheetEmailHtml(tpl)
    const text = renderEtaSheetEmailText(tpl)
    subject = etaSheetEmailSubject({
      poNumber: tpl.poNumber,
      laneShort: tpl.laneShort,
      tail: tpl.tail,
    })

    const sent = await email.send({
      to: recipient,
      cc: cc.length ? cc : undefined,
      subject,
      html,
      text,
    })
    emailIds.push(sent.id)
    if (sent.messageId) messageIds.push(sent.messageId)
  }

  mutateTrip(opts.trip.id, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'eta_sheet_sent',
      payload: {
        recipients,
        cc,
        audience: 'tracker_ops',
        subject,
        email_ids: emailIds,
        message_ids: messageIds,
      },
    })
  })

  return recipients
}

/** Quick Dispatch — pass explicit recipient list (should be tracker/CC, not AP). */
export async function sendQuickDispatchEtaSheetAndPortalLinks(opts: {
  trip: TripStoreRow
  recipients: string[]
}): Promise<{ sentTo: string[] }> {
  const sheet = computeEtaSheetFromBookedTrip(opts.trip, new Date(), {
    clientFacing: true,
  })
  if (!sheet) return { sentTo: [] }
  const sentTo = await sendEtaHtml({
    trip: opts.trip,
    sheet,
    recipients: opts.recipients,
  })
  return { sentTo }
}

/** After hard-quote accept — ETA + track links to tracker/supply-chain emails. */
export async function sendBookedEtaSheetToTrackers(opts: {
  trip: TripStoreRow
  recipients: string[]
  cc?: string[]
}): Promise<{ sentTo: string[] }> {
  const sheet = computeEtaSheetFromBookedTrip(opts.trip, new Date(), {
    clientFacing: true,
  })
  if (!sheet) return { sentTo: [] }
  const sentTo = await sendEtaHtml({
    trip: opts.trip,
    sheet,
    recipients: opts.recipients,
    cc: opts.cc,
  })
  return { sentTo }
}

/** Build a desk-previewable HTML blob for the ETA sheet (same branded template). */
export function buildEtaSheetPreviewHtml(trip: TripStoreRow): string | null {
  const sheet = computeEtaSheetFromBookedTrip(trip, new Date(), {
    clientFacing: true,
  })
  if (!sheet) return null
  const link = portalTrackingUrlForTrip(trip.id)
  const tpl = buildEtaSheetEmailTemplate({
    trip,
    sheet,
    portalUrl: link,
  })
  return renderEtaSheetEmailHtml(tpl)
}

export type ClientTrackingUpdateInput = {
  tripId: string
  /** Dispatch note — ETA change, stop change, or other relay. */
  body: string
  headline?: string
  /** Optional revised timing line shown in the email. */
  etaLine?: string
  /** Override recipients; default = last ETA sheet thread. */
  recipients?: string[]
  cc?: string[]
}

/**
 * Email a client update in the same thread as the ETA sheet (Re: + Message-ID headers).
 */
export async function sendClientTrackingUpdate(
  input: ClientTrackingUpdateInput,
): Promise<{ sentTo: string[]; subject: string }> {
  const trip = getTrip(input.tripId)
  if (!trip) throw new Error('Trip not loaded in this session')
  const body = input.body.trim()
  if (!body) throw new Error('Update message required')

  const thread = getEtaSheetThreadMeta(trip)
  const recipients = uniqLower(
    input.recipients?.length
      ? input.recipients
      : thread?.recipients ?? [],
  )
  if (!recipients.length) {
    throw new Error(
      'No ETA sheet recipients on this trip — send the ETA sheet first, or enter emails.',
    )
  }
  const cc = uniqLower([
    ...(input.cc ?? []),
    ...(thread?.cc ?? []),
  ]).filter((e) => !recipients.includes(e))

  const po =
    trip.po_number?.trim() ||
    trip.quick?.po?.trim() ||
    `T-${trip.ref}`
  const laneShort = fullLaneLabel(trip.lane)
  const tail =
    trip.quick?.tail?.trim() ||
    trip.offers?.find((o) => o.state === 'selected')?.tail?.trim() ||
    'TBD'
  const replySubject = clientTrackingUpdateSubject({
    poNumber: po,
    laneShort,
    tail,
    priorSubject:
      thread?.subject ||
      etaSheetEmailSubject({ poNumber: po, laneShort, tail }),
  })

  const headers = threadingHeaders(thread?.messageIds ?? [])
  const email = createEmailAdapter()
  const emailIds: string[] = []
  const newMessageIds: string[] = []

  for (const recipient of recipients) {
    const token = createPortalTrackToken({ tripId: trip.id, email: recipient })
    const portalUrl = makePortalTrackingLink(token)
    const tpl = {
      poNumber: po,
      laneShort,
      tail,
      body,
      headline: input.headline?.trim() || 'Trip update',
      etaLine: input.etaLine?.trim() || null,
      portalUrl,
    }
    const sent = await email.send({
      to: recipient,
      cc: cc.length ? cc : undefined,
      subject: replySubject,
      html: renderClientTrackingUpdateHtml(tpl),
      text: renderClientTrackingUpdateText(tpl),
      headers,
    })
    emailIds.push(sent.id)
    if (sent.messageId) newMessageIds.push(sent.messageId)
  }

  mutateTrip(trip.id, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'client_tracking_update_sent',
      payload: {
        recipients,
        cc,
        subject: replySubject,
        headline: input.headline?.trim() || 'Trip update',
        eta_line: input.etaLine?.trim() || null,
        body,
        email_ids: emailIds,
        message_ids: newMessageIds,
        prior_message_ids: thread?.messageIds ?? [],
      },
    })
  })

  return { sentTo: recipients, subject: replySubject }
}
