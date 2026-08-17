/**
 * Commit high-confidence ADS-B actual_off / actual_on into trip.eta_chain.
 * Idempotent — skips stamps already set. Logs trip_events with undo path.
 */

import type { AdsbPosition } from '@/adapters/adsb'
import {
  adsbUpdatesForChain,
  proposeAdsbActuals,
} from '@/domain/adsbActuals'
import { applyActual } from '@/domain/etaChain'
import { applyChainToLegs } from '@/domain/tripLegs'
import {
  getTrip,
  mutateTrip,
  type TripStoreRow,
} from '@/lib/tripStore'

function airAirports(trip: TripStoreRow): {
  from: string | null
  to: string | null
} {
  const air = trip.eta_chain.find((l) => l.type === 'air_leg')
  if (air) {
    return {
      from: air.from.icao ?? null,
      to: air.to.icao ?? null,
    }
  }
  const leg = trip.legs.find((l) => l.type === 'air_leg')
  return {
    from: leg?.origin ?? null,
    to: leg?.dest ?? null,
  }
}

export function applyAdsbActualsToTrip(
  tripId: string,
  adsb: AdsbPosition | null | undefined,
  opts?: { nowIso?: string },
): { applied: boolean; updates: number } {
  const trip = getTrip(tripId)
  if (!trip) return { applied: false, updates: 0 }
  if (!trip.eta_chain.length) return { applied: false, updates: 0 }
  if (
    trip.state !== 'in_progress' &&
    trip.state !== 'booked' &&
    trip.state !== 'delivered'
  ) {
    return { applied: false, updates: 0 }
  }

  const { from, to } = airAirports(trip)
  const proposal = proposeAdsbActuals({
    adsb,
    airFromIcao: from,
    airToIcao: to,
    nowIso: opts?.nowIso,
  })
  const updates = adsbUpdatesForChain(trip.eta_chain, proposal)
  if (!updates.length) return { applied: false, updates: 0 }

  mutateTrip(tripId, (t) => {
    let chain = t.eta_chain
    let slipped = 0
    for (const u of updates) {
      const r = applyActual(chain, u)
      chain = r.chain
      slipped += r.slippedMinutes
    }
    t.eta_chain = chain
    if (t.legs.length) {
      t.legs = applyChainToLegs(t.legs, chain) as typeof t.legs
    }
    t.events.push({
      at: opts?.nowIso ?? new Date().toISOString(),
      actor: 'system',
      kind: 'adsb_actual_applied',
      payload: {
        tail: adsb?.tail ?? t.quick?.tail ?? null,
        updates,
        slipped_min: slipped,
        origin_arrival: proposal.originArrivalAt,
        takeoff: proposal.takeoffAt,
        dest_landing: proposal.destLandingAt,
        air_time_min: proposal.airTimeMin,
        undo: true,
      },
    })
  })

  void import('@/lib/db/persistTrip').then((m) => {
    const fresh = getTrip(tripId)
    if (fresh) void m.persistTripSnapshot(fresh).catch(() => {})
  })

  void import('@/lib/allTimeInfoStore')
    .then((m) => {
      const takeoff = proposal.takeoffAt
      const landing = proposal.destLandingAt
      m.logAllTimeEvent({
        kind: 'adsb_actual',
        trip_id: tripId,
        trip_code: getTrip(tripId)?.code ?? null,
        summary: `ADS-B actuals · ${adsb?.tail ?? 'tail?'} · up ${takeoff ?? '—'} · down ${landing ?? '—'}`,
        payload: {
          updates: updates.length,
          takeoff,
          landing,
          air_time_min: proposal.airTimeMin,
        },
        at: opts?.nowIso,
      })
      const fresh = getTrip(tripId)
      if (fresh) m.syncTripToAllTime(fresh)
    })
    .catch(() => {})

  return { applied: true, updates: updates.length }
}

/** Poll ADS-B for active trip tails and commit actuals. */
export async function refreshAdsbActualsForLiveTrips(
  trips: TripStoreRow[],
): Promise<number> {
  const live = trips.filter(
    (t) =>
      (t.state === 'in_progress' || t.state === 'booked') &&
      (t.quick?.tail || t.offers.find((o) => o.state === 'selected')?.tail),
  )
  if (!live.length) return 0

  const tails = [
    ...new Set(
      live
        .map(
          (t) =>
            t.quick?.tail ||
            t.offers.find((o) => o.state === 'selected')?.tail ||
            '',
        )
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean),
    ),
  ]
  if (!tails.length) return 0

  const { createAdsbAdapter } = await import('@/adapters/adsb')
  const positions = await createAdsbAdapter().positions(tails)
  const byTail = new Map(positions.map((p) => [p.tail.toUpperCase(), p]))
  let applied = 0
  for (const trip of live) {
    const tail = (
      trip.quick?.tail ||
      trip.offers.find((o) => o.state === 'selected')?.tail ||
      ''
    )
      .trim()
      .toUpperCase()
    const pos = byTail.get(tail)
    if (!pos) continue
    const r = applyAdsbActualsToTrip(trip.id, pos)
    if (r.applied) applied += 1
  }
  return applied
}
