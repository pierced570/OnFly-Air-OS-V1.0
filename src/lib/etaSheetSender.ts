import { createEmailAdapter } from '@/adapters/email'
import type { TripStoreRow } from '@/lib/tripStore'
import { mutateTrip } from '@/lib/tripStore'
import { computeEtaSheetLinesFromQuick } from '@/lib/etaSheet'
import { createPortalTrackToken } from '@/lib/portalTrackStore'

function makePortalTrackingLink(token: string): string {
  // Use absolute URL when available (for email clients), fall back to relative.
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

export async function sendQuickDispatchEtaSheetAndPortalLinks(opts: {
  trip: TripStoreRow
  recipients: string[]
}): Promise<{ sentTo: string[] }> {
  const quick = opts.trip.quick
  if (!quick) return { sentTo: [] }

  const recipients = uniqLower(opts.recipients)
  if (recipients.length === 0) return { sentTo: [] }

  const lines = computeEtaSheetLinesFromQuick(quick)
  const tail = quick.tail

  const email = createEmailAdapter()

  for (const recipient of recipients) {
    const token = createPortalTrackToken({ tripId: opts.trip.id, email: recipient })
    const link = makePortalTrackingLink(token)

    const etaRows = lines
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
          Tail <b>${tail}</b> · PO ${quick.po} · ${quick.operator_name || 'operator'} · ${quick.aircraft_type || ''}
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
          Demo/session-only ETA. Real ETA feed + RLS magic-link auth ship in later chunks.
        </p>
      </div>
    `

    const text = `OnFly ETA sheet (demo)\nTail ${tail}\nPO ${quick.po}\n\nTrack here: ${link}\n`
    await email.send({
      to: recipient,
      subject: `OnFly ETA — ${tail} · PO ${quick.po}`,
      html,
      text,
    })
  }

  mutateTrip(opts.trip.id, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'eta_sheet_sent',
      payload: { recipients },
    })
  })

  return { sentTo: recipients }
}

