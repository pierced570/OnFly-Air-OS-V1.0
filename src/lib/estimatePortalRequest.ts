/**
 * Run instant estimated quotes for a portal trip request (client-safe bands).
 */

import { createMapsAdapter, resolveDoorLatLon } from '@/adapters/maps'
import { piecesHaveWeights } from '@/domain/dimsParser'
import { AIRPORTS, lookupAirport } from '@/domain/airports'
import {
  buildPortalEstimates,
  type AircraftMetaForPortal,
  type PortalEstimateBundle,
} from '@/domain/portalEstimate'
import { generateCandidates } from '@/domain/routing'
import { cargoPiecesFromDraft, draftPayloadKind } from '@/domain/tripRequest'
import { loadPricingPriors, priorRatePerNm } from '@/lib/pricingPriorsStore'
import { BUILTIN_RECOMMEND_MATRIX } from '@/domain/recommendMatrix'
import { getTaxRates, loadTaxRates } from '@/lib/taxRatesStore'
import type { TripRequestRecord } from '@/domain/tripRequest'
import { clientRulesForRouting, getClient } from '@/lib/clientStore'
import { fboFeesForAirport } from '@/lib/fboStore'
import { fleetStatusByTail } from '@/lib/fleetRadar'
import { loadFleetForRouting } from '@/lib/fleetRouting'

export type PortalRequestEstimate = PortalEstimateBundle & {
  request_id: string
  request_ref: number
  error?: string
}

export async function estimatePortalRequest(
  row: TripRequestRecord,
): Promise<PortalRequestEstimate> {
  const leg = row.legs[0]
  if (!leg?.origin_icao?.trim() || !leg?.dest_icao?.trim()) {
    return emptyBundle(row, 'Origin and destination airports are required for an estimate.')
  }

  const originAp = resolveAirportLocal(leg.origin_icao)
  const destAp = resolveAirportLocal(leg.dest_icao)
  if (originAp.icao === destAp.icao && leg.origin_icao !== leg.dest_icao) {
    return emptyBundle(
      row,
      `Could not resolve airports (“${leg.origin_icao}” / “${leg.dest_icao}”).`,
    )
  }

  const payloadKind = draftPayloadKind(row)

  const parsedPieces = cargoPiecesFromDraft(row)
  const pieces = payloadKind === 'pax' ? [] : parsedPieces

  if (payloadKind !== 'pax' && !pieces.length) {
    return emptyBundle(
      row,
      'Add cargo dims (e.g. 1 skid 48x40x48 @ 400) so we can size piston / turboprop / jet options.',
    )
  }
  if (payloadKind !== 'pax' && !piecesHaveWeights(pieces)) {
    return emptyBundle(
      row,
      'Cargo weight is required on every piece (lb each) before we can estimate.',
    )
  }

  const mode =
    row.service_mode === 'mixed'
      ? 'mixed'
      : row.service_mode === 'd2d'
        ? 'd2d'
        : 'a2a'

  const fleet = await loadFleetForRouting()
  if (!fleet.length) {
    return emptyBundle(row, 'No fleet available for an estimate right now.')
  }

  const maps = createMapsAdapter()
  const radar = await fleetStatusByTail(fleet.map((a) => a.tail))
  const client = row.client_id ? getClient(row.client_id) : undefined
  const originFees = fboFeesForAirport(originAp.icao)
  const destFees = fboFeesForAirport(destAp.icao)

  try {
    const [priors] = await Promise.all([loadPricingPriors(), loadTaxRates()])
    const doorShipper =
      mode !== 'a2a'
        ? await resolveDoorLatLon(
            maps,
            leg.pickup_address,
            originAp.lat,
            originAp.lon,
            originAp.tz,
          )
        : undefined
    const doorConsignee =
      mode !== 'a2a'
        ? await resolveDoorLatLon(
            maps,
            leg.dropoff_address,
            destAp.lat,
            destAp.lon,
            destAp.tz,
          )
        : undefined
    const candidates = await generateCandidates(
      {
        mode,
        payload_kind: payloadKind,
        pieces,
        pax_count: row.pax.length,
        hazmat: row.hazmat,
        ready_at: row.ready_at,
        client_rules: clientRulesForRouting(client, payloadKind),
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
        shipper: doorShipper,
        consignee: doorConsignee,
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
        matrix: BUILTIN_RECOMMEND_MATRIX,
        pickMode: 'all',
        priorRatePerNm: (typeName, operatorId) =>
          priorRatePerNm(typeName, operatorId, priors),
      },
    )

    if (!candidates.length) {
      return emptyBundle(
        row,
        'No aircraft cleared door/payload filters for this cargo — request a hard quote and dispatch will size it.',
      )
    }

    const meta: AircraftMetaForPortal[] = fleet.map((a) => ({
      aircraft_id: a.id,
      category: a.category,
      engines: a.engines,
      type_name: a.type_name,
      mtow_lbs: a.mtow_lbs,
    }))

    const bundle = buildPortalEstimates(candidates, meta, {
      payloadKind,
      paxCount: row.pax.length,
      rates: getTaxRates(),
    })

    return {
      ...bundle,
      request_id: row.id,
      request_ref: row.ref,
    }
  } catch (e) {
    return emptyBundle(
      row,
      e instanceof Error ? e.message : String(e),
    )
  }
}

function resolveAirportLocal(icaoRaw: string) {
  const icao = icaoRaw.trim().toUpperCase()
  return lookupAirport(icao) ?? AIRPORTS[icao] ?? AIRPORTS.KCAK!
}

function emptyBundle(
  row: TripRequestRecord,
  error: string,
): PortalRequestEstimate {
  return {
    request_id: row.id,
    request_ref: row.ref,
    options: [],
    closest_blurb: '',
    disclaimer:
      'Estimated quote from OnFly data — not a hard quote. Times and price are planning assumptions until operators confirm.',
    candidate_count: 0,
    error,
  }
}
