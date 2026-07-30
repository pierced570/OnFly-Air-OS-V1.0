/**
 * Soft pricing package — client-facing ballpark when they ask
 * "what can this possibly cost?"
 *
 * Pure TypeScript. No React / Supabase.
 *
 * Timing model (planning assumptions, not a hard quote):
 *   - Repo to position: fixed 2.5 hr
 *   - Live leg: great-circle NM ÷ class average ground speed → hrs+mins
 *   - Home: same distance as live, plus 1.0 hr
 *
 * Never expose operator names, tails, margins, or raw cost.
 */

import { doorFitsPiece, type DoorFit } from '@/domain/missionFit'
import {
  classifyAircraftVertical,
  type VerticalId,
} from '@/domain/operatorVerticals'
import type { Piece } from '@/domain/dimsParser'
import { maxPieceDims, totalWeightLbs } from '@/domain/dimsParser'
import { priceFromMargin } from '@/domain/quote'
import { BUILTIN_RECOMMEND_MATRIX } from '@/domain/recommendMatrix'

const DEFAULT_SOFT_MARGIN_PCT = BUILTIN_RECOMMEND_MATRIX.target_margin_pct

/** Fixed reposition assumption for soft quotes. */
export const SOFT_REPO_HOURS = 2.5

/** Extra time added to the return/home leg beyond same-distance flight. */
export const SOFT_HOME_EXTRA_HOURS = 1

export const SOFT_PRICING_DISCLAIMER =
  'This is not the actual price — this is an estimate based on what we believe will fit and what historical data shows. Every mission is unique as aircraft are constantly changing distances from your pickup point.'

export const SOFT_PRICING_CLASSES = [
  'single_engine',
  'twin_piston',
  'turboprop',
  'light_jet',
  'midsize',
  'heavy_freight',
] as const

export type SoftPricingClass = (typeof SOFT_PRICING_CLASSES)[number]

export type SoftClassProfile = {
  id: SoftPricingClass
  label: string
  /** Average planning ground speed (kts) for live/home ETE. */
  avg_gs_kts: number
  /** Example type names shown to the client for the GS average. */
  example_types: string[]
  /** Assumed operator $/NM when no history/prior is available. */
  default_rate_per_nm: number
  /** Typical cargo door (in) for fit education when network lacks dims. */
  typical_door_w_in: number
  typical_door_h_in: number
  /** Short payload guideline for the class. */
  payload_guideline: string
}

export const SOFT_CLASS_PROFILES: Record<SoftPricingClass, SoftClassProfile> = {
  single_engine: {
    id: 'single_engine',
    label: 'Single engine',
    avg_gs_kts: 145,
    example_types: ['Cessna 208 Caravan', 'Cessna 206', 'Piper Saratoga'],
    default_rate_per_nm: 8.5,
    typical_door_w_in: 49,
    typical_door_h_in: 50,
    payload_guideline: 'Often ~1,500–2,500 lb useful with careful CG.',
  },
  twin_piston: {
    id: 'twin_piston',
    label: 'Twin piston',
    avg_gs_kts: 180,
    example_types: ['Beech Baron', 'Cessna 310 / 414', 'Piper Navajo'],
    default_rate_per_nm: 9.5,
    typical_door_w_in: 36,
    typical_door_h_in: 45,
    payload_guideline: 'Often ~1,200–2,000 lb; doors are usually smaller.',
  },
  turboprop: {
    id: 'turboprop',
    label: 'Turboprop',
    avg_gs_kts: 270,
    example_types: ['King Air 200 / 350', 'Pilatus PC-12', 'Metroliner'],
    default_rate_per_nm: 12,
    typical_door_w_in: 52,
    typical_door_h_in: 52,
    payload_guideline: 'Workhorse freight band — often ~2,500–4,500 lb.',
  },
  light_jet: {
    id: 'light_jet',
    label: 'Light jet',
    avg_gs_kts: 400,
    example_types: ['Citation CJ3 / CJ4', 'Phenom 300', 'Learjet 45'],
    default_rate_per_nm: 16,
    typical_door_w_in: 30,
    typical_door_h_in: 36,
    payload_guideline: 'Faster for time-critical; doors/payload often tighter.',
  },
  midsize: {
    id: 'midsize',
    label: 'Midsize',
    avg_gs_kts: 430,
    example_types: ['Citation XLS+', 'Hawker 800XP', 'Learjet 60'],
    default_rate_per_nm: 22,
    typical_door_w_in: 33,
    typical_door_h_in: 36,
    payload_guideline: 'More range/cabin; still not a freighter door.',
  },
  heavy_freight: {
    id: 'heavy_freight',
    label: 'Heavy freight',
    avg_gs_kts: 420,
    example_types: ['737 freighter', 'CRJ freighter', 'ATR 72 cargo'],
    default_rate_per_nm: 28,
    typical_door_w_in: 86,
    typical_door_h_in: 70,
    payload_guideline: 'Large doors and multi-thousand-lb payloads.',
  },
}

export function verticalToSoftClass(v: VerticalId): SoftPricingClass | null {
  if (v === 'sep') return 'single_engine'
  if (v === 'mep') return 'twin_piston'
  if (v === 'setp' || v === 'metp') return 'turboprop'
  if (v === 'vlj_light') return 'light_jet'
  if (v === 'mid_heavy') return 'midsize'
  if (v === 'cargo') return 'heavy_freight'
  return null
}

export function classifyToSoftClass(ac: {
  category: string | null
  engines: string | null
  type_name: string | null
  cargo_pax?: string | null
}): SoftPricingClass | null {
  return verticalToSoftClass(classifyAircraftVertical(ac))
}

/** Minutes → "2 hr 15 min" (exact soft-pricing display). */
export function formatHoursMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m === 0) return '0 min'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} min`
  if (r === 0) return h === 1 ? '1 hr' : `${h} hr`
  return `${h} hr ${r} min`
}

/** Live / home flight minutes from NM and GS (no taxi pad — soft planning). */
export function flightMinutesFromNmGs(nm: number, gsKts: number): number {
  const gs = gsKts > 0 ? gsKts : 200
  const n = Math.max(0, nm)
  return Math.round((n / gs) * 60)
}

export type SoftLegTiming = {
  repo_min: number
  live_min: number
  home_min: number
  total_block_min: number
  live_nm: number
  home_nm: number
  /** NM attributed to the fixed 2.5 hr repo at class GS (for $/NM math). */
  repo_nm: number
  circuit_nm: number
  avg_gs_kts: number
}

export function buildSoftLegTiming(
  liveNm: number,
  avgGsKts: number,
): SoftLegTiming {
  const gs = avgGsKts > 0 ? avgGsKts : 200
  const live_nm = Math.max(0, Math.round(liveNm))
  const home_nm = live_nm
  const live_min = flightMinutesFromNmGs(live_nm, gs)
  const home_min = live_min + Math.round(SOFT_HOME_EXTRA_HOURS * 60)
  const repo_min = Math.round(SOFT_REPO_HOURS * 60)
  const repo_nm = Math.round(SOFT_REPO_HOURS * gs)
  const circuit_nm = repo_nm + live_nm + home_nm
  return {
    repo_min,
    live_min,
    home_min,
    total_block_min: repo_min + live_min + home_min,
    live_nm,
    home_nm,
    repo_nm,
    circuit_nm,
    avg_gs_kts: gs,
  }
}

export type SoftDoorExample = {
  /** Never expose tail on portal — type only. */
  type_name: string
  door_w_in: number
  door_h_in: number
  fit: DoorFit
}

export type SoftCargoFitSummary = {
  fit: DoorFit
  explanation: string
  largest_piece_label: string
  weight_lbs: number
  door_examples: SoftDoorExample[]
  payload_note: string
}

export type SoftHistoryHint = {
  /** Client-safe: type name only. */
  type_name: string
  trips_logged: number | null
  avg_rate_per_nm: number | null
  rate_source: 'history' | 'prior' | 'assumption'
}

export type SoftClassQuote = {
  class_id: SoftPricingClass
  label: string
  /** Client air estimate (margin applied); never show operator cost. */
  air_estimate: number
  rate_per_nm: number
  rate_source: 'history' | 'prior' | 'assumption'
  timing: SoftLegTiming
  timing_blurb: string
  example_types: string[]
  gs_blurb: string
  fit: SoftCargoFitSummary
  history: SoftHistoryHint[]
  pricing_logic: string
  /** Whether this class is recommended for the cargo. */
  recommended: boolean
}

export type SoftPricingPackage = {
  origin_icao: string
  dest_icao: string
  live_nm: number
  classes: SoftClassQuote[]
  /** Classes that clear door/payload (or unknown). */
  fit_summary: string
  pricing_logic_overview: string
  disclaimer: string
  /** Optional Claude narrative (guidelines / plain English). */
  claude_guidelines: string | null
}

export type SoftFleetRow = {
  type_name: string | null
  category: string | null
  engines: string | null
  cargo_pax?: string | null
  cruise_kts?: number | null
  door_w_in: number | null
  door_h_in: number | null
  max_payload_lbs: number | null
  avg_op_per_nm_circuit?: number | null
  med_assumed_op_per_nm?: number | null
  trips_logged?: number | null
}

function largestPieceLabel(pieces: Piece[]): string {
  if (!pieces.length) return 'no cargo pieces'
  const d = maxPieceDims(pieces)
  const w = totalWeightLbs(pieces)
  return `${Math.round(d.l_in)}×${Math.round(d.w_in)}×${Math.round(d.h_in)} in · ${Math.round(w)} lb total`
}

export function summarizeCargoFitForClass(
  profile: SoftClassProfile,
  pieces: Piece[],
  fleet: SoftFleetRow[],
): SoftCargoFitSummary {
  const weight = totalWeightLbs(pieces)
  const maxDims = pieces.length
    ? maxPieceDims(pieces)
    : { l_in: 0, w_in: 0, h_in: 0 }
  const classFleet = fleet.filter(
    (a) => classifyToSoftClass(a) === profile.id,
  )

  const door_examples: SoftDoorExample[] = []
  const seen = new Set<string>()
  for (const a of classFleet) {
    if (a.door_w_in == null || a.door_h_in == null) continue
    const type = (a.type_name ?? 'Aircraft').trim()
    const key = `${type}|${a.door_w_in}x${a.door_h_in}`
    if (seen.has(key)) continue
    seen.add(key)
    const fit =
      pieces.length > 0
        ? doorFitsPiece(a.door_w_in, a.door_h_in, maxDims)
        : 'unknown'
    door_examples.push({
      type_name: type,
      door_w_in: a.door_w_in,
      door_h_in: a.door_h_in,
      fit,
    })
    if (door_examples.length >= 4) break
  }

  // Fallback typical door when network has no dims for the class
  if (!door_examples.length && pieces.length > 0) {
    door_examples.push({
      type_name: profile.example_types[0] ?? profile.label,
      door_w_in: profile.typical_door_w_in,
      door_h_in: profile.typical_door_h_in,
      fit: doorFitsPiece(
        profile.typical_door_w_in,
        profile.typical_door_h_in,
        maxDims,
      ),
    })
  }

  let fit: DoorFit = 'unknown'
  if (pieces.length === 0) fit = 'unknown'
  else if (door_examples.some((d) => d.fit === 'fits')) fit = 'fits'
  else if (
    door_examples.length > 0 &&
    door_examples.every((d) => d.fit === 'no_fit')
  ) {
    fit = 'no_fit'
  } else {
    // Try typical door
    fit = doorFitsPiece(
      profile.typical_door_w_in,
      profile.typical_door_h_in,
      maxDims,
    )
  }

  let explanation: string
  if (!pieces.length) {
    explanation =
      'No cargo dims yet — we show class guidelines until pieces are entered.'
  } else if (fit === 'fits') {
    explanation = `Your largest piece (${largestPieceLabel(pieces)}) clears typical ${profile.label.toLowerCase()} cargo doors in our network sample.`
  } else if (fit === 'no_fit') {
    explanation = `Your largest piece (${largestPieceLabel(pieces)}) likely will not fit ${profile.label.toLowerCase()} doors we see on the network — consider a larger door class.`
  } else {
    explanation = `Door dims are incomplete for some ${profile.label.toLowerCase()} types — we flag NEEDS-INFO rather than dropping the class.`
  }

  return {
    fit,
    explanation,
    largest_piece_label: largestPieceLabel(pieces),
    weight_lbs: weight,
    door_examples,
    payload_note: profile.payload_guideline,
  }
}

function pickRateForClass(
  profile: SoftClassProfile,
  fleet: SoftFleetRow[],
  priorRate?: number | null,
): { rate_per_nm: number; rate_source: SoftClassQuote['rate_source']; history: SoftHistoryHint[] } {
  const classFleet = fleet.filter(
    (a) => classifyToSoftClass(a) === profile.id,
  )
  const history: SoftHistoryHint[] = []
  let histSum = 0
  let histN = 0
  for (const a of classFleet) {
    const type = (a.type_name ?? '').trim()
    if (!type) continue
    const avg =
      a.avg_op_per_nm_circuit != null && Number.isFinite(a.avg_op_per_nm_circuit)
        ? a.avg_op_per_nm_circuit
        : null
    if (avg != null) {
      histSum += avg
      histN += 1
    }
    if (history.length < 3) {
      history.push({
        type_name: type,
        trips_logged:
          a.trips_logged != null && Number.isFinite(a.trips_logged)
            ? a.trips_logged
            : null,
        avg_rate_per_nm: avg,
        rate_source: avg != null ? 'history' : 'assumption',
      })
    }
  }

  if (histN > 0) {
    return {
      rate_per_nm: histSum / histN,
      rate_source: 'history',
      history,
    }
  }
  if (priorRate != null && priorRate > 0) {
    return {
      rate_per_nm: priorRate,
      rate_source: 'prior',
      history,
    }
  }
  return {
    rate_per_nm: profile.default_rate_per_nm,
    rate_source: 'assumption',
    history,
  }
}

function classPricingLogic(
  profile: SoftClassProfile,
  timing: SoftLegTiming,
  rate: number,
  air: number,
): string {
  return [
    `We assume a ${SOFT_REPO_HOURS} hr repo to get an aircraft into position (≈${timing.repo_nm} NM at ${timing.avg_gs_kts} kt avg GS — examples: ${profile.example_types.slice(0, 2).join(', ')}).`,
    `Live leg ${timing.live_nm} NM ÷ ${timing.avg_gs_kts} kt ≈ ${formatHoursMinutes(timing.live_min)}.`,
    `Home assumes the same ${timing.home_nm} NM plus ${SOFT_HOME_EXTRA_HOURS} hr → ${formatHoursMinutes(timing.home_min)}.`,
    `Circuit ≈ ${timing.circuit_nm} NM × ~$${rate.toFixed(1)}/NM from historical trip averages (or class assumption) → about $${Math.round(air).toLocaleString('en-US')} estimated air (before tax).`,
  ].join(' ')
}

export function buildSoftPricingPackage(input: {
  origin_icao: string
  dest_icao: string
  live_nm: number
  pieces: Piece[]
  fleet: SoftFleetRow[]
  /** Optional prior $/NM by soft class id. */
  priorRateByClass?: Partial<Record<SoftPricingClass, number | null>>
  margin?: number
  claude_guidelines?: string | null
}): SoftPricingPackage {
  const marginPct = input.margin ?? DEFAULT_SOFT_MARGIN_PCT
  const live_nm = Math.max(0, Math.round(input.live_nm))
  const classes: SoftClassQuote[] = []

  for (const id of SOFT_PRICING_CLASSES) {
    const profile = SOFT_CLASS_PROFILES[id]
    const timing = buildSoftLegTiming(live_nm, profile.avg_gs_kts)
    const { rate_per_nm, rate_source, history } = pickRateForClass(
      profile,
      input.fleet,
      input.priorRateByClass?.[id],
    )
    const opCost = timing.circuit_nm * rate_per_nm
    const air_estimate = priceFromMargin(opCost, marginPct)
    const fit = summarizeCargoFitForClass(profile, input.pieces, input.fleet)
    const recommended = fit.fit === 'fits' || fit.fit === 'unknown'

    classes.push({
      class_id: id,
      label: profile.label,
      air_estimate,
      rate_per_nm,
      rate_source,
      timing,
      timing_blurb: `Repo ${formatHoursMinutes(timing.repo_min)} · live ${formatHoursMinutes(timing.live_min)} (${timing.live_nm} NM @ ${timing.avg_gs_kts} kt) · home ${formatHoursMinutes(timing.home_min)}`,
      example_types: profile.example_types,
      gs_blurb: `Average planning GS ${timing.avg_gs_kts} kt (examples: ${profile.example_types.join(', ')})`,
      fit,
      history,
      pricing_logic: classPricingLogic(profile, timing, rate_per_nm, air_estimate),
      recommended,
    })
  }

  const fitLabels = classes
    .filter((c) => c.fit.fit === 'fits')
    .map((c) => c.label.toLowerCase())
  let fit_summary =
    'We show every class with door/payload guidance — flag, don’t exclude.'
  if (fitLabels.length === 1) {
    fit_summary = `Based on cargo dims/doors, this most clearly fits a ${fitLabels[0]}.`
  } else if (fitLabels.length > 1) {
    fit_summary = `Based on cargo dims/doors, this can fit: ${fitLabels.join(', ')}.`
  } else if (input.pieces.length) {
    fit_summary =
      'Door samples suggest a tight or unknown fit — request a hard quote so dispatch can verify.'
  }

  return {
    origin_icao: input.origin_icao.toUpperCase(),
    dest_icao: input.dest_icao.toUpperCase(),
    live_nm,
    classes,
    fit_summary,
    pricing_logic_overview: [
      `Soft quote timing: ${SOFT_REPO_HOURS} hr repo to position, live leg = distance ÷ class average ground speed, home ≈ same distance plus ${SOFT_HOME_EXTRA_HOURS} hr.`,
      'Price uses historical /NM from prior trips and network type data when available, otherwise class assumptions — never a locked hard quote.',
      'Door sizes come from our network aircraft / type specs so we can explain what typically fits before you spend on a hard quote.',
    ].join(' '),
    disclaimer: SOFT_PRICING_DISCLAIMER,
    claude_guidelines: input.claude_guidelines ?? null,
  }
}

/** Build the prompt text Claude should turn into client guidelines. */
export function softPricingClaudePrompt(pkg: SoftPricingPackage): string {
  const lines = [
    `Lane ${pkg.origin_icao}→${pkg.dest_icao} · ${pkg.live_nm} NM live.`,
    pkg.fit_summary,
    pkg.pricing_logic_overview,
    'Per-class snapshots:',
    ...pkg.classes.map(
      (c) =>
        `- ${c.label}: ~$${Math.round(c.air_estimate)} air · ${c.timing_blurb} · fit=${c.fit.fit} · ${c.fit.explanation}`,
    ),
    'Write short, calm client guidelines (no operator names, no margins, no “bid”). Explain what fits, why times differ by class GS, and that this is only an estimate.',
  ]
  return lines.join('\n')
}

export function mockSoftPricingGuidelines(pkg: SoftPricingPackage): string {
  const fit = pkg.classes.filter((c) => c.fit.fit === 'fits').map((c) => c.label)
  const fitBit = fit.length
    ? `Your dims look workable in ${fit.join(' / ')}.`
    : 'Door fit is tight or unverified — dispatch should confirm on a hard quote.'
  return [
    fitBit,
    `We plan a ${SOFT_REPO_HOURS} hr reposition, then a live leg of ${pkg.live_nm} NM at each class’s average ground speed, and a home leg of about the same distance plus ${SOFT_HOME_EXTRA_HOURS} hr.`,
    'Faster jet classes cost more per mile but burn fewer hours on long stages; piston/turboprop often win on short freight with bigger relative doors.',
    SOFT_PRICING_DISCLAIMER,
  ].join(' ')
}
