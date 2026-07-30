/**
 * Build the portal soft-pricing package for a trip request.
 * Uses network doors + historical /NM + optional Claude guidelines.
 */

import { createLlmAdapter } from '@/adapters/llm'
import { AIRPORTS, lookupAirport } from '@/domain/airports'
import { piecesHaveWeights } from '@/domain/dimsParser'
import { haversineNm } from '@/domain/geo'
import {
  buildSoftPricingPackage,
  classifyToSoftClass,
  mockSoftPricingGuidelines,
  softPricingClaudePrompt,
  type SoftFleetRow,
  type SoftPricingClass,
  type SoftPricingPackage,
} from '@/domain/softPricing'
import { cargoPiecesFromDraft, type TripRequestRecord } from '@/domain/tripRequest'
import { loadNetwork } from '@/lib/networkData'
import { loadPricingPriors, priorRatePerNm } from '@/lib/pricingPriorsStore'

export type SoftPricingPackageResult = SoftPricingPackage & {
  request_id: string
  request_ref: number
  error?: string
}

export async function buildSoftPricingForRequest(
  row: TripRequestRecord,
  opts?: { withClaude?: boolean },
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

  const payloadKind = row.cargo_only
    ? 'cargo'
    : row.pax.length
      ? row.cargo_notes.trim()
        ? 'both'
        : 'pax'
      : 'cargo'

  const pieces = payloadKind === 'pax' ? [] : cargoPiecesFromDraft(row)
  if (payloadKind !== 'pax' && !pieces.length) {
    return emptyPackage(
      row,
      'Add cargo dims (e.g. 1 skid 48x40x48 @ 400) so we can explain what fits which class.',
    )
  }
  if (payloadKind !== 'pax' && !piecesHaveWeights(pieces)) {
    return emptyPackage(
      row,
      'Cargo weight is required on every piece (lb each) before we can estimate.',
    )
  }

  const live_nm = Math.round(
    haversineNm(origin.lat, origin.lon, dest.lat, dest.lon),
  )

  const [net, priors] = await Promise.all([
    loadNetwork(),
    loadPricingPriors(),
  ])

  const fleet: SoftFleetRow[] = net.aircraft.map((a) => {
    const spec = a.type_name
      ? net.type_specs.find(
          (s) => String(s.type_name ?? '') === a.type_name,
        )
      : undefined
    const doorW =
      a.door_w_in ??
      (spec?.door_w_in != null ? Number(spec.door_w_in) : null)
    const doorH =
      a.door_h_in ??
      (spec?.door_h_in != null ? Number(spec.door_h_in) : null)
    const payload =
      a.max_payload_lbs ??
      (spec?.max_payload_lbs != null ? Number(spec.max_payload_lbs) : null)
    return {
      type_name: a.type_name,
      category: a.category,
      engines: a.engines,
      cargo_pax: a.cargo_pax,
      cruise_kts:
        a.cruise_kts ??
        (spec?.cruise_kts != null ? Number(spec.cruise_kts) : null),
      door_w_in: doorW,
      door_h_in: doorH,
      max_payload_lbs: payload,
      avg_op_per_nm_circuit: a.avg_op_per_nm_circuit ?? null,
      med_assumed_op_per_nm: a.med_assumed_op_per_nm ?? null,
      trips_logged: null,
    }
  })

  const priorRateByClass: Partial<Record<SoftPricingClass, number | null>> = {}
  for (const a of fleet) {
    const cls = classifyToSoftClass(a)
    if (!cls || !a.type_name) continue
    if (priorRateByClass[cls] != null) continue
    const p = priorRatePerNm(a.type_name, null, priors)
    if (p != null) priorRateByClass[cls] = p
  }

  let pkg = buildSoftPricingPackage({
    origin_icao: origin.icao,
    dest_icao: dest.icao,
    live_nm,
    pieces,
    fleet,
    priorRateByClass,
  })

  const withClaude = opts?.withClaude !== false
  if (withClaude) {
    try {
      const llm = createLlmAdapter()
      const prompt = softPricingClaudePrompt(pkg)
      const text = await llm.explainSoftPricing(prompt)
      pkg = {
        ...pkg,
        claude_guidelines: text?.trim() || mockSoftPricingGuidelines(pkg),
      }
    } catch {
      pkg = {
        ...pkg,
        claude_guidelines: mockSoftPricingGuidelines(pkg),
      }
    }
  } else {
    pkg = {
      ...pkg,
      claude_guidelines: mockSoftPricingGuidelines(pkg),
    }
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
    live_nm: 0,
    classes: [],
    fit_summary: '',
    pricing_logic_overview: '',
    disclaimer:
      'This is not the actual price — this is an estimate based on what we believe will fit and what historical data shows. Every mission is unique as aircraft are constantly changing distances from your pickup point.',
    claude_guidelines: null,
    error,
  }
}
