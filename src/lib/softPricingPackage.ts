/**
 * Build the portal soft-pricing package for a trip request.
 * Network doors + hourly class bands + static guidelines (no LLM).
 */

import { AIRPORTS, lookupAirport } from '@/domain/airports'
import { piecesHaveWeights } from '@/domain/dimsParser'
import { haversineNm } from '@/domain/geo'
import {
  buildSoftPricingPackage,
  mockSoftPricingGuidelines,
  SOFT_PRICING_DISCLAIMER,
  type SoftFleetRow,
} from '@/domain/softPricing'
import {
  cargoPiecesFromDraft,
  draftDimsAssumedSmall,
  draftPayloadKind,
  foldPerLegPayloadIntoDraft,
  type TripRequestRecord,
} from '@/domain/tripRequest'
import { loadNetwork } from '@/lib/networkData'

export type SoftPricingPackageResult = import('@/domain/softPricing').SoftPricingPackage & {
  request_id: string
  request_ref: number
  error?: string
}

export async function buildSoftPricingForRequest(
  row: TripRequestRecord,
): Promise<SoftPricingPackageResult> {
  const leg = row.legs[0]
  if (!leg?.origin_icao?.trim() || !leg?.dest_icao?.trim()) {
    return emptyPackage(row, 'Origin and destination airports are required.')
  }

  const origin = resolveAirport(leg.origin_icao)
  const dest = resolveAirport(leg.dest_icao)
  if (origin.icao === dest.icao && leg.origin_icao !== leg.dest_icao) {
    return emptyPackage(
      row,
      `Could not resolve airports (“${leg.origin_icao}” / “${leg.dest_icao}”).`,
    )
  }

  const payloadKind = draftPayloadKind(row)

  const pieces = payloadKind === 'pax' ? [] : cargoPiecesFromDraft(row)
  const dimsAssumed = draftDimsAssumedSmall(foldPerLegPayloadIntoDraft(row))
  if (payloadKind !== 'pax' && !pieces.length) {
    return emptyPackage(
      row,
      'Add cargo dims (e.g. 1 skid 48x40x48 @ 400) so we can explain what fits which class — or tap Not yet to ballpark every class.',
    )
  }
  if (payloadKind !== 'pax' && !dimsAssumed && !piecesHaveWeights(pieces)) {
    return emptyPackage(
      row,
      'Cargo weight is required on every piece (lb each) before we can estimate.',
    )
  }

  const live_nm = Math.round(
    haversineNm(origin.lat, origin.lon, dest.lat, dest.lon),
  )

  const net = await loadNetwork()
  const fleet: SoftFleetRow[] = net.aircraft.map((a) => {
    const spec = a.type_name
      ? net.type_specs.find(
          (s) => String(s.type_name ?? '') === a.type_name,
        )
      : undefined
    return {
      type_name: a.type_name,
      category: a.category,
      engines: a.engines,
      cargo_pax: a.cargo_pax,
      cruise_kts:
        a.cruise_kts ??
        (spec?.cruise_kts != null ? Number(spec.cruise_kts) : null),
      door_w_in:
        a.door_w_in ??
        (spec?.door_w_in != null ? Number(spec.door_w_in) : null),
      door_h_in:
        a.door_h_in ??
        (spec?.door_h_in != null ? Number(spec.door_h_in) : null),
      max_payload_lbs:
        a.max_payload_lbs ??
        (spec?.max_payload_lbs != null ? Number(spec.max_payload_lbs) : null),
      avg_op_per_nm_circuit: a.avg_op_per_nm_circuit ?? null,
      med_assumed_op_per_nm: a.med_assumed_op_per_nm ?? null,
      trips_logged: null,
    }
  })

  const ready_asap =
    /asap|aog|hot/i.test(row.summary || '') ||
    Boolean(row.ready_at && Date.parse(row.ready_at) - Date.now() < 4 * 3600_000)

  let pkg = buildSoftPricingPackage({
    origin_icao: origin.icao,
    dest_icao: dest.icao,
    live_nm,
    pieces,
    fleet,
    ready_asap,
    dims_assumed_small: dimsAssumed,
  })

  pkg = {
    ...pkg,
    guidelines: mockSoftPricingGuidelines(pkg),
  }

  return {
    ...pkg,
    request_id: row.id,
    request_ref: row.ref,
  }
}

function resolveAirport(icaoRaw: string) {
  const icao = icaoRaw.trim().toUpperCase()
  return lookupAirport(icao) ?? AIRPORTS[icao] ?? AIRPORTS.KCAK!
}

function emptyPackage(
  row: TripRequestRecord,
  error: string,
): SoftPricingPackageResult {
  return {
    request_id: row.id,
    request_ref: row.ref,
    origin_icao: '',
    dest_icao: '',
    origin_display: '',
    dest_display: '',
    live_nm: 0,
    cargo_badges: [],
    ready_asap: false,
    classes: [],
    door_rows: [],
    fit_summary: '',
    pricing_logic_overview: '',
    math_cards: [],
    disclaimer: SOFT_PRICING_DISCLAIMER,
    guidelines: null,
    error,
  }
}
