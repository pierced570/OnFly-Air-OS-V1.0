/**
 * Route & pricing engine — flag-don't-exclude.
 * Pure TS; consumes fleet + trip snapshots.
 */

import type { Piece } from '@/domain/dimsParser'
import { maxPieceDims, totalWeightLbs } from '@/domain/dimsParser'
import {
  buildChain,
  type ChainLeg,
  type RoutingForChain,
  DEFAULT_LEG_DEFAULTS,
} from '@/domain/etaChain'
import type { MapsAdapter } from '@/adapters/maps'
import { haversineNm } from '@/domain/geo'
import type { LatLon } from '@/adapters/maps'
import {
  radarRankPenalty,
  type FleetStatus,
  type RestChip,
} from '@/domain/fleetStatus'

export type ClientRules = {
  dual_pilot_required?: boolean
  freight_only?: boolean
  multi_engine_only?: boolean
  single_engine_turboprop_only?: boolean
  no_single_engine_night?: boolean
  hazmat_allowed?: boolean
}

export type AircraftCandidateSource = {
  id: string
  operator_id: string
  operator_name: string
  usefulness?: number | null
  tail: string
  type_name: string | null
  category: string | null
  engines: string | null
  cargo_pax: string | null
  seats: number | null
  base_icao: string | null
  base?: LatLon & { icao?: string; tz?: string }
  cruise_kts: number | null
  range_nm: number | null
  max_payload_lbs: number | null
  mtow_lbs: number | null
  door_w_in: number | null
  door_h_in: number | null
  crew: string | null
  insurance_expiry?: string | null
  rate_per_nm?: number | null
  rate_source?: 'block_rate' | 'history' | 'assumption' | null
}

export type AirportRef = LatLon & { icao: string; tz: string; name?: string }

export type TripForRouting = {
  mode: 'a2a' | 'd2d' | 'mixed'
  payload_kind: 'cargo' | 'pax' | 'both'
  pieces: Piece[]
  pax_count: number | null
  hazmat: boolean
  ready_at: string // UTC
  origin: AirportRef & { kind: 'address' | 'airport'; text?: string }
  destination: AirportRef & { kind: 'address' | 'airport'; text?: string }
  shipper?: LatLon & { tz?: string }
  consignee?: LatLon & { tz?: string }
  client_rules?: ClientRules
}

export type Candidate = {
  operator_id: string
  operator_name: string
  aircraft_id: string
  tail: string
  type_name: string | null
  cost: number
  price: number
  chain: ChainLeg[]
  confidence: number
  needsInfo: string[]
  bookingGated: boolean
  reasoning: string[]
  label?: 'cheapest' | 'fastest' | 'best'
  eta_end: string
  circuit_nm: number
  /** Advisory ADS-B rest / position chips */
  rest?: RestChip
  inPosition?: boolean
  laddBlocked?: boolean
}

export const PRICING_CONSTANTS = {
  truckPerMile: 3.5,
  truckMin: 150,
  targetMargin: 0.15,
  payloadFactor: 0.85,
  reserveNmEquiv: 45, // ~45 min reserve as NM at typical cruise — applied as +45 NM
  nearestAirports: 3,
  airportRadiusMi: 60,
}

function doorFits(
  doorW: number | null,
  doorH: number | null,
  piece: { l_in: number; w_in: number; h_in: number },
): boolean | null {
  if (doorW == null || doorH == null) return null
  const dims = [piece.l_in, piece.w_in, piece.h_in].sort((a, b) => a - b)
  // Try face fits (two smallest through door) + diagonal allowance 1.05
  const faces: Array<[number, number]> = [
    [dims[0]!, dims[1]!],
    [dims[0]!, dims[2]!],
    [dims[1]!, dims[2]!],
  ]
  for (const [a, b] of faces) {
    if (a <= doorW * 1.05 && b <= doorH * 1.05) return true
    if (a <= doorH * 1.05 && b <= doorW * 1.05) return true
  }
  return false
}

function isMultiEngine(engines: string | null): boolean {
  if (!engines) return false
  return /multi/i.test(engines)
}

function isTurboprop(engines: string | null, category: string | null): boolean {
  const s = `${engines ?? ''} ${category ?? ''}`
  return /turbo/i.test(s)
}

function isSingleEngine(engines: string | null): boolean {
  if (!engines) return false
  return /single/i.test(engines) && !/multi/i.test(engines)
}

export async function generateCandidates(
  trip: TripForRouting,
  fleet: AircraftCandidateSource[],
  maps: MapsAdapter,
  opts?: {
    targetMargin?: number
    /** Optional radar statuses keyed by tail — boosts rested + in-position */
    fleetStatusByTail?: Map<string, FleetStatus>
  },
): Promise<Candidate[]> {
  const margin = opts?.targetMargin ?? PRICING_CONSTANTS.targetMargin
  const pieces = trip.pieces
  const weight = totalWeightLbs(pieces)
  const maxDims = maxPieceDims(pieces)
  const origin = trip.origin
  const dest = trip.destination
  const results: Candidate[] = []
  const radar = opts?.fleetStatusByTail

  for (const ac of fleet) {
    const needsInfo: string[] = []
    const reasoning: string[] = []
    let confidence = 1
    let hardFail = false
    let bookingGated = false
    const status = radar?.get(ac.tail)

    // cargo/pax match
    if (trip.payload_kind === 'cargo' && ac.cargo_pax && /pax only/i.test(ac.cargo_pax)) {
      hardFail = true
    }
    if (trip.payload_kind === 'pax' && ac.cargo_pax && /cargo only/i.test(ac.cargo_pax)) {
      hardFail = true
    }

    // client rules
    const rules = trip.client_rules ?? {}
    if (rules.freight_only && trip.payload_kind === 'pax') hardFail = true
    if (rules.multi_engine_only && !isMultiEngine(ac.engines)) {
      if (ac.engines == null) {
        needsInfo.push('engines')
        confidence -= 0.15
      } else hardFail = true
    }
    if (rules.single_engine_turboprop_only) {
      if (!isSingleEngine(ac.engines) || !isTurboprop(ac.engines, ac.category)) {
        if (!ac.engines) {
          needsInfo.push('engines')
          confidence -= 0.15
        } else hardFail = true
      }
    }
    if (rules.dual_pilot_required) {
      if (ac.crew && /single/i.test(ac.crew) && !/dual/i.test(ac.crew)) hardFail = true
      if (!ac.crew) {
        needsInfo.push('crew')
        confidence -= 0.1
      }
    }
    if (trip.hazmat && rules.hazmat_allowed === false) hardFail = true

    // door
    if (trip.payload_kind !== 'pax' && pieces.length) {
      const fit = doorFits(ac.door_w_in, ac.door_h_in, maxDims)
      if (fit === false) hardFail = true
      if (fit === null) {
        needsInfo.push('door dims')
        confidence -= 0.2
      }
    }

    // payload
    const avail =
      ac.max_payload_lbs != null
        ? ac.max_payload_lbs * PRICING_CONSTANTS.payloadFactor
        : null
    if (avail != null && weight > avail) hardFail = true
    if (avail == null && weight > 0) {
      needsInfo.push('payload')
      confidence -= 0.2
    }

    // base / range
    if (!ac.base && !ac.base_icao) {
      needsInfo.push('base')
      confidence -= 0.25
    }

    const base: LatLon & { icao?: string; tz?: string } = ac.base ?? {
      lat: origin.lat,
      lon: origin.lon,
      icao: ac.base_icao ?? undefined,
      tz: origin.tz,
    }

    const legNm = haversineNm(origin.lat, origin.lon, dest.lat, dest.lon)
    const posNm = haversineNm(base.lat, base.lon, origin.lat, origin.lon)
    const circuitNm = posNm + legNm + legNm * 0.05 // small repo fudge
    if (ac.range_nm != null && circuitNm + PRICING_CONSTANTS.reserveNmEquiv > ac.range_nm) {
      hardFail = true
    }
    if (ac.range_nm == null) {
      needsInfo.push('range')
      confidence -= 0.1
    }

    // insurance
    if (ac.insurance_expiry) {
      const exp = new Date(ac.insurance_expiry)
      if (exp.getTime() < Date.now()) {
        bookingGated = true
        needsInfo.push('insurance expired')
        reasoning.push('insurance expired — ping OK, booking gated')
      }
    } else {
      bookingGated = true
      needsInfo.push('insurance')
    }

    if (hardFail) continue

    const rate =
      ac.rate_per_nm ??
      (ac.type_name?.match(/King Air/i) ? 12 : ac.type_name?.match(/310/i) ? 9 : 11)
    if (ac.rate_per_nm == null) {
      needsInfo.push('rate assumption')
      confidence -= 0.05
      reasoning.push(`assumed $${rate}/NM (${ac.rate_source ?? 'assumption'})`)
    } else {
      reasoning.push(`rate $${rate}/NM (${ac.rate_source ?? 'file'})`)
    }

    const opCost = circuitNm * rate
    let truckCost = 0
    if ((trip.mode === 'd2d' || trip.mode === 'mixed') && trip.shipper && trip.consignee) {
      const m1 = await maps.driveMiles(trip.shipper, origin)
      const m2 = await maps.driveMiles(dest, trip.consignee)
      truckCost =
        Math.max(PRICING_CONSTANTS.truckMin, m1 * PRICING_CONSTANTS.truckPerMile) +
        Math.max(PRICING_CONSTANTS.truckMin, m2 * PRICING_CONSTANTS.truckPerMile)
    }
    const cost = Math.round((opCost + truckCost) * 100) / 100
    const price = Math.round((cost / (1 - margin)) * 100) / 100

    if (ac.base_icao) {
      const nmFromOrigin = haversineNm(base.lat, base.lon, origin.lat, origin.lon)
      reasoning.push(
        `closest capable: based ${ac.base_icao} ${Math.round(nmFromOrigin)} NM from origin`,
      )
    }

    if (status) {
      if (status.laddBlocked) {
        reasoning.push('ADS-B LADD / no data — rest unknown')
      } else {
        if (status.rest === 'likely_rested') {
          confidence += 0.05
          reasoning.push('radar: likely rested (advisory)')
        } else if (status.rest === 'rest_clock_running') {
          confidence -= 0.05
          reasoning.push('radar: rest clock running (advisory)')
        }
        if (status.inPositionOfBase) {
          confidence += 0.08
          reasoning.push(
            `radar: in-position near base${status.nmFromBase != null ? ` (${status.nmFromBase.toFixed(0)} NM)` : ''}`,
          )
        }
      }
    }

    const routing: RoutingForChain = {
      originAirport: origin,
      destAirport: dest,
      aircraftBase: base,
      cruiseKts: ac.cruise_kts ?? 250,
      shipper: trip.shipper,
      consignee: trip.consignee,
      readyAtUtc: trip.ready_at,
      mode: trip.mode,
    }
    const chain = await buildChain(routing, maps, DEFAULT_LEG_DEFAULTS)
    const eta_end = chain[chain.length - 1]?.est_end ?? trip.ready_at

    results.push({
      operator_id: ac.operator_id,
      operator_name: ac.operator_name,
      aircraft_id: ac.id,
      tail: ac.tail,
      type_name: ac.type_name,
      cost,
      price,
      chain,
      confidence: Math.max(0.1, Math.min(1, confidence)),
      needsInfo: [...new Set(needsInfo)],
      bookingGated,
      reasoning,
      eta_end,
      circuit_nm: Math.round(circuitNm),
      rest: status?.rest,
      inPosition: status?.inPositionOfBase,
      laddBlocked: status?.laddBlocked,
    })
  }

  // Rank + label top options
  const byPrice = [...results].sort((a, b) => a.price - b.price)
  const byTime = [...results].sort(
    (a, b) => new Date(a.eta_end).getTime() - new Date(b.eta_end).getTime(),
  )
  const byBest = [...results].sort((a, b) => {
    const score = (c: Candidate) => {
      const priceRank = byPrice.indexOf(c)
      const timeRank = byTime.indexOf(c)
      const st = radar?.get(c.tail)
      const radarPen = radarRankPenalty(st)
      return 0.45 * priceRank + 0.3 * timeRank + 0.25 * radarPen
    }
    return score(a) - score(b)
  })

  const picked: Candidate[] = []
  const add = (c: Candidate | undefined, label: Candidate['label']) => {
    if (!c) return
    if (picked.some((p) => p.aircraft_id === c.aircraft_id)) return
    picked.push({ ...c, label })
  }
  add(byPrice[0], 'cheapest')
  add(byTime[0], 'fastest')
  add(byBest[0], 'best')
  for (const c of byBest) {
    if (picked.length >= 5) break
    add(c, undefined)
  }

  return picked
}
