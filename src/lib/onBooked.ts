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

export async function runOnBookedAutomations(tripId: string): Promise<{
  etaSentTo: string[]
  checkpoints: number
}> {
  const trip = getTrip(tripId)
  if (!trip) return { etaSentTo: [], checkpoints: 0 }

  attachManifestDocument(trip)

  // Timers for T-minus check-ins with pilot / ground / on-shift
  const scheduled = scheduleCheckpointsForTrip(tripId)

  // T-3h / T-1h WX briefs from air-leg EST
  void import('@/lib/wxBriefSchedule').then((m) =>
    m.scheduleWxBriefsForTrip(tripId),
  )

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
  // Quick-dispatch CC list is ops/supply-chain by convention
  const fromQuickCc = trip.quick?.cc_emails ?? []
  return [...new Set([...fromClient, ...fromQuickCc].map((e) => e.trim().toLowerCase()))].filter(
    (e) => e.includes('@'),
  )
}

function attachManifestDocument(trip: TripStoreRow): void {
  if (trip.documents.some((d) => d.kind === 'manifest')) return
  const selected = trip.offers.find((o) => o.state === 'selected')
  const pieces = piecesFromTrip(trip)
  const model = buildManifestModel({
    tripRef: trip.ref,
    lane: trip.lane,
    po: trip.quick?.po,
    operatorName:
      selected?.operator_name || trip.quick?.operator_name || 'TBD',
    tail: selected?.tail || trip.quick?.tail || 'TBD',
    typeName:
      selected?.type_name || trip.quick?.aircraft_type || 'TBD',
    pieces,
    etaSummary: trip.legs.map((l) => ({
      label: l.label,
      est_end: l.est_end,
    })),
  })
  const html = renderManifestHtml(model)
  const url = `/trips/${trip.id}/manifest`
  addTripDocument(trip.id, {
    kind: 'manifest',
    title: `Manifest · T-${trip.ref}`,
    url,
  })
  // Keep HTML available for print page via sessionStorage
  try {
    sessionStorage.setItem(`onfly.manifest.${trip.id}`, html)
  } catch {
    /* ignore */
  }
  mutateTrip(trip.id, (t) => {
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'manifest_created',
      payload: { trip_ref: trip.ref, pieces: pieces.length },
    })
  })
}

function piecesFromTrip(trip: TripStoreRow): Array<{
  count: number
  length_in: number
  width_in: number
  height_in: number
  weight_lbs: number
  stackable?: boolean
}> {
  // Prefer pieces stashed on selected candidate / session when present
  const cand = trip.candidates[0] as { pieces?: unknown } | undefined
  const raw = Array.isArray(cand?.pieces) ? cand!.pieces : []
  const out: Array<{
    count: number
    length_in: number
    width_in: number
    height_in: number
    weight_lbs: number
    stackable?: boolean
  }> = []
  for (const p of raw as Array<Record<string, unknown>>) {
    out.push({
      count: Number(p.count ?? p.qty ?? 1) || 1,
      length_in: Number(p.l_in ?? p.length_in ?? 0) || 0,
      width_in: Number(p.w_in ?? p.width_in ?? 0) || 0,
      height_in: Number(p.h_in ?? p.height_in ?? 0) || 0,
      weight_lbs: Number(p.weight_lbs ?? p.wt ?? 0) || 0,
      stackable: p.stackable !== false,
    })
  }
  return out
}
