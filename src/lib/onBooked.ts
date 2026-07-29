/**
 * Post-accept automations (minus QuickBooks).
 * Confirm operator + stand-down already happen in offerFlow;
 * this fans out ETA sheet + portal links to ops / supply-chain trackers,
 * and schedules checkpoint check-in timers for the dispatched trip.
 */

import { buildManifestModel, renderManifestHtml } from '@/domain/manifest'
import { listTrackerEmails } from '@/lib/clientStore'
import { scheduleCheckpointsForTrip } from '@/lib/checkpointStore'
import { sendBookedEtaSheetToTrackers } from '@/lib/etaSheetSender'
import {
  addTripDocument,
  getTrip,
  mutateTrip,
  type TripStoreRow,
} from '@/lib/tripStore'

export async function runOnBookedAutomations(
  tripId: string,
  opts?: {
    /** Desk sends ETA from Approved actions panel — skip auto blast. */
    skipEtaEmail?: boolean
  },
): Promise<{
  etaSentTo: string[]
  checkpoints: number
}> {
  const trip = getTrip(tripId)
  if (!trip) return { etaSentTo: [], checkpoints: 0 }

  attachManifestDocument(trip)

  try {
    const { ensureFinancialFromBookedTrip } = await import(
      '@/lib/ensureFinancialFromTrip'
    )
    ensureFinancialFromBookedTrip(trip)
  } catch (e) {
    console.warn('[onBooked] financial ledger upsert failed', e)
  }

  // Timers for T-minus check-ins with pilot / ground / on-shift
  const scheduled = scheduleCheckpointsForTrip(tripId)

  if (opts?.skipEtaEmail) {
    return { etaSentTo: [], checkpoints: scheduled.length }
  }

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
    return { etaSentTo: [], checkpoints: scheduled.length }
  }

  const { sentTo } = await sendBookedEtaSheetToTrackers({
    trip: getTrip(tripId)!,
    recipients,
  })
  return { etaSentTo: sentTo, checkpoints: scheduled.length }
}

function resolveTrackerRecipients(trip: TripStoreRow): string[] {
  const fromClient = trip.client_id ? listTrackerEmails(trip.client_id) : []
  // Quick Dispatch ETA section (bases + supply chain) — not invoice CC
  const fromQuickEta = trip.quick?.eta_emails ?? []
  return [
    ...new Set(
      [...fromClient, ...fromQuickEta].map((e) => e.trim().toLowerCase()),
    ),
  ].filter((e) => e.includes('@'))
}

function attachManifestDocument(trip: TripStoreRow): void {
  if (trip.documents.some((d) => d.kind === 'manifest')) return
  const selected = trip.offers.find((o) => o.state === 'selected')
  const model = buildManifestModel({
    tripRef: trip.ref,
    lane: trip.lane,
    po: trip.quick?.po,
    operatorName:
      selected?.operator_name || trip.quick?.operator_name || 'TBD',
    tail: selected?.tail || trip.quick?.tail || 'TBD',
    typeName:
      selected?.type_name || trip.quick?.aircraft_type || 'TBD',
    pieces: [],
    etaSummary: trip.legs.map((l) => ({
      label: l.label,
      est_end: l.est_end,
    })),
  })
  const html = renderManifestHtml(model)
  const url =
    typeof URL !== 'undefined' && typeof Blob !== 'undefined'
      ? URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      : `/trips/${trip.id}/manifest`
  addTripDocument(trip.id, {
    kind: 'manifest',
    title: `Manifest · T-${trip.ref}`,
    url,
  })
  mutateTrip(trip.id, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'manifest_created',
      payload: { trip_ref: trip.ref },
    })
  })
}
