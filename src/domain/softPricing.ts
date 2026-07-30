/**
 * Soft pricing package — client-facing ballpark when they ask
 * "what can this possibly cost?"
 *
 * Pure TypeScript. No React / Supabase.
 *
 * Timing (planning assumptions, not a hard quote):
 *   - Repo: fixed 2.5 hr
 *   - Live: great-circle NM ÷ class average GS → hrs+mins
 *   - Return: live duration + 1.0 hr
 * Price: billable hours × class hourly rate range → all-in estimate range.
 *
 * Never expose operator names, tails, margins, or raw cost.
 */

import { type DoorFit } from '@/domain/missionFit'
import {
  classifyAircraftVertical,
  type VerticalId,
} from '@/domain/operatorVerticals'
import type { Piece } from '@/domain/dimsParser'
import { maxPieceDims, totalWeightLbs } from '@/domain/dimsParser'

/** Fixed reposition assumption for soft quotes. */
export const SOFT_REPO_HOURS = 2.5

/** Extra time on the return beyond same-distance flight time. */
export const SOFT_HOME_EXTRA_HOURS = 1

/** Door clearance spare (inches) — mockup: ~2 in to spare. */
export const SOFT_DOOR_SPARE_IN = 2

export const SOFT_PRICING_DISCLAIMER =
  'This is not the actual price. It’s an estimate based on what we believe will fit and what historical data shows. Every mission is unique — aircraft are constantly changing distances from your pickup point, so the real repositioning leg (and price) moves with the fleet.'

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
  avg_gs_kts: number
  example_types: string[]
  /** Client-facing hourly rate band ($/hr). */
  hourly_low: number
  hourly_high: number
  typical_door_w_in: number
  typical_door_h_in: number
  typical_payload_lbs: number
}

/** Profiles aligned to soft-quote mockup examples / rates / GS. */
export const SOFT_CLASS_PROFILES: Record<SoftPricingClass, SoftClassProfile> = {
  single_engine: {
    id: 'single_engine',
    label: 'Single engine',
    avg_gs_kts: 130,
    example_types: ['Cessna 206', 'Bonanza A36'],
    hourly_low: 850,
    hourly_high: 1100,
    typical_door_w_in: 44,
    typical_door_h_in: 37,
    typical_payload_lbs: 1100,
  },
  twin_piston: {
    id: 'twin_piston',
    label: 'Twin piston',
    avg_gs_kts: 180,
    example_types: ['Cessna 310', 'Aerostar 600', 'Navajo'],
    hourly_low: 1300,
    hourly_high: 1600,
    typical_door_w_in: 45,
    typical_door_h_in: 33,
    typical_payload_lbs: 1600,
  },
  turboprop: {
    id: 'turboprop',
    label: 'Turboprop',
    avg_gs_kts: 260,
    example_types: ['Pilatus PC-12', 'Caravan 208B'],
    hourly_low: 2100,
    hourly_high: 2600,
    typical_door_w_in: 53,
    typical_door_h_in: 52,
    typical_payload_lbs: 2600,
  },
  light_jet: {
    id: 'light_jet',
    label: 'Light jet',
    avg_gs_kts: 420,
    example_types: ['Learjet 35A', 'Citation II'],
    hourly_low: 3300,
    hourly_high: 3900,
    typical_door_w_in: 36,
    typical_door_h_in: 48,
    typical_payload_lbs: 3000,
  },
  midsize: {
    id: 'midsize',
    label: 'Midsize freight',
    avg_gs_kts: 430,
    example_types: ['Falcon 20F', 'Hawker 800 cargo'],
    hourly_low: 4400,
    hourly_high: 5200,
    typical_door_w_in: 86,
    typical_door_h_in: 58,
    typical_payload_lbs: 6000,
  },
  heavy_freight: {
    id: 'heavy_freight',
    label: 'Heavy freight',
    avg_gs_kts: 270,
    example_types: ['EMB-120F', 'ATR 42F'],
    hourly_low: 5500,
    hourly_high: 7500,
    typical_door_w_in: 108,
    typical_door_h_in: 70,
    typical_payload_lbs: 12000,
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

/** Mockup style: "2h 46m" / "0h 51m". */
export function formatHoursMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  return `${h}h ${String(r).padStart(2, '0')}m`
}

export function flightMinutesFromNmGs(nm: number, gsKts: number): number {
  const gs = gsKts > 0 ? gsKts : 200
  return Math.round((Math.max(0, nm) / gs) * 60)
}

export type SoftLegTiming = {
  repo_min: number
  live_min: number
  home_min: number
  total_block_min: number
  live_nm: number
  avg_gs_kts: number
}

export function buildSoftLegTiming(
  liveNm: number,
  avgGsKts: number,
): SoftLegTiming {
  const gs = avgGsKts > 0 ? avgGsKts : 200
  const live_nm = Math.max(0, Math.round(liveNm))
  const live_min = flightMinutesFromNmGs(live_nm, gs)
  const home_min = live_min + Math.round(SOFT_HOME_EXTRA_HOURS * 60)
  const repo_min = Math.round(SOFT_REPO_HOURS * 60)
  return {
    repo_min,
    live_min,
    home_min,
    total_block_min: repo_min + live_min + home_min,
    live_nm,
    avg_gs_kts: gs,
  }
}

/**
 * Piece fits when its two smallest sides clear the door with SOFT_DOOR_SPARE_IN
 * to spare (length rides through the opening).
 */
export function doorFitsWithSpare(
  doorW: number,
  doorH: number,
  piece: { l_in: number; w_in: number; h_in: number },
  spareIn = SOFT_DOOR_SPARE_IN,
): DoorFit {
  const dims = [piece.l_in, piece.w_in, piece.h_in].sort((a, b) => a - b)
  const a = dims[0]!
  const b = dims[1]!
  const maxW = doorW - spareIn
  const maxH = doorH - spareIn
  if (a <= maxW && b <= maxH) return 'fits'
  if (a <= maxH && b <= maxW) return 'fits'
  return 'no_fit'
}

export function twoSmallestSidesLabel(piece: {
  l_in: number
  w_in: number
  h_in: number
}): string {
  const dims = [piece.l_in, piece.w_in, piece.h_in]
    .map((n) => Math.round(n))
    .sort((a, b) => a - b)
  return `${dims[0]}×${dims[1]} in`
}

export type SoftDoorExample = {
  type_name: string
  class_id: SoftPricingClass
  class_label: string
  door_w_in: number
  door_h_in: number
  payload_lbs: number
  fit: DoorFit
}

export type SoftCargoFitSummary = {
  fit: DoorFit
  explanation: string
  largest_piece_label: string
  two_smallest_label: string
  weight_lbs: number
  door_w_in: number
  door_h_in: number
  payload_lbs: number
}

export type SoftClassQuote = {
  class_id: SoftPricingClass
  label: string
  example_types: string[]
  /** All-in estimate range (hourly × billable). */
  price_low: number
  price_high: number
  hourly_low: number
  hourly_high: number
  timing: SoftLegTiming
  fit: SoftCargoFitSummary
  /** Reference-only when no_fit — still show price. */
  recommended: boolean
}

export type SoftSimilarMission = {
  origin: string
  dest: string
  nm: number
  type_name: string
  cargo_blurb: string
  month_label: string
  price: number
}

export type SoftPricingPackage = {
  origin_icao: string
  dest_icao: string
  /** IATA-style short codes for display when possible. */
  origin_display: string
  dest_display: string
  live_nm: number
  cargo_badges: string[]
  ready_asap: boolean
  classes: SoftClassQuote[]
  door_rows: SoftDoorExample[]
  similar_missions: SoftSimilarMission[]
  fit_summary: string
  pricing_logic_overview: string
  math_cards: Array<{ title: string; body: string }>
  disclaimer: string
  claude_guidelines: string | null
  ask_chips: string[]
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
  const w = Math.round(totalWeightLbs(pieces))
  return `${Math.round(d.l_in)}×${Math.round(d.w_in)}×${Math.round(d.h_in)} in at ${w} lb`
}

function pieceCountLabel(pieces: Piece[]): string {
  const n = pieces.reduce((s, p) => s + (p.count || 1), 0)
  return `${n} piece${n === 1 ? '' : 's'} · cargo only`
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

  // Prefer a network door for this class when available
  let doorW = profile.typical_door_w_in
  let doorH = profile.typical_door_h_in
  let payload = profile.typical_payload_lbs
  for (const a of fleet) {
    if (classifyToSoftClass(a) !== profile.id) continue
    if (a.door_w_in != null && a.door_h_in != null) {
      doorW = a.door_w_in
      doorH = a.door_h_in
      if (a.max_payload_lbs != null) payload = a.max_payload_lbs
      break
    }
  }

  const two_smallest_label = pieces.length
    ? twoSmallestSidesLabel(maxDims)
    : '—'

  let fit: DoorFit = 'unknown'
  if (pieces.length) {
    fit = doorFitsWithSpare(doorW, doorH, maxDims)
  }

  let explanation: string
  if (!pieces.length) {
    explanation =
      'No cargo dims yet — we show class guidelines until pieces are entered.'
  } else if (fit === 'fits') {
    explanation = `Your ${Math.round(maxDims.l_in)}×${Math.round(maxDims.w_in)}×${Math.round(maxDims.h_in)} in piece clears the ${doorW}×${doorH} in door on its side with room to secure.`
  } else {
    explanation = `Two smallest sides (${two_smallest_label}) exceed the ${doorW}×${doorH} in door — this class is priced for reference only.`
  }

  return {
    fit,
    explanation,
    largest_piece_label: largestPieceLabel(pieces),
    two_smallest_label,
    weight_lbs: weight,
    door_w_in: doorW,
    door_h_in: doorH,
    payload_lbs: payload,
  }
}

function buildDoorRows(
  pieces: Piece[],
  fleet: SoftFleetRow[],
): SoftDoorExample[] {
  const maxDims = pieces.length
    ? maxPieceDims(pieces)
    : { l_in: 0, w_in: 0, h_in: 0 }
  const rows: SoftDoorExample[] = []
  const usedClasses = new Set<SoftPricingClass>()

  // Prefer one representative per class from network, else profile typical
  for (const id of SOFT_PRICING_CLASSES) {
    const profile = SOFT_CLASS_PROFILES[id]
    const hit = fleet.find(
      (a) =>
        classifyToSoftClass(a) === id &&
        a.door_w_in != null &&
        a.door_h_in != null &&
        a.type_name,
    )
    const type_name = hit?.type_name?.trim() || profile.example_types[0]!
    const door_w_in = hit?.door_w_in ?? profile.typical_door_w_in
    const door_h_in = hit?.door_h_in ?? profile.typical_door_h_in
    const payload_lbs =
      hit?.max_payload_lbs ?? profile.typical_payload_lbs
    const fit = pieces.length
      ? doorFitsWithSpare(door_w_in, door_h_in, maxDims)
      : 'unknown'
    rows.push({
      type_name,
      class_id: id,
      class_label: profile.label,
      door_w_in,
      door_h_in,
      payload_lbs,
      fit,
    })
    usedClasses.add(id)
  }

  // Extra network samples (up to 2 more twins etc.) for the door table richness
  for (const a of fleet) {
    if (rows.length >= 8) break
    if (!a.type_name || a.door_w_in == null || a.door_h_in == null) continue
    const cls = classifyToSoftClass(a)
    if (!cls) continue
    if (rows.some((r) => r.type_name === a.type_name)) continue
    // Only add extras for twin_piston / light_jet like the mock
    if (cls !== 'twin_piston' && cls !== 'light_jet') continue
    rows.push({
      type_name: a.type_name,
      class_id: cls,
      class_label: SOFT_CLASS_PROFILES[cls].label,
      door_w_in: a.door_w_in,
      door_h_in: a.door_h_in,
      payload_lbs:
        a.max_payload_lbs ?? SOFT_CLASS_PROFILES[cls].typical_payload_lbs,
      fit: pieces.length
        ? doorFitsWithSpare(a.door_w_in, a.door_h_in, maxDims)
        : 'unknown',
    })
    void usedClasses
  }

  return rows
}

/** Demo / fallback similar missions when trip_history is empty (portal-safe). */
export function defaultSimilarMissions(
  originDisplay: string,
  destDisplay: string,
  liveNm: number,
): SoftSimilarMission[] {
  return [
    {
      origin: originDisplay,
      dest: destDisplay,
      nm: liveNm,
      type_name: 'Cessna 310',
      cargo_blurb: '2 pallets, 780 lb',
      month_label: 'Jul 2026',
      price: 10000,
    },
    {
      origin: originDisplay,
      dest: 'MDW',
      nm: Math.max(200, liveNm - 60),
      type_name: 'Pilatus PC-12',
      cargo_blurb: 'crated pump, 1,150 lb',
      month_label: 'Jun 2026',
      price: 8400,
    },
    {
      origin: 'BNA',
      dest: 'TEB',
      nm: 660,
      type_name: 'PC-12',
      cargo_blurb: 'door-to-door, 3 pieces',
      month_label: 'Jul 2026',
      price: 14200,
    },
    {
      origin: 'SAN',
      dest: 'PDX',
      nm: 830,
      type_name: 'King Air 200',
      cargo_blurb: 'AOG parts, 420 lb',
      month_label: 'Jul 2026',
      price: 16900,
    },
  ]
}

function icaoToDisplay(icao: string): string {
  const u = icao.trim().toUpperCase()
  if (u.length === 4 && u.startsWith('K')) return u.slice(1)
  return u
}

function buildCargoBadges(pieces: Piece[]): string[] {
  if (!pieces.length) return ['CARGO —', '— LB', '0 PIECES · CARGO ONLY']
  const d = maxPieceDims(pieces)
  const per =
    pieces[0]!.weight_lbs > 0
      ? Math.round(pieces[0]!.weight_lbs)
      : Math.round(totalWeightLbs(pieces) / Math.max(1, pieces[0]!.count || 1))
  return [
    `CARGO ${Math.round(d.l_in)}×${Math.round(d.w_in)}×${Math.round(d.h_in)} IN`,
    `${per} LB / PIECE`,
    pieceCountLabel(pieces).toUpperCase(),
  ]
}

export function buildSoftPricingPackage(input: {
  origin_icao: string
  dest_icao: string
  live_nm: number
  pieces: Piece[]
  fleet: SoftFleetRow[]
  ready_asap?: boolean
  similar_missions?: SoftSimilarMission[]
  claude_guidelines?: string | null
}): SoftPricingPackage {
  const live_nm = Math.max(0, Math.round(input.live_nm))
  const origin_icao = input.origin_icao.toUpperCase()
  const dest_icao = input.dest_icao.toUpperCase()
  const origin_display = icaoToDisplay(origin_icao)
  const dest_display = icaoToDisplay(dest_icao)

  const classes: SoftClassQuote[] = []
  for (const id of SOFT_PRICING_CLASSES) {
    const profile = SOFT_CLASS_PROFILES[id]
    const timing = buildSoftLegTiming(live_nm, profile.avg_gs_kts)
    const hours = timing.total_block_min / 60
    const price_low = Math.round(hours * profile.hourly_low)
    const price_high = Math.round(hours * profile.hourly_high)
    // Round to nearest $250 like mockup feel
    const round250 = (n: number) => Math.round(n / 250) * 250
    const fit = summarizeCargoFitForClass(profile, input.pieces, input.fleet)
    classes.push({
      class_id: id,
      label: profile.label,
      example_types: profile.example_types,
      price_low: round250(price_low),
      price_high: round250(price_high),
      hourly_low: profile.hourly_low,
      hourly_high: profile.hourly_high,
      timing,
      fit,
      recommended: fit.fit === 'fits' || fit.fit === 'unknown',
    })
  }

  const fitLabels = classes
    .filter((c) => c.fit.fit === 'fits')
    .map((c) => c.label.toLowerCase())
  let fit_summary =
    'We show every class with door/payload guidance — priced for reference even when doors are tight.'
  if (fitLabels.length === 1) {
    fit_summary = `Based on cargo dims/doors, this most clearly fits a ${fitLabels[0]}.`
  } else if (fitLabels.length > 1) {
    fit_summary = `Based on cargo dims/doors, this can fit: ${fitLabels.join(', ')}.`
  }

  return {
    origin_icao,
    dest_icao,
    origin_display,
    dest_display,
    live_nm,
    cargo_badges: buildCargoBadges(input.pieces),
    ready_asap: input.ready_asap !== false,
    classes,
    door_rows: buildDoorRows(input.pieces, input.fleet),
    similar_missions:
      input.similar_missions ??
      defaultSimilarMissions(origin_display, dest_display, live_nm),
    fit_summary,
    pricing_logic_overview:
      'We assume a 2.5 hr repositioning leg to reach you. Live leg = distance ÷ average ground speed. Return home ≈ live leg + 1 hr. Billable time × class hourly rate.',
    math_cards: [
      {
        title: '1. Repositioning',
        body: `We assume 2.5 hrs for the aircraft to reach ${origin_display}. Real repo depends on where the fleet sits today — the single biggest swing in your final price.`,
      },
      {
        title: '2. Live leg',
        body: `${live_nm} NM ÷ average ground speed. Averages come from our own trip logs: 180 kt is a Cessna 310 / Aerostar day, 260 kt a PC-12, 420 kt a Lear 35A.`,
      },
      {
        title: '3. Return home',
        body: 'Return ≈ live leg + 1 hr for routing and descent into base. Repo + live + return, times the class hourly rate, gives the range above.',
      },
    ],
    disclaimer: SOFT_PRICING_DISCLAIMER,
    claude_guidelines: input.claude_guidelines ?? null,
    ask_chips: [
      'Why is the repo leg billed?',
      'What if I split into 2 pieces?',
      'Roundtrip pricing?',
    ],
  }
}

export function softPricingClaudePrompt(pkg: SoftPricingPackage): string {
  const lines = [
    `Lane ${pkg.origin_display}→${pkg.dest_display} · ${pkg.live_nm} NM live.`,
    pkg.fit_summary,
    'Per-class snapshots:',
    ...pkg.classes.map(
      (c) =>
        `- ${c.label}: $${c.price_low}–$${c.price_high} · live ${formatHoursMinutes(c.timing.live_min)} @ ${c.timing.avg_gs_kts} kt · fit=${c.fit.fit} · ${c.fit.explanation}`,
    ),
    'Write short, calm client guidelines (no operator names, no margins, no “bid”). Explain what fits, why turboprop may beat a cheaper no-fit class, and that this is only an estimate.',
  ]
  return lines.join('\n')
}

export function mockSoftPricingGuidelines(pkg: SoftPricingPackage): string {
  const fitting = pkg.classes.filter((c) => c.fit.fit === 'fits')
  const cheapestFit = [...fitting].sort((a, b) => a.price_low - b.price_low)[0]
  if (cheapestFit) {
    return `Your piece height/width is the constraint here. It clears a ${cheapestFit.example_types[0]}-class door on its side, which is why ${cheapestFit.label.toLowerCase()} is your cheapest fitting class even when some lower hourly classes show a lower reference price but NO FIT. If the piece can ship shorter, a smaller door class may open up and the estimate can drop. ${SOFT_PRICING_DISCLAIMER}`
  }
  return `Door fit is tight or unverified across the sample — request a hard quote so dispatch can confirm. ${SOFT_PRICING_DISCLAIMER}`
}
