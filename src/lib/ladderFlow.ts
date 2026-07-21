/**
 * Ladder flow — request → routed shortlist → offer spool → multi hard quote → accept.
 * All trip state changes go through safeTransitionTrip / trip_transition.
 */

import { createMapsAdapter } from '@/adapters/maps'
import { parseDims } from '@/domain/dimsParser'
import { AIRPORTS, lookupAirport } from '@/domain/airports'
import {
  pickClosestByBand,
  shortlistAircraftIds,
  toBandShortlist,
  type BandShortlist,
} from '@/domain/shortlistBands'
import type { TripRequestRecord } from '@/domain/tripRequest'
import { getClient } from '@/lib/clientStore'
import { fboFeesForAirport } from '@/lib/fboStore'
import { fleetStatusByTail } from '@/lib/fleetRadar'
import { loadFleetForRouting } from '@/lib/fleetRouting'
import { loadPricingPriors, priorRatePerNm } from '@/lib/pricingPriorsStore'
import { loadTaxRates } from '@/lib/taxRatesStore'
import { generateCandidates } from '@/domain/routing'
import {
  buildOffersFromCandidates,
  sendAvailabilityPings,
} from '@/lib/offerFlow'
import {
  createRoutedTripWithShortlist,
  getTrip,
  mutateTrip,
  safeTransitionTrip,
  type TripStoreRow,
} from '@/lib/tripStore'
import { updateRequestStatus } from '@/lib/requestStore'

export { clientTotalForOffer } from '@/lib/offerPricing'
export type { FeeScope } from '@/lib/tripStore'

function resolveAirport(icaoRaw: string) {
  const icao = icaoRaw.trim().toUpperCase()
  return lookupAirport(icao) ?? AIRPORTS[icao] ?? AIRPORTS.KCAK!
}

function payloadKindOfRequest(
  row: TripRequestRecord,
): 'cargo' | 'pax' | 'both' {
  if (row.cargo_only) return 'cargo'
  if (row.pax.length) return row.cargo_notes.trim() ? 'both' : 'pax'
  return 'cargo'
}

/** Create Trip draft→routed with closest piston / turboprop / jet shortlist. */
export async function createRoutedTripFromRequest(
  row: TripRequestRecord,
): Promise<{ trip: TripStoreRow; shortlist: BandShortlist }> {
  const leg = row.legs[0]
  if (!leg?.origin_icao?.trim() || !leg?.dest_icao?.trim()) {
    throw new Error('Origin and destination ICAO are required')
  }

  const originAp = resolveAirport(leg.origin_icao)
  const destAp = resolveAirport(leg.dest_icao)
  const payloadKind = payloadKindOfRequest(row)
  const parsed = parseDims(row.cargo_notes || '', { unit: row.dim_unit })
  const pieces = payloadKind === 'pax' ? [] : parsed.pieces

  if (payloadKind !== 'pax' && !pieces.length) {
    throw new Error(
      'Add cargo dims with weight (e.g. 1 skid 48x40x48 @ 400) before routing',
    )
  }

  const mode =
    row.service_mode === 'mixed'
      ? 'mixed'
      : row.service_mode === 'd2d'
        ? 'd2d'
        : 'a2a'

  const fleet = await loadFleetForRouting()
  if (!fleet.length) throw new Error('No fleet available for routing')

  const maps = createMapsAdapter()
  const radar = await fleetStatusByTail(fleet.map((a) => a.tail))
  const client = row.client_id ? getClient(row.client_id) : undefined
  const originFees = fboFeesForAirport(originAp.icao)
  const destFees = fboFeesForAirport(destAp.icao)
  const [priors] = await Promise.all([loadPricingPriors(), loadTaxRates()])

  const candidates = await generateCandidates(
    {
      mode,
      payload_kind: payloadKind,
      pieces,
      pax_count: row.pax.length,
      hazmat: row.hazmat,
      ready_at: row.ready_at,
      client_rules: client?.rules,
      origin: {
        kind: mode === 'a2a' ? 'airport' : 'address',
        text: leg.pickup_address || originAp.icao,
        icao: originAp.icao,
        lat: originAp.lat,
        lon: originAp.lon,
        tz: originAp.tz,
      },
      destination: {
        kind: mode === 'a2a' ? 'airport' : 'address',
        text: leg.dropoff_address || destAp.icao,
        icao: destAp.icao,
        lat: destAp.lat,
        lon: destAp.lon,
        tz: destAp.tz,
      },
      shipper:
        mode !== 'a2a'
          ? { lat: originAp.lat, lon: originAp.lon, tz: originAp.tz }
          : undefined,
      consignee:
        mode !== 'a2a'
          ? { lat: destAp.lat, lon: destAp.lon, tz: destAp.tz }
          : undefined,
    },
    fleet,
    maps,
    {
      fleetStatusByTail: radar,
      fboFees: {
        origin: originFees.fee,
        dest: destFees.fee,
        notes: [...originFees.reasoning, ...destFees.reasoning],
      },
      pickMode: 'all',
      priorRatePerNm: (typeName, operatorId) =>
        priorRatePerNm(typeName, operatorId, priors),
    },
  )

  const meta = new Map(
    fleet.map((a) => [
      a.id,
      {
        aircraft_id: a.id,
        category: a.category,
        engines: a.engines,
        type_name: a.type_name,
      },
    ]),
  )
  const picks = pickClosestByBand(candidates, meta)
  const shortlist = toBandShortlist(picks)
  const ids = shortlistAircraftIds(shortlist)
  const picked =
    ids.length > 0
      ? candidates.filter((c) => ids.includes(c.aircraft_id))
      : candidates.slice(0, 3)

  const trip = createRoutedTripWithShortlist({
    request_id: row.id,
    client_id: row.client_id || undefined,
    lane: row.lane,
    payload_summary: row.summary,
    ready_label: row.timing === 'asap' ? 'ASAP' : row.ready_at.slice(0, 16),
    payload_kind: payloadKind,
    candidates: picked.length > 0 ? picked : candidates.slice(0, 1),
    shortlist,
    po_number: row.po_number || undefined,
    declared_value_usd:
      row.declared_value_usd === '' ? null : row.declared_value_usd,
    hard_deadline_at: row.hard_deadline_at || null,
    forklift_recommended: row.forklift_recommended,
    forklift_required: row.forklift_required,
  })

  updateRequestStatus(row.id, 'in_review')
  return { trip, shortlist }
}

/** Approve shortlist → quoted_estimated → offers_out + availability pings. */
export async function approveShortlistAndSpoolOffers(
  tripId: string,
  aircraftIds?: string[],
): Promise<TripStoreRow | null> {
  const trip = getTrip(tripId)
  if (!trip) return null

  const ids =
    aircraftIds && aircraftIds.length > 0
      ? aircraftIds
      : shortlistAircraftIds(
          trip.shortlist ?? { piston: null, turboprop: null, jet: null },
        )
  const pool = trip.candidates.filter((c) => ids.includes(c.aircraft_id))
  const use = pool.length > 0 ? pool : trip.candidates.slice(0, 3)
  if (use.length === 0) return trip

  if (trip.state === 'routed') {
    safeTransitionTrip(tripId, 'quoted_estimated', 'dispatcher', {
      reason: 'Shortlist approved — preparing trip offers',
    })
  }

  const offers = buildOffersFromCandidates(tripId, use)
  mutateTrip(tripId, (t) => {
    t.offers = offers
  })

  const cur = getTrip(tripId)!
  if (cur.state === 'quoted_estimated') {
    safeTransitionTrip(tripId, 'offers_out', 'dispatcher', {
      reason: 'Spooling trip offers to shortlist',
      offer_count: offers.length,
    })
  }

  await sendAvailabilityPings(tripId)
  return getTrip(tripId)
}
