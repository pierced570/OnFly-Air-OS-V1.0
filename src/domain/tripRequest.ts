/**
 * Shared trip-request model for client portal + dispatcher intake.
 */

import {
  parseDims,
  piecesHaveWeights,
  type DimLengthUnit,
  type Piece,
} from '@/domain/dimsParser'
import {
  forkliftHandlingFromPieces,
  type ForkliftHandling,
} from '@/domain/forkliftHandling'

export type TimingMode = 'asap' | 'scheduled'
export type TripDirection = 'one_way' | 'round_trip'
export type ServiceMode = 'a2a' | 'd2d' | 'mixed'
/** Portal cargo dims: known now, TBD with desk, or autofill standard cargo. */
export type CargoDimsStatus = 'known' | 'not_yet' | 'standard'
/** What rides a given air leg — passengers, freight, or both. */
export type LegPayloadKind = 'pax' | 'cargo' | 'both'
export type { DimLengthUnit }

/**
 * When the client picks “Not yet” on dims, soft-quote / routing assume a small
 * piece that clears every typical class door until real sizes arrive.
 */
export const ASSUMED_SMALL_CARGO_WHEN_DIMS_TBD: Piece = {
  l_in: 12,
  w_in: 12,
  h_in: 12,
  weight_lbs: 50,
  count: 1,
  stackable: true,
}

export function draftDimsAssumedSmall(draft: {
  cargo_dims_status?: CargoDimsStatus | null
}): boolean {
  return draft.cargo_dims_status === 'not_yet'
}

export type PaxRow = {
  name: string
  weight_lbs: number | ''
  dob: string // yyyy-mm-dd
}

export type TripLegDraft = {
  id: string
  origin_icao: string
  dest_icao: string
  date: string // yyyy-mm-dd
  pickup_time: string // HH:mm
  pickup_address: string
  pickup_tbd: boolean
  dropoff_address: string
  dropoff_tbd: boolean
  /**
   * Multi-leg / round-trip portal: each leg can carry pax, cargo, or both.
   * Single one-way trips still use trip-level `cargo_only` as the primary switch.
   */
  payload: LegPayloadKind
  /** Per-leg passengers when `draftNeedsPerLegPayload`. */
  pax: PaxRow[]
  /** Per-leg dims text when this leg carries cargo. */
  cargo_notes: string
  cargo_weight_lbs: number | ''
  cargo_dims_status: CargoDimsStatus
}

export type TripRequestDraft = {
  /** Portal: requester email. Dispatch: optional contact email. */
  email: string
  /** Dispatch only */
  client_id: string | null
  client_name: string | null
  timing: TimingMode
  direction: TripDirection
  hours_on_ground: number | ''
  service_mode: ServiceMode
  /** Outbound legs (user-edited). */
  legs: TripLegDraft[]
  /**
   * Return legs when direction is round_trip — routes mirror outbound
   * (reversed); date/time may be set independently for scheduled trips.
   */
  return_legs: TripLegDraft[]
  cargo_only: boolean
  pax: PaxRow[]
  /**
   * Soft estimate: passenger count known, but names/weights/DOBs deferred
   * until before booking. Hard quote still requires full details.
   */
  pax_details_deferred: boolean
  hazmat: boolean
  cargo_notes: string
  /**
   * Required for cargo: weight of each object (lb). Used when dims text omits
   * `@ N ea`, and always shown on the form so weight is never skipped.
   */
  cargo_weight_lbs: number | ''
  /** Length unit for cargo_notes L×W×H (stored pieces always convert to inches). */
  dim_unit: DimLengthUnit
  notes: string
  /** Client PO — needed for invoice / hard quote (desk; optional on portal). */
  po_number: string
  /** Declared cargo value USD (optional until required by client rules). */
  declared_value_usd: number | ''
  /** Hard delivery deadline (optional). UTC ISO or local datetime-local string. */
  hard_deadline_at: string
  forklift_recommended: boolean
  forklift_required: boolean
  /**
   * Portal: dims known / not yet / autofill standard cargo.
   * Dispatch leaves as `known` and edits cargo_notes directly.
   */
  cargo_dims_status: CargoDimsStatus
  /** Best number to reach the team for urgent matters (portal). E.164 when set. */
  urgent_phone: string
}

export type TripRequestSource = 'portal' | 'dispatch' | 'scratchpad'

export type TripRequestRecord = TripRequestDraft & {
  id: string
  ref: number
  source: TripRequestSource
  status: 'submitted' | 'in_review' | 'quoted' | 'withdrawn'
  created_at: string
  ready_at: string
  lane: string
  summary: string
  /** Client asked for operator-confirmed hard quote times/numbers. */
  hard_quote_requested_at: string | null
  /** Derived at submit from piece weights — dispatcher note. */
  forklift: ForkliftHandling
}

export const ASAP_MAX_HOURS = 4

export function newLeg(partial?: Partial<TripLegDraft>): TripLegDraft {
  return {
    id: crypto.randomUUID(),
    origin_icao: '',
    dest_icao: '',
    date: '',
    pickup_time: '',
    pickup_address: '',
    pickup_tbd: false,
    dropoff_address: '',
    dropoff_tbd: false,
    payload: 'cargo',
    pax: [],
    cargo_notes: '',
    cargo_weight_lbs: '',
    cargo_dims_status: 'known',
    ...partial,
  }
}

export function legHasPax(leg: TripLegDraft): boolean {
  return leg.payload === 'pax' || leg.payload === 'both'
}

export function legHasCargo(leg: TripLegDraft): boolean {
  return leg.payload === 'cargo' || leg.payload === 'both'
}

/** Round trip or 2+ outbound legs → collect pax/cargo per itinerary leg. */
export function draftNeedsPerLegPayload(draft: TripRequestDraft): boolean {
  return draft.direction === 'round_trip' || draft.legs.length > 1
}

/** Display code: KGSP → GSP, else ICAO / ?. */
export function shortAirportCode(icao: string): string {
  const c = icao.trim().toUpperCase()
  if (!c) return '?'
  if (/^K[A-Z0-9]{3}$/.test(c)) return c.slice(1)
  return c
}

/** e.g. GSP-CVG */
export function legLaneLabel(leg: TripLegDraft): string {
  return `${shortAirportCode(leg.origin_icao)}-${shortAirportCode(leg.dest_icao)}`
}

/** Trip includes any passenger-carrying itinerary leg (or !cargo_only on simple trips). */
export function draftIncludesPax(draft: TripRequestDraft): boolean {
  if (!draftNeedsPerLegPayload(draft)) return !draft.cargo_only
  return itineraryLegs(draft).some(legHasPax)
}

/** Trip includes any freight-carrying itinerary leg (or cargo_only / notes on simple trips). */
export function draftIncludesCargo(draft: TripRequestDraft): boolean {
  if (!draftNeedsPerLegPayload(draft)) {
    return draft.cargo_only || Boolean(draft.cargo_notes.trim())
  }
  return itineraryLegs(draft).some(legHasCargo)
}

export function draftPayloadKind(
  draft: TripRequestDraft,
): 'cargo' | 'pax' | 'both' {
  const pax = draftIncludesPax(draft)
  const cargo = draftIncludesCargo(draft)
  if (pax && cargo) return 'both'
  if (pax) return 'pax'
  return 'cargo'
}

export function payloadFromFlags(
  hasPax: boolean,
  hasCargo: boolean,
): LegPayloadKind | null {
  if (hasPax && hasCargo) return 'both'
  if (hasPax) return 'pax'
  if (hasCargo) return 'cargo'
  return null
}

/** Keep leg.payload aligned when the trip-level cargo-only switch changes. */
export function syncLegPayloadFromCargoOnly(
  draft: TripRequestDraft,
): TripRequestDraft {
  const payload: LegPayloadKind = draft.cargo_only ? 'cargo' : 'pax'
  const patch = (l: TripLegDraft): TripLegDraft => ({
    ...l,
    payload,
    pax:
      payload === 'cargo'
        ? []
        : l.pax.length
          ? l.pax
          : [{ name: '', weight_lbs: '', dob: '' }],
  })
  return {
    ...draft,
    legs: draft.legs.map(patch),
    return_legs: draft.return_legs.map(patch),
  }
}

function mapItineraryLeg(
  draft: TripRequestDraft,
  legId: string,
  fn: (leg: TripLegDraft) => TripLegDraft,
): TripRequestDraft {
  const inOutbound = draft.legs.some((l) => l.id === legId)
  if (inOutbound) {
    return { ...draft, legs: draft.legs.map((l) => (l.id === legId ? fn(l) : l)) }
  }
  return {
    ...draft,
    return_legs: draft.return_legs.map((l) => (l.id === legId ? fn(l) : l)),
  }
}

/**
 * Apply a per-leg payload choice and re-derive cargo_only / seed pax rows.
 */
export function applyLegPayload(
  draft: TripRequestDraft,
  legId: string,
  payload: LegPayloadKind,
): TripRequestDraft {
  const next = mapItineraryLeg(draft, legId, (l) => ({
    ...l,
    payload,
    pax:
      payload === 'cargo'
        ? []
        : l.pax.length
          ? l.pax
          : [{ name: '', weight_lbs: '', dob: '' }],
    cargo_notes: payload === 'pax' ? '' : l.cargo_notes,
    cargo_weight_lbs: payload === 'pax' ? '' : l.cargo_weight_lbs,
  }))
  const hasPax = itineraryLegs(next).some(legHasPax)
  return {
    ...next,
    cargo_only: !hasPax,
    pax: hasPax
      ? next.pax.length
        ? next.pax
        : [{ name: '', weight_lbs: '', dob: '' }]
      : [],
  }
}

/** Patch fields on one itinerary leg (outbound or return). */
export function patchItineraryLeg(
  draft: TripRequestDraft,
  legId: string,
  patch: Partial<TripLegDraft>,
): TripRequestDraft {
  return mapItineraryLeg(draft, legId, (l) => ({ ...l, ...patch }))
}

/**
 * Collapse per-leg pax/cargo into trip-level fields for estimate / routing /
 * summary consumers that still read draft.pax + draft.cargo_notes.
 */
export function foldPerLegPayloadIntoDraft(
  draft: TripRequestDraft,
): TripRequestDraft {
  if (!draftNeedsPerLegPayload(draft)) return draft
  const legs = itineraryLegs(draft)
  const pax = legs.filter(legHasPax).flatMap((l) => l.pax)
  const cargoLegs = legs.filter(legHasCargo)
  const lines = cargoLegs
    .map((l) => l.cargo_notes.trim())
    .filter(Boolean)
  const weightHit = cargoLegs.find(
    (l) => l.cargo_weight_lbs !== '' && Number(l.cargo_weight_lbs) > 0,
  )
  const anyNotYet = cargoLegs.some((l) => l.cargo_dims_status === 'not_yet')
  const allStandard =
    cargoLegs.length > 0 &&
    cargoLegs.every((l) => l.cargo_dims_status === 'standard')
  return {
    ...draft,
    cargo_only: !legs.some(legHasPax),
    pax,
    cargo_notes: lines.join('\n'),
    cargo_weight_lbs: weightHit?.cargo_weight_lbs ?? '',
    cargo_dims_status: anyNotYet
      ? 'not_yet'
      : allStandard
        ? 'standard'
        : cargoLegs.length
          ? 'known'
          : draft.cargo_dims_status,
  }
}

/** Swap origin/dest (and door addresses) for a return leg. */
export function mirrorLeg(leg: TripLegDraft): TripLegDraft {
  return newLeg({
    origin_icao: leg.dest_icao,
    dest_icao: leg.origin_icao,
    pickup_address: leg.dropoff_address,
    dropoff_address: leg.pickup_address,
    pickup_tbd: leg.dropoff_tbd,
    dropoff_tbd: leg.pickup_tbd,
    payload: leg.payload,
    pax: leg.pax.map((p) => ({ ...p })),
    cargo_notes: leg.cargo_notes,
    cargo_weight_lbs: leg.cargo_weight_lbs,
    cargo_dims_status: leg.cargo_dims_status,
  })
}

/**
 * Return itinerary = reverse outbound order with endpoints swapped
 * (A→B→C becomes C→B→A).
 */
export function buildReturnLegs(outbound: TripLegDraft[]): TripLegDraft[] {
  return [...outbound].reverse().map(mirrorLeg)
}

/**
 * Keep return date/time (and stable ids) while refreshing mirrored routes
 * from the current outbound legs.
 */
export function syncReturnLegs(
  outbound: TripLegDraft[],
  existingReturn: TripLegDraft[] = [],
): TripLegDraft[] {
  return buildReturnLegs(outbound).map((mirrored, i) => {
    const prev = existingReturn[i]
    if (!prev) return mirrored
    return {
      ...mirrored,
      id: prev.id,
      date: prev.date,
      pickup_time: prev.pickup_time,
      payload: prev.payload,
      pax: prev.pax,
      cargo_notes: prev.cargo_notes,
      cargo_weight_lbs: prev.cargo_weight_lbs,
      cargo_dims_status: prev.cargo_dims_status,
    }
  })
}

/** Full lane: outbound + return when round trip. */
export function itineraryLegs(draft: TripRequestDraft): TripLegDraft[] {
  if (draft.direction !== 'round_trip') return draft.legs
  const returns =
    draft.return_legs.length > 0
      ? draft.return_legs
      : buildReturnLegs(draft.legs)
  return [...draft.legs, ...returns]
}

export function emptyTripRequestDraft(): TripRequestDraft {
  return {
    email: '',
    client_id: null,
    client_name: null,
    timing: 'asap',
    direction: 'one_way',
    hours_on_ground: '',
    service_mode: 'a2a',
    legs: [newLeg()],
    return_legs: [],
    cargo_only: true,
    pax: [],
    pax_details_deferred: false,
    hazmat: false,
    cargo_notes: '',
    cargo_weight_lbs: '',
    dim_unit: 'in',
    notes: '',
    po_number: '',
    declared_value_usd: '',
    hard_deadline_at: '',
    forklift_recommended: false,
    forklift_required: false,
    cargo_dims_status: 'known',
    urgent_phone: '',
  }
}

/** Cargo needs weight when freight is on the request. */
export function draftNeedsCargoWeight(draft: TripRequestDraft): boolean {
  const folded = foldPerLegPayloadIntoDraft(draft)
  if (folded.cargo_dims_status === 'not_yet') return false
  if (draftNeedsPerLegPayload(draft)) {
    return draftIncludesCargo(draft)
  }
  return folded.cargo_only || Boolean(folded.cargo_notes.trim())
}

/**
 * Pieces for routing / forklift: parse dims, fill missing unit weights from
 * the required cargo_weight_lbs field when provided.
 * “Not yet” dims → assumed-small piece so soft quote still runs (fits all).
 */
export function cargoPiecesFromDraft(draft: TripRequestDraft): Piece[] {
  const folded = foldPerLegPayloadIntoDraft(draft)
  if (draftNeedsPerLegPayload(draft)) {
    const pieces: Piece[] = []
    for (const leg of itineraryLegs(draft).filter(legHasCargo)) {
      if (leg.cargo_dims_status === 'not_yet') {
        pieces.push({ ...ASSUMED_SMALL_CARGO_WHEN_DIMS_TBD })
        continue
      }
      const parsed = parseDims(leg.cargo_notes || '', { unit: draft.dim_unit })
      const fallback =
        leg.cargo_weight_lbs === '' ? 0 : Number(leg.cargo_weight_lbs)
      if (!parsed.pieces.length) {
        if (fallback > 0) {
          pieces.push({
            l_in: 0,
            w_in: 0,
            h_in: 0,
            weight_lbs: fallback,
            count: 1,
            stackable: false,
          })
        }
        continue
      }
      for (const p of parsed.pieces) {
        pieces.push({
          ...p,
          weight_lbs: p.weight_lbs > 0 ? p.weight_lbs : fallback,
        })
      }
    }
    return pieces
  }
  if (draftDimsAssumedSmall(folded)) {
    return [{ ...ASSUMED_SMALL_CARGO_WHEN_DIMS_TBD }]
  }
  const parsed = parseDims(folded.cargo_notes || '', { unit: folded.dim_unit })
  const fallback =
    folded.cargo_weight_lbs === '' ? 0 : Number(folded.cargo_weight_lbs)
  if (!parsed.pieces.length) {
    if (fallback > 0) {
      return [
        {
          l_in: 0,
          w_in: 0,
          h_in: 0,
          weight_lbs: fallback,
          count: 1,
          stackable: false,
        },
      ]
    }
    return []
  }
  return parsed.pieces.map((p) => ({
    ...p,
    weight_lbs: p.weight_lbs > 0 ? p.weight_lbs : fallback,
  }))
}

export function forkliftFromDraft(draft: TripRequestDraft): ForkliftHandling {
  return forkliftHandlingFromPieces(cargoPiecesFromDraft(draft))
}

/** ASAP = anything under 4 hours from now. */
export function isAsapReady(readyAt: Date, now = new Date()): boolean {
  const hrs = (readyAt.getTime() - now.getTime()) / (1000 * 60 * 60)
  return hrs >= 0 && hrs < ASAP_MAX_HOURS
}

export function deriveReadyAt(draft: TripRequestDraft, now = new Date()): string {
  if (draft.timing === 'asap') {
    return new Date(now.getTime() + 90 * 60 * 1000).toISOString()
  }
  const leg = draft.legs[0]
  if (!leg) return now.toISOString()
  if (leg.date && leg.pickup_time) {
    const d = new Date(`${leg.date}T${leg.pickup_time}:00`)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  if (leg.date) {
    const d = new Date(`${leg.date}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return now.toISOString()
}

function shortPlace(address: string, icao: string): string {
  const code = icao.trim().toUpperCase()
  if (code) return code
  const addr = address.trim()
  if (!addr) return '?'
  // City-ish: last meaningful comma segment, truncated
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean)
  const label = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!
  return label.length > 18 ? `${label.slice(0, 16)}…` : label
}

export function laneFromDraft(draft: TripRequestDraft): string {
  return itineraryLegs(draft)
    .map((l) => {
      const o = shortPlace(l.pickup_address, l.origin_icao)
      const d = shortPlace(l.dropoff_address, l.dest_icao)
      return `${o}→${d}`
    })
    .join(' · ')
}

export function summaryFromDraft(draft: TripRequestDraft): string {
  const folded = foldPerLegPayloadIntoDraft(draft)
  const bits: string[] = []
  if (draftNeedsPerLegPayload(draft)) {
    const legBits = itineraryLegs(draft).map((l, i) => {
      const kind =
        l.payload === 'both' ? 'pax+cargo' : l.payload === 'pax' ? 'pax' : 'cargo'
      return `L${i + 1} ${legLaneLabel(l)} ${kind}`
    })
    bits.push(legBits.join(', '))
  } else {
    bits.push(folded.cargo_only ? 'cargo' : `${folded.pax.length || 0} pax`)
  }
  if (!folded.cargo_only && folded.pax_details_deferred) bits.push('pax TBD')
  bits.push(folded.service_mode)
  bits.push(folded.timing === 'asap' ? 'ASAP (<4h)' : 'scheduled')
  if (folded.direction === 'round_trip') {
    bits.push(
      `RT${folded.hours_on_ground !== '' ? ` ${folded.hours_on_ground}h ground` : ''}`,
    )
  }
  if (folded.hazmat) bits.push('hazmat')
  if (folded.cargo_dims_status === 'not_yet') bits.push('dims TBD')
  if (folded.cargo_dims_status === 'standard') bits.push('standard cargo')
  const lift = forkliftFromDraft(folded)
  if (lift.summary_bit) bits.push(lift.summary_bit)
  return bits.join(' · ')
}

export type TripRequestIssue = { field: string; message: string }

export function validateTripRequest(
  draft: TripRequestDraft,
  opts: {
    requireEmail?: boolean
    requireClient?: boolean
    /**
     * When true (default unless draft.pax_details_deferred), require name /
     * weight / DOB for each passenger. Soft estimates may pass false.
     */
    requirePaxDetails?: boolean
  } = {},
): TripRequestIssue[] {
  const issues: TripRequestIssue[] = []
  const requireEmail = opts.requireEmail ?? true
  const requireClient = opts.requireClient ?? false
  const requirePaxDetails =
    opts.requirePaxDetails ?? !draft.pax_details_deferred

  if (requireEmail) {
    const email = draft.email.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ field: 'email', message: 'Enter a valid email address' })
    }
  }
  if (requireClient && !draft.client_name?.trim() && !draft.client_id) {
    issues.push({ field: 'client', message: 'Select or create a client' })
  }

  if (!draft.legs.length) {
    issues.push({ field: 'legs', message: 'Add at least one leg' })
  }

  const needsDoorAddresses =
    draft.service_mode === 'd2d' || draft.service_mode === 'mixed'
  /** Pure D2D: airports are assigned from addresses; ICAO optional. */
  const requireIcaos = draft.service_mode !== 'd2d'

  draft.legs.forEach((leg, i) => {
    const prefix = `Leg ${i + 1}`
    if (requireIcaos) {
      if (!leg.origin_icao.trim()) {
        issues.push({
          field: `leg.${i}.origin`,
          message: `${prefix}: origin ICAO required`,
        })
      }
      if (!leg.dest_icao.trim()) {
        issues.push({
          field: `leg.${i}.dest`,
          message: `${prefix}: destination ICAO required`,
        })
      }
    }
    if (draft.timing === 'scheduled' && !leg.date) {
      issues.push({ field: `leg.${i}.date`, message: `${prefix}: date required for scheduled` })
    }
    if (needsDoorAddresses) {
      if (!leg.pickup_address.trim()) {
        issues.push({
          field: `leg.${i}.pickup`,
          message: `${prefix}: pickup address required (used to assign origin airport)`,
        })
      }
      if (!leg.dropoff_address.trim()) {
        issues.push({
          field: `leg.${i}.dropoff`,
          message: `${prefix}: delivery address required (used to assign destination airport)`,
        })
      }
    }
  })

  if (draft.direction === 'round_trip') {
    if (draft.hours_on_ground === '' || Number(draft.hours_on_ground) <= 0) {
      issues.push({
        field: 'hours_on_ground',
        message: 'Round trip needs est. hours needed on ground',
      })
    }
    const returns =
      draft.return_legs.length > 0
        ? draft.return_legs
        : buildReturnLegs(draft.legs)
    if (draft.timing === 'scheduled') {
      returns.forEach((leg, i) => {
        if (!leg.date) {
          issues.push({
            field: `return.${i}.date`,
            message: `Return leg ${i + 1}: date required for scheduled`,
          })
        }
      })
    }
  }

  if (draftNeedsPerLegPayload(draft)) {
    itineraryLegs(draft).forEach((leg, i) => {
      const prefix = `Leg ${i + 1} ${legLaneLabel(leg)}`
      if (!legHasPax(leg) && !legHasCargo(leg)) {
        issues.push({
          field: `leg.${i}.payload`,
          message: `${prefix}: choose passengers, cargo, or both`,
        })
      }
      if (legHasPax(leg)) {
        if (leg.pax.length < 1) {
          issues.push({
            field: `leg.${i}.pax`,
            message: `${prefix}: add at least one passenger`,
          })
        }
        if (requirePaxDetails) {
          if (draft.pax_details_deferred) {
            issues.push({
              field: 'pax_details_deferred',
              message:
                'Passenger names, weights, and DOBs are required before booking — uncheck “pax unverified” and fill each passenger, or use the soft estimate first',
            })
          } else {
            leg.pax.forEach((p, pi) => {
              if (!p.name.trim()) {
                issues.push({
                  field: `leg.${i}.pax.${pi}.name`,
                  message: `${prefix} passenger ${pi + 1}: name required`,
                })
              }
              if (p.weight_lbs === '' || Number(p.weight_lbs) <= 0) {
                issues.push({
                  field: `leg.${i}.pax.${pi}.weight`,
                  message: `${prefix} passenger ${pi + 1}: estimated weight required`,
                })
              }
              if (!p.dob) {
                issues.push({
                  field: `leg.${i}.pax.${pi}.dob`,
                  message: `${prefix} passenger ${pi + 1}: DOB required`,
                })
              }
            })
          }
        }
      }
      if (legHasCargo(leg) && leg.cargo_dims_status !== 'not_yet') {
        const parsed = parseDims(leg.cargo_notes || '', { unit: draft.dim_unit })
        const fieldWeightOk =
          leg.cargo_weight_lbs !== '' && Number(leg.cargo_weight_lbs) > 0
        const pieces = parsed.pieces.map((p) => ({
          ...p,
          weight_lbs:
            p.weight_lbs > 0
              ? p.weight_lbs
              : fieldWeightOk
                ? Number(leg.cargo_weight_lbs)
                : 0,
        }))
        const hasPiece =
          pieces.length > 0 ||
          (fieldWeightOk && Boolean(leg.cargo_notes.trim() || fieldWeightOk))
        if (!leg.cargo_notes.trim() && !fieldWeightOk) {
          issues.push({
            field: `leg.${i}.cargo`,
            message: `${prefix}: add cargo dims and weight (or standard cargo)`,
          })
        } else if (!fieldWeightOk && !piecesHaveWeights(pieces)) {
          issues.push({
            field: `leg.${i}.cargo_weight`,
            message: `${prefix}: cargo weight required (lb each)`,
          })
        } else if (hasPiece && pieces.some((p) => p.weight_lbs <= 0) && !fieldWeightOk) {
          issues.push({
            field: `leg.${i}.cargo_weight`,
            message: `${prefix}: every cargo piece needs a weight in lb`,
          })
        }
      }
    })
  } else {
    if (draftIncludesPax(draft)) {
      if (draft.pax.length < 1) {
        issues.push({ field: 'pax', message: 'Add at least one passenger' })
      }
      if (requirePaxDetails) {
        if (draft.pax_details_deferred) {
          issues.push({
            field: 'pax_details_deferred',
            message:
              'Passenger names, weights, and DOBs are required before booking — uncheck “pax unverified” and fill each passenger, or use the soft estimate first',
          })
        } else {
          draft.pax.forEach((p, i) => {
            if (!p.name.trim()) {
              issues.push({
                field: `pax.${i}.name`,
                message: `Passenger ${i + 1}: name required`,
              })
            }
            if (p.weight_lbs === '' || Number(p.weight_lbs) <= 0) {
              issues.push({
                field: `pax.${i}.weight`,
                message: `Passenger ${i + 1}: estimated weight required`,
              })
            }
            if (!p.dob) {
              issues.push({
                field: `pax.${i}.dob`,
                message: `Passenger ${i + 1}: DOB required`,
              })
            }
          })
        }
      }
    }

    if (draftNeedsCargoWeight(draft)) {
      const pieces = cargoPiecesFromDraft(draft)
      const fieldWeightOk =
        draft.cargo_weight_lbs !== '' && Number(draft.cargo_weight_lbs) > 0
      const parsedOk = piecesHaveWeights(pieces)
      if (!fieldWeightOk && !parsedOk) {
        issues.push({
          field: 'cargo_weight',
          message:
            'Cargo weight required (lb each) — e.g. 48x40x60 @ 150ea or enter Weight each',
        })
      } else if (!fieldWeightOk && pieces.some((p) => p.weight_lbs <= 0)) {
        issues.push({
          field: 'cargo_weight',
          message: 'Every cargo piece needs a weight in lb',
        })
      }
    }
  }

  return issues
}
