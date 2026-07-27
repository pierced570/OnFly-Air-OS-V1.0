/**
 * Apply ops risk flags onto trip events, NEEDS-INFO, and Board exceptions.
 * Approve-don't-enter: flags only — never auto-books or drops candidates.
 */

import type { FlightCategory } from '@/domain/flightCategory'
import type { ForkliftLevel } from '@/domain/forkliftHandling'
import {
  airportStopsFromChain,
  buildOpsSheetNotes,
  evaluateAfterHoursFlags,
  evaluateForkliftFlags,
  evaluateWxIfrFlags,
  type OpsFlag,
} from '@/domain/opsFlags'
import { raiseException } from '@/lib/exceptionStore'
import { lookupFboOpsSnap } from '@/lib/fboOpsFees'
import {
  addNeedsInfoTask,
  listOpenNeedsInfo,
} from '@/lib/needsInfoStore'
import { getTrip, mutateTrip, type TripStoreRow } from '@/lib/tripStore'

export type WxBriefLite = {
  icao: string
  flightCat?: FlightCategory | null
  tafWorstCat?: FlightCategory | null
}

function forkliftLevelOf(trip: TripStoreRow): ForkliftLevel {
  if (trip.forklift_required) return 'required'
  if (trip.forklift_recommended) return 'recommended'
  return 'none'
}

function heaviestFromTrip(_trip: TripStoreRow): number | null {
  return null
}

function originDestIcaos(trip: TripStoreRow): {
  origin: string | null
  dest: string | null
} {
  const lane = trip.lane.match(/\b([A-Z0-9]{3,4})\b.*\b([A-Z0-9]{3,4})\b/i)
  if (lane) {
    return {
      origin: lane[1]!.toUpperCase(),
      dest: lane[2]!.toUpperCase(),
    }
  }
  const o = trip.legs[0]?.origin?.toUpperCase() ?? null
  const d =
    trip.legs[trip.legs.length - 1]?.dest?.toUpperCase() ??
    trip.legs[0]?.dest?.toUpperCase() ??
    null
  return { origin: o, dest: d }
}

/** Evaluate after-hours + forklift + optional wx for a trip. */
export function evaluateTripOpsFlags(
  trip: TripStoreRow,
  wxBriefs?: WxBriefLite[],
): OpsFlag[] {
  const flags: OpsFlag[] = []
  const chain = trip.eta_chain ?? []
  if (chain.length) {
    flags.push(
      ...evaluateAfterHoursFlags(airportStopsFromChain(chain), lookupFboOpsSnap),
    )
  } else {
    // No chain yet — still check ready_label / promised if we have ICAOs + times
    const { origin, dest } = originDestIcaos(trip)
    const readyGuess = trip.promised_delivery
    if (origin && readyGuess) {
      flags.push(
        ...evaluateAfterHoursFlags(
          [
            {
              icao: origin,
              atIso: readyGuess,
              tz: null,
              label: 'Ready / promised',
            },
          ],
          lookupFboOpsSnap,
        ),
      )
    }
    if (dest && trip.promised_delivery) {
      flags.push(
        ...evaluateAfterHoursFlags(
          [
            {
              icao: dest,
              atIso: trip.promised_delivery,
              tz: null,
              label: 'Promised delivery',
            },
          ],
          lookupFboOpsSnap,
        ),
      )
    }
  }

  const { origin, dest } = originDestIcaos(trip)
  flags.push(
    ...evaluateForkliftFlags({
      level: forkliftLevelOf(trip),
      heaviestLbs: heaviestFromTrip(trip),
      originIcao: origin,
      destIcao: dest,
      fboByIcao: lookupFboOpsSnap,
    }),
  )

  if (wxBriefs?.length) {
    flags.push(...evaluateWxIfrFlags(wxBriefs))
  }

  return dedupeFlags(flags)
}

function dedupeFlags(flags: OpsFlag[]): OpsFlag[] {
  const seen = new Set<string>()
  const out: OpsFlag[] = []
  for (const f of flags) {
    const key = `${f.code}|${f.icao ?? ''}|${f.field}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out
}

function ensureNeedsInfo(
  trip: TripStoreRow,
  flag: OpsFlag,
): void {
  const open = listOpenNeedsInfo().some(
    (t) =>
      t.entity_type === 'trip' &&
      t.entity_id === trip.id &&
      t.field === flag.field,
  )
  if (open) return
  addNeedsInfoTask({
    entity_type: 'trip',
    entity_id: trip.id,
    entity_label: `T-${trip.ref}`,
    field: flag.field,
    note: `${flag.title} — ${flag.detail}`,
    wizard: null,
  })
}

/**
 * Raise Board exceptions + NEEDS-INFO + append-only trip event.
 * Idempotent for open needs-info fields / matching exception title+detail.
 */
export function applyTripOpsFlags(
  tripId: string,
  wxBriefs?: WxBriefLite[],
): OpsFlag[] {
  const trip = getTrip(tripId)
  if (!trip) return []
  const flags = evaluateTripOpsFlags(trip, wxBriefs)
  if (!flags.length) return flags

  for (const f of flags) {
    ensureNeedsInfo(trip, f)
    raiseException({
      trip_id: trip.id,
      trip_ref: trip.ref,
      title: f.title,
      detail: f.detail,
      severity: f.severity,
      href: `/trips/${trip.id}`,
    })
  }

  mutateTrip(tripId, (t) => {
    const sig = flags.map((f) => f.field).sort().join('|')
    const already = t.events.some(
      (e) =>
        e.kind === 'ops_flags' &&
        (e.payload as { sig?: string }).sig === sig,
    )
    if (already) return
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'ops_flags',
      payload: {
        sig,
        flags: flags.map((f) => ({
          code: f.code,
          icao: f.icao ?? null,
          title: f.title,
          field: f.field,
          severity: f.severity,
        })),
      },
    })
  })

  return flags
}

/** Notes for ETA sheet / hard-quote email from current trip + flags. */
export function tripOpsSheetNotes(
  trip: TripStoreRow,
  flags?: OpsFlag[],
): string[] {
  const chain = trip.eta_chain ?? []
  const hasTruck = chain.some(
    (l) => l.branch === 'truck' || l.type.startsWith('truck'),
  )
  return buildOpsSheetNotes({
    pattern: trip.service_pattern,
    hasTruckLegs: hasTruck,
    forkliftLevel: forkliftLevelOf(trip),
    flags: flags ?? evaluateTripOpsFlags(trip),
  })
}
