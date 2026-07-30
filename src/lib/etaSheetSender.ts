import { createEmailAdapter } from '@/adapters/email'
import {
  etaSheetEmailSubject,
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
import { mutateTrip } from '@/lib/tripStore'

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

    await email.send({
      to: recipient,
      cc: cc.length ? cc : undefined,
      subject: etaSheetEmailSubject({
        poNumber: tpl.poNumber,
        laneShort: tpl.laneShort,
        tail: tpl.tail,
      }),
      html,
      text,
    })
  }

  mutateTrip(opts.trip.id, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'eta_sheet_sent',
      payload: { recipients, cc, audience: 'tracker_ops' },
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
