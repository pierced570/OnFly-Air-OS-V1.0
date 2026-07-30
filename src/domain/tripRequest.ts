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
   * Multi-leg portal: each leg can carry pax, cargo, or both.
   * Single-leg trips still use trip-level `cargo_only` as the primary switch;
   * this stays in sync via `syncLegPayloadFromCargoOnly` / `applyLegPayload`.
   */
  payload: LegPayloadKind
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
  /** Hard delivery deadline (UTC ISO or local datetime-local string). */
  hard_deadline_at: string
  forklift_recommended: boolean
  forklift_required: boolean
  /**
   * Portal: dims known / not yet / autofill standard cargo.
   * Dispatch leaves as `known` and edits cargo_notes directly.
   */
  cargo_dims_status: CargoDimsStatus
  /** Best number to reach the team for urgent matters (portal). */
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
    ...partial,
  }
}

export function legHasPax(leg: TripLegDraft): boolean {
  return leg.payload === 'pax' || leg.payload === 'both'
}

export function legHasCargo(leg: TripLegDraft): boolean {
  return leg.payload === 'cargo' || leg.payload === 'both'
}

/** Trip includes any passenger-carrying outbound leg (or !cargo_only on single-leg). */
export function draftIncludesPax(draft: TripRequestDraft): boolean {
  if (draft.legs.length <= 1) return !draft.cargo_only
  return draft.legs.some(legHasPax)
}

/** Trip includes any freight-carrying outbound leg (or cargo_only / notes on single-leg). */
export function draftIncludesCargo(draft: TripRequestDraft): boolean {
  if (draft.legs.length <= 1) {
    return draft.cargo_only || Boolean(draft.cargo_notes.trim())
  }
  return draft.legs.some(legHasCargo)
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
  return {
    ...draft,
    legs: draft.legs.map((l) => ({ ...l, payload })),
  }
}

/**
 * Apply a per-leg payload choice and re-derive cargo_only / empty pax rows.
 */
export function applyLegPayload(
  draft: TripRequestDraft,
  legId: string,
  payload: LegPayloadKind,
): TripRequestDraft {
  const legs = draft.legs.map((l) => (l.id === legId ? { ...l, payload } : l))
  const hasPax = legs.some(legHasPax)
  return {
    ...draft,
    legs,
    cargo_only: !hasPax,
    pax: hasPax
      ? draft.pax.length
        ? draft.pax
        : [{ name: '', weight_lbs: '', dob: '' }]
      : [],
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
  if (draft.cargo_dims_status === 'not_yet') return false
  if (draft.legs.length > 1) {
    return draftIncludesCargo(draft)
  }
  return draft.cargo_only || Boolean(draft.cargo_notes.trim())
}

/**
 * Pieces for routing / forklift: parse dims, fill missing unit weights from
 * the required cargo_weight_lbs field when provided.
 */
export function cargoPiecesFromDraft(draft: TripRequestDraft): Piece[] {
  const parsed = parseDims(draft.cargo_notes || '', { unit: draft.dim_unit })
  const fallback =
    draft.cargo_weight_lbs === '' ? 0 : Number(draft.cargo_weight_lbs)
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
  const bits: string[] = []
  if (draft.legs.length > 1) {
    const legBits = draft.legs.map((l, i) => {
      const kind =
        l.payload === 'both' ? 'pax+cargo' : l.payload === 'pax' ? 'pax' : 'cargo'
      return `L${i + 1} ${kind}`
    })
    bits.push(legBits.join(', '))
  } else {
    bits.push(draft.cargo_only ? 'cargo' : `${draft.pax.length || 0} pax`)
  }
  bits.push(draft.service_mode)
  bits.push(draft.timing === 'asap' ? 'ASAP (<4h)' : 'scheduled')
  if (draft.direction === 'round_trip') {
    bits.push(
      `RT${draft.hours_on_ground !== '' ? ` ${draft.hours_on_ground}h ground` : ''}`,
    )
  }
  if (draft.hazmat) bits.push('hazmat')
  if (draft.cargo_dims_status === 'not_yet') bits.push('dims TBD')
  if (draft.cargo_dims_status === 'standard') bits.push('standard cargo')
  const lift = forkliftFromDraft(draft)
  if (lift.summary_bit) bits.push(lift.summary_bit)
  return bits.join(' · ')
}

export type TripRequestIssue = { field: string; message: string }

export function validateTripRequest(
  draft: TripRequestDraft,
  opts: { requireEmail?: boolean; requireClient?: boolean } = {},
): TripRequestIssue[] {
  const issues: TripRequestIssue[] = []
  const requireEmail = opts.requireEmail ?? true
  const requireClient = opts.requireClient ?? false

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
    if (draft.legs.length > 1 && !leg.payload) {
      issues.push({
        field: `leg.${i}.payload`,
        message: `${prefix}: choose passengers and/or cargo`,
      })
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

  if (draft.legs.length > 1) {
    const missingPayload = draft.legs.some(
      (l) => !legHasPax(l) && !legHasCargo(l),
    )
    if (missingPayload) {
      issues.push({
        field: 'legs.payload',
        message: 'Each leg needs passengers, cargo, or both',
      })
    }
  }

  if (draft.direction === 'round_trip') {
    if (draft.hours_on_ground === '' || Number(draft.hours_on_ground) <= 0) {
      issues.push({
        field: 'hours_on_ground',
        message: 'Round trip needs hours on the ground',
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

  if (draftIncludesPax(draft)) {
    if (draft.pax.length < 1) {
      issues.push({ field: 'pax', message: 'Add at least one passenger' })
    }
    draft.pax.forEach((p, i) => {
      if (!p.name.trim()) {
        issues.push({ field: `pax.${i}.name`, message: `Passenger ${i + 1}: name required` })
      }
      if (p.weight_lbs === '' || Number(p.weight_lbs) <= 0) {
        issues.push({
          field: `pax.${i}.weight`,
          message: `Passenger ${i + 1}: estimated weight required`,
        })
      }
      if (!p.dob) {
        issues.push({ field: `pax.${i}.dob`, message: `Passenger ${i + 1}: DOB required` })
      }
    })
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

  return issues
}
