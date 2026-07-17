import { createEmailAdapter } from '@/adapters/email'
import type { TripStoreRow } from '@/lib/tripStore'
import { mutateTrip } from '@/lib/tripStore'
import {
  computeEtaSheetFromBookedTrip,
  type EtaSheetContext,
} from '@/lib/etaSheet'
import { createPortalTrackToken } from '@/lib/portalTrackStore'

function makePortalTrackingLink(token: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/portal/track/${token}`
  }
  return `/portal/track/${token}`
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
}): Promise<string[]> {
  const recipients = uniqLower(opts.recipients)
  if (!recipients.length) return []

  const email = createEmailAdapter()
  const { sheet, trip } = opts

  for (const recipient of recipients) {
    const token = createPortalTrackToken({ tripId: trip.id, email: recipient })
    const link = makePortalTrackingLink(token)
    const etaRows = sheet.lines
      .map(
        (l) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:600">${l.leg_label}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${l.pickup_location}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${l.pickup_time_zulu}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${l.where_going}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${l.arrive_time_zulu}</td>
          </tr>
        `,
      )
      .join('')

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:#111827">
        <h2 style="margin:0 0 10px 0">OnFly Air — ETA sheet</h2>
        <p style="margin:0 0 12px 0">
          Tail <b>${sheet.tail}</b> · PO ${sheet.po} · ${sheet.operator_name || 'operator'} · ${sheet.aircraft_type || ''}
        </p>
        <p style="margin:0 0 12px 0">
          Tracking portal: <a href="${link}">${link}</a>
        </p>
        <table style="width:100%; border-collapse:collapse; font-size:13px">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Leg</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Pickup</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Pickup time</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Going to</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Arrive</th>
            </tr>
          </thead>
          <tbody>${etaRows}</tbody>
        </table>
        <p style="margin:14px 0 0 0; color:#6b7280; font-size:12px">
          Ops / supply-chain copy. Invoice goes separately to AP when QuickBooks is wired.
        </p>
      </div>
    `

    await email.send({
      to: recipient,
      subject: `OnFly ETA — ${sheet.tail} · PO ${sheet.po}`,
      html,
      text: `OnFly ETA sheet\nTail ${sheet.tail}\nPO ${sheet.po}\nTrack: ${link}\n`,
    })
  }

  mutateTrip(opts.trip.id, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'eta_sheet_sent',
      payload: { recipients, audience: 'tracker_ops' },
    })
  })

  return recipients
}

/** Quick Dispatch — pass explicit recipient list (should be tracker/CC, not AP). */
export async function sendQuickDispatchEtaSheetAndPortalLinks(opts: {
  trip: TripStoreRow
  recipients: string[]
}): Promise<{ sentTo: string[] }> {
  const sheet = computeEtaSheetFromBookedTrip(opts.trip)
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
}): Promise<{ sentTo: string[] }> {
  const sheet = computeEtaSheetFromBookedTrip(opts.trip)
  if (!sheet) return { sentTo: [] }
  const sentTo = await sendEtaHtml({
    trip: opts.trip,
    sheet,
    recipients: opts.recipients,
  })
  return { sentTo }
}
