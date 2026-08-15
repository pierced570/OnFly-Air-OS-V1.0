/**
 * Flag intl cargo trips that still need a House Air Waybill created.
 */

import { awbCreationNeeded } from '@/domain/awbFlag'
import { raiseException } from '@/lib/exceptionStore'
import { addNeedsInfoTask, listNeedsInfoTasks } from '@/lib/needsInfoStore'
import {
  getTrip,
  mutateTrip,
  payloadKindOf,
  type TripStoreRow,
} from '@/lib/tripStore'

function originDestOf(trip: TripStoreRow): {
  origin: string | null
  dest: string | null
} {
  const air = trip.legs.find((l) => l.type === 'air_leg' && l.origin && l.dest)
  if (air?.origin && air.dest) {
    return { origin: air.origin, dest: air.dest }
  }
  const q = trip.quick?.legs?.[0]
  if (q?.origin_icao && q.dest_icao) {
    return { origin: q.origin_icao, dest: q.dest_icao }
  }
  return { origin: null, dest: null }
}

export function tripNeedsAwb(trip: TripStoreRow): boolean {
  if (trip.awb_cleared_at) return false
  if (trip.awb_needed) return true
  const { origin, dest } = originDestOf(trip)
  return awbCreationNeeded({
    payload_kind: payloadKindOf(trip),
    origin_icao: origin,
    dest_icao: dest,
    lane: trip.lane,
  })
}

/**
 * When sending / booking an intl cargo trip, raise AWB flag once.
 * Idempotent — safe to call on every ping send.
 */
export function flagAwbIfNeeded(tripId: string): boolean {
  const trip = getTrip(tripId)
  if (!trip) return false
  if (trip.awb_cleared_at) return false
  if (trip.awb_needed) return true

  const { origin, dest } = originDestOf(trip)
  const needed = awbCreationNeeded({
    payload_kind: payloadKindOf(trip),
    origin_icao: origin,
    dest_icao: dest,
    lane: trip.lane,
  })
  if (!needed) return false

  mutateTrip(tripId, (t) => {
    t.awb_needed = true
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'awb_flagged',
      payload: {
        lane: t.lane,
        origin,
        dest,
        reason: 'international_cargo',
      },
    })
  })

  const label = `T-${trip.ref} ${trip.lane}`
  const already = listNeedsInfoTasks().some(
    (task) =>
      task.status === 'open' &&
      task.entity_type === 'trip' &&
      task.entity_id === tripId &&
      task.field === 'awb',
  )
  if (!already) {
    addNeedsInfoTask({
      entity_type: 'trip',
      entity_id: tripId,
      entity_label: label,
      field: 'awb',
      note: 'INTL cargo — create House Air Waybill (HAWB)',
      wizard: null,
    })
  }

  raiseException({
    trip_id: tripId,
    trip_ref: trip.ref,
    title: 'AWB needed',
    detail: `${label} · international cargo — create HAWB`,
    severity: 'attn',
    href: `/trips/${tripId}`,
  })

  return true
}

/** Desk marks AWB created / handled. */
export function clearAwbFlag(tripId: string, actor = 'dispatcher'): void {
  const trip = getTrip(tripId)
  if (!trip) return
  mutateTrip(tripId, (t) => {
    t.awb_needed = false
    t.awb_cleared_at = new Date().toISOString()
    t.events.push({
      at: new Date().toISOString(),
      actor,
      kind: 'awb_cleared',
      payload: { lane: t.lane },
    })
  })
}
