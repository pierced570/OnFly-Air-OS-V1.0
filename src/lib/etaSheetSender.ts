import { createEmailAdapter } from '@/adapters/email'
import { absoluteAppUrl } from '@/lib/appUrl'
import type { TripStoreRow } from '@/lib/tripStore'
import { mutateTrip } from '@/lib/tripStore'
import {
  computeEtaSheetFromBookedTrip,
  type EtaSheetContext,
} from '@/lib/etaSheet'
import { createPortalTrackToken } from '@/lib/portalTrackStore'

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
    const etaRows = sheet.lines
      .map(
        (l) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:600">${l.leg_label}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${l.pickup_location}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,monospace">${l.pickup_time_zulu}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${l.where_going}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,monospace">${l.arrive_time_zulu}</td>
          </tr>
        `,
      )
      .join('')

    const typeBit = sheet.aircraft_type
      ? ` · ${sheet.aircraft_type}`
      : ''
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:#111827">
        <h2 style="margin:0 0 10px 0">OnFly Air — ETA sheet</h2>
        <p style="margin:0 0 12px 0">
          Tail <b style="font-family:ui-monospace,monospace">${sheet.tail || 'TBD'}</b>${typeBit}
          ${sheet.po ? ` · PO <b style="font-family:ui-monospace,monospace">${sheet.po}</b>` : ''}
        </p>
        <p style="margin:0 0 12px 0">
          Live tracking (ADS-B): <a href="${link}">${link}</a>
        </p>
        <table style="width:100%; border-collapse:collapse; font-size:13px">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">Leg</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">From</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">ETD</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">To</th>
              <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb">ETA</th>
            </tr>
          </thead>
          <tbody>${etaRows}</tbody>
        </table>
        <p style="margin:14px 0 0 0; color:#6b7280; font-size:12px">
          Trip timing only — no payment details on this sheet.
        </p>
      </div>
    `

    await email.send({
      to: recipient,
      cc: cc.length ? cc : undefined,
      subject: `OnFly ETA — ${sheet.tail || 'trip'}${sheet.po ? ` · PO ${sheet.po}` : ''}`,
      html,
      text: [
        'OnFly ETA sheet',
        `Tail ${sheet.tail || 'TBD'}`,
        sheet.po ? `PO ${sheet.po}` : null,
        `Track: ${link}`,
        '',
        ...sheet.lines.map(
          (l) =>
            `${l.leg_label}: ${l.pickup_location} ${l.pickup_time_zulu} → ${l.where_going} ${l.arrive_time_zulu}`,
        ),
      ]
        .filter(Boolean)
        .join('\n'),
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

/** Build a desk-previewable HTML blob URL for the ETA sheet. */
export function buildEtaSheetPreviewHtml(trip: TripStoreRow): string | null {
  const sheet = computeEtaSheetFromBookedTrip(trip, new Date(), {
    clientFacing: true,
  })
  if (!sheet) return null
  const link = portalTrackingUrlForTrip(trip.id)
  const rows = sheet.lines
    .map(
      (l) =>
        `<tr><td>${l.leg_label}</td><td>${l.pickup_location}</td><td>${l.pickup_time_zulu}</td><td>${l.where_going}</td><td>${l.arrive_time_zulu}</td></tr>`,
    )
    .join('')
  return `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px;background:#f7f2e3;color:#0c0c0e">
    <h1>OnFly Air — ETA sheet</h1>
    <p>Tail <b>${sheet.tail || 'TBD'}</b>${sheet.aircraft_type ? ` · ${sheet.aircraft_type}` : ''}${sheet.po ? ` · PO <b>${sheet.po}</b>` : ''}</p>
    <p>Live tracking: <a href="${link}">${link}</a></p>
    <table cellpadding="8" style="border-collapse:collapse;width:100%">
      <thead><tr><th align="left">Leg</th><th align="left">From</th><th align="left">ETD</th><th align="left">To</th><th align="left">ETA</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#6b6560;font-size:13px">Trip timing only — no payment details.</p>
  </body></html>`
}
