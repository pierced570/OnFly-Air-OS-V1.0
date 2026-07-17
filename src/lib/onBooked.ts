/**
 * Post-accept automations (minus QuickBooks).
 * Confirm operator + stand-down already happen in offerFlow;
 * this fans out ETA sheet + portal links to ops / supply-chain trackers.
 */

import { listTrackerEmails } from '@/lib/clientStore'
import { sendBookedEtaSheetToTrackers } from '@/lib/etaSheetSender'
import { getTrip, mutateTrip, type TripStoreRow } from '@/lib/tripStore'

export async function runOnBookedAutomations(tripId: string): Promise<{
  etaSentTo: string[]
}> {
  const trip = getTrip(tripId)
  if (!trip) return { etaSentTo: [] }

  const recipients = resolveTrackerRecipients(trip)
  if (!recipients.length) {
    mutateTrip(tripId, (t) => {
      t.events.push({
        at: new Date().toISOString(),
        actor: 'system',
        kind: 'eta_sheet_skipped',
        payload: {
          reason: 'no tracker/supply_chain emails on client',
          client_id: t.client_id ?? null,
        },
      })
    })
    return { etaSentTo: [] }
  }

  const { sentTo } = await sendBookedEtaSheetToTrackers({
    trip,
    recipients,
  })
  return { etaSentTo: sentTo }
}

function resolveTrackerRecipients(trip: TripStoreRow): string[] {
  const fromClient = trip.client_id ? listTrackerEmails(trip.client_id) : []
  // Quick-dispatch CC list is ops/supply-chain by convention
  const fromQuickCc = trip.quick?.cc_emails ?? []
  return [...new Set([...fromClient, ...fromQuickCc].map((e) => e.trim().toLowerCase()))].filter(
    (e) => e.includes('@'),
  )
}
