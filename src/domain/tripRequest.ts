/**
 * Shared trip-request model for client portal + dispatcher intake.
 */

export type TimingMode = 'asap' | 'scheduled'
export type TripDirection = 'one_way' | 'round_trip'
export type ServiceMode = 'a2a' | 'd2d' | 'mixed'

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
  legs: TripLegDraft[]
  cargo_only: boolean
  pax: PaxRow[]
  hazmat: boolean
  cargo_notes: string
  notes: string
}

export type TripRequestRecord = TripRequestDraft & {
  id: string
  ref: number
  source: 'portal' | 'dispatch'
  status: 'submitted' | 'in_review' | 'quoted' | 'withdrawn'
  created_at: string
  ready_at: string
  lane: string
  summary: string
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
    ...partial,
  }
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
    cargo_only: true,
    pax: [],
    hazmat: false,
    cargo_notes: '',
    notes: '',
  }
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
  return draft.legs
    .map((l) => {
      const o = shortPlace(l.pickup_address, l.origin_icao)
      const d = shortPlace(l.dropoff_address, l.dest_icao)
      return `${o}→${d}`
    })
    .join(' · ')
}

export function summaryFromDraft(draft: TripRequestDraft): string {
  const bits: string[] = []
  bits.push(draft.cargo_only ? 'cargo' : `${draft.pax.length || 0} pax`)
  bits.push(draft.service_mode)
  bits.push(draft.timing === 'asap' ? 'ASAP (<4h)' : 'scheduled')
  if (draft.direction === 'round_trip') {
    bits.push(
      `RT${draft.hours_on_ground !== '' ? ` ${draft.hours_on_ground}h ground` : ''}`,
    )
  }
  if (draft.hazmat) bits.push('hazmat')
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
        message: 'Round trip needs hours on the ground',
      })
    }
  }

  if (!draft.cargo_only) {
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

  return issues
}
