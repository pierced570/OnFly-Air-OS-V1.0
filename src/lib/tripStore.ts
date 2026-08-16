/**
 * Trip/offers store — session Map + localStorage + Supabase sync via trip_transition.
 */

import type { Candidate } from '@/domain/routing'
import type { BandShortlist } from '@/domain/shortlistBands'
import type { ChainLeg, ServicePattern } from '@/domain/etaChain'
import {
  applyActual,
  applyQuotedTtp,
  BUILTIN_ETA_DEFAULTS,
  copyChainToTrip,
  DEFAULT_LEG_DEFAULTS,
  editDuration,
  projectedDeliveryUtc,
  resetDurationToDefault,
  type EtaDefaults,
  type EtaSource,
} from '@/domain/etaChain'
import type { TripState } from '@/domain/stateMachine'
import { transition } from '@/domain/stateMachine'
import {
  generateTripCode,
  isValidTripCode,
  normalizeTripCode,
} from '@/domain/tripCode'
import { parseThreadActual } from '@/domain/threadParse'
import {
  applyChainToLegs,
  applyParsedActualToLegs,
  cascadeRecomputeFromActual,
  materializeChainToLegs,
  type AppLeg,
} from '@/domain/tripLegs'
import { raiseException } from '@/lib/exceptionStore'
import { getEtaDefaults } from '@/lib/etaDefaultsStore'
import { getReferral } from '@/lib/referralStore'
import { computeReferralShareAmount } from '@/domain/referrals'
import { buildQuickDispatchChain } from '@/domain/quickDispatchChain'
import { roleOnOpsThread } from '@/domain/tripThread'
import {
  normalizeTripPassengers,
  tripPassengerNames,
  type TripPassenger,
} from '@/domain/tripPassengers'
import { appPublicUrl } from '@/lib/appUrl'
import { getCachedNetwork } from '@/lib/networkData'
import { getClient } from '@/lib/clientStore'
import { listOnboardSubmissions } from '@/lib/operatorOnboardStore'
import { listOperatorDrafts } from '@/lib/operatorDraftStore'

const STORAGE_KEY = 'onfly.trips.v1'

function asTripLegs(legs: AppLeg[]): TripLegRow[] {
  return legs.map((l) => ({ ...l }))
}

/** Serialize persists per trip so a stale in-flight snapshot cannot re-upsert a just-deleted offer. */
const persistQueues = new Map<string, Promise<void>>()

function schedulePersist(tripId: string): void {
  void flushPersistTrip(tripId)
}

/** Flush one trip to Supabase (best-effort). */
export async function flushPersistTrip(tripId: string): Promise<void> {
  const prev = persistQueues.get(tripId) ?? Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(async () => {
      try {
        if (deletedTripIds.has(tripId)) return
        const m = await import('@/lib/db/persistTrip')
        const row = trips.get(tripId)
        if (!row) return
        const clone = structuredClone(row)
        clone.offers = clone.offers.filter(
          (o) => !deletedOfferKeys.has(`${tripId}:${o.id}`),
        )
        await m.persistTripSnapshot(clone)
      } catch (e) {
        console.warn('[trips] persist failed', tripId, e)
      }
    })
  persistQueues.set(tripId, next)
  try {
    await next
  } finally {
    if (persistQueues.get(tripId) === next) persistQueues.delete(tripId)
  }
}

/** Flush every trip currently in session. */
export async function flushAllTrips(): Promise<void> {
  for (const id of trips.keys()) {
    await flushPersistTrip(id)
  }
}

function tapToken(kind: string): string {
  return `${kind}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
}

function buildQuickLegs(
  meta: QuickDispatchMeta,
): TripLegRow[] {
  const legs: TripLegRow[] = []
  let seq = 1
  for (const [i, leg] of meta.legs.entries()) {
    const o = leg.origin_icao || '?'
    const d = leg.dest_icao || '?'
    legs.push({
      id: crypto.randomUUID(),
      seq: seq++,
      type: 'position',
      label: `Position to ${o}`,
      status: i === 0 ? 'active' : 'pending',
      origin: '',
      dest: o,
      est_start: null,
      est_end: null,
      actual_start: null,
      actual_end: null,
      one_tap_token: tapToken('pos'),
      party: 'pilot',
    })
    legs.push({
      id: crypto.randomUUID(),
      seq: seq++,
      type: 'air_leg',
      label: `Air ${o}→${d}`,
      status: 'pending',
      origin: o,
      dest: d,
      est_start: null,
      est_end: null,
      actual_start: null,
      actual_end: null,
      one_tap_token: tapToken('air'),
      party: 'pilot',
    })
  }
  legs.push({
    id: crypto.randomUUID(),
    seq: seq++,
    type: 'offload',
    label: 'Delivered / POD',
    status: 'pending',
    origin: meta.legs.at(-1)?.dest_icao,
    dest: meta.legs.at(-1)?.dest_icao,
    est_start: null,
    est_end: null,
    actual_start: null,
    actual_end: null,
    one_tap_token: tapToken('del'),
    party: 'driver',
  })
  return legs
}

function buildQuickParticipants(meta: QuickDispatchMeta): TripParticipant[] {
  const opCompany = meta.operator_name || 'Operator'
  const out: TripParticipant[] = [
    {
      id: crypto.randomUUID(),
      role: 'dispatcher',
      name: 'On-shift',
      company: 'OnFly Air',
      cell: '',
      email: '',
      in_thread: true,
      released_at: null,
      invite_sent_at: null,
    },
    {
      id: crypto.randomUUID(),
      role: 'operator_ops',
      name: opCompany,
      company: opCompany,
      cell: '',
      email: '',
      in_thread: true,
      released_at: null,
      invite_sent_at: null,
    },
  ]
  if (meta.invoice_email) {
    out.push({
      id: crypto.randomUUID(),
      role: 'client_ap',
      name: 'AP',
      company: meta.client_name || '',
      cell: '',
      email: meta.invoice_email,
      in_thread: false,
      released_at: null,
      invite_sent_at: null,
    })
  }
  for (const email of meta.cc_emails) {
    out.push({
      id: crypto.randomUUID(),
      role: 'client_ap',
      name: email.split('@')[0] || 'AP CC',
      company: meta.client_name || '',
      cell: '',
      email,
      in_thread: false,
      released_at: null,
      invite_sent_at: null,
    })
  }
  for (const email of meta.eta_emails ?? []) {
    const e = email.trim()
    if (!e.includes('@')) continue
    if (out.some((p) => p.email.toLowerCase() === e.toLowerCase())) continue
    out.push({
      id: crypto.randomUUID(),
      role: 'client_supply',
      name: e.split('@')[0] || 'Ops',
      company: meta.client_name || '',
      cell: '',
      email: e,
      in_thread: false,
      released_at: null,
      invite_sent_at: null,
    })
  }
  return out
}

export type OfferState =
  | 'pinged'
  | 'available'
  | 'unavailable'
  | 'quoted'
  | 'selected'
  | 'stood_down'
  | 'expired'

export type FeeScope = 'aircraft_only' | 'aircraft_and_fees'

export type OfferRow = {
  id: string
  trip_id: string
  operator_id: string
  operator_name: string
  aircraft_id: string
  tail: string
  type_name: string | null
  state: OfferState
  ping_sent_at: string | null
  /** Set only when email/SMS notify actually ran (offer_ping). */
  notified_at: string | null
  /**
   * Dispatcher acknowledged a Declined (No) — collapse the recipient row
   * so the board stays compact while still showing they were contacted.
   */
  declined_acked_at: string | null
  replied_at: string | null
  time_to_position_min: number | null
  /** Ground time at origin after position (quick turn / load). */
  quick_turn_min: number | null
  live_leg_min: number | null
  wait_ok: boolean | null
  max_wait_hrs: number | null
  price_net: number | null
  /** Aircraft-only vs aircraft + all fees (operator landing). */
  fee_scope: FeeScope | null
  notes: string | null
  /** Roundtrip: crew duty remaining today (minutes). */
  duty_available_min: number | null
  /** Roundtrip: duty covered by this quote (minutes). */
  duty_included_min: number | null
  magic_token: string
  bookingGated: boolean
  needsInfo: string[]
  contact_cell: string
  /** True when cell was invented for mock SMS — not a real on-file number. */
  contact_cell_is_mock: boolean
  /** Blank when unknown — desk can fill before send. */
  contact_email: string
  /** Where this offer's quote link is sent (profile default or desk override). */
  quote_link_channel: 'sms' | 'email' | 'both'
}

export type QuickDispatchMeta = {
  client_id: string
  client_name: string
  po: string
  timing: 'asap' | 'scheduled'
  roundtrip: boolean
  cargo_only: boolean
  operator_name: string
  aircraft_type: string
  tail: string
  vendor_cost: number
  client_price: number
  pay_terms: string
  invoice_email: string
  /** Invoice CC (AP). Not used for ETA / tracking. */
  cc_emails: string[]
  /** ETA sheet + portal tracking recipients (supply chain / bases). */
  eta_emails?: string[]
  send_invoice: boolean
  referred_by: string
  /** Optional one-off profit share $ (otherwise uses referral directory default). */
  referral_share_amount?: number | null
  referral_id?: string | null
  notes: string
  legs: Array<{
    origin_icao: string
    dest_icao: string
    date: string
    pax: number
    repo_time: string
    live_leg_time: string
  }>
}

export type TripLegStatus = 'pending' | 'active' | 'done'

export type TripLegRow = {
  id: string
  seq: number
  type: string
  label: string
  status: TripLegStatus
  origin?: string
  dest?: string
  est_start: string | null
  est_end: string | null
  actual_start: string | null
  actual_end: string | null
  one_tap_token: string
  party: string
}

export type TripParticipant = {
  id: string
  role: string
  name: string
  /** Company / org for Chat roster: Name - Company - Role. */
  company: string
  cell: string
  email: string
  /** On the ops SMS thread (false for portal-only clients). */
  in_thread: boolean
  released_at: string | null
  /** When true, invite SMS/email already sent. */
  invite_sent_at: string | null
}

export type ThreadMessage = {
  id: string
  at: string
  from: string
  channel: 'sms' | 'email' | 'web'
  body: string
  parsed_kind: string | null
}

export type TripDocument = {
  id: string
  kind: 'quote' | 'eta_sheet' | 'manifest' | 'pod' | 'coi' | 'd085' | 'other'
  title: string
  at: string
  url: string
}

export type TripInvoice = {
  id: string
  qb_invoice_id: string
  total: number
  status: 'draft' | 'sent' | 'viewed' | 'paid'
  url: string
  created_at: string
}

export type TripStoreRow = {
  id: string
  ref: number
  /**
   * Internal unique trip code — 2 letters + 3 digits (e.g. AB123).
   * Shown on Dispatch cards; distinct from numeric `ref`.
   */
  code: string
  state: TripState
  lane: string
  payload_summary: string
  ready_label: string
  candidates: Candidate[]
  offers: OfferRow[]
  events: Array<{ at: string; actor: string; kind: string; payload: Record<string, unknown> }>
  /**
   * Desk default margin % when building client totals from operator NET.
   * Null/undefined → DEFAULT_OFFER_MARGIN_PCT.
   */
  offer_margin_pct?: number | null
  hard_quote?: {
    total: number
    accept_token: string
    disclosure_text?: string
    disclosure_at?: string
    /** When the hard quote was sent / locked for the client. */
    sent_at?: string
    /** Client accept/decline stamp (desk also derives from trip state). */
    client_decision?: 'accepted' | 'declined'
    accepted_at?: string
    declined_at?: string
    payload_kind: 'cargo' | 'pax' | 'both'
    /**
     * Multi-option cards. Client surfaces: label, aircraft type, timing, price.
     * Never show operator_name / cost / margin on client accept / portal.
     */
    options?: Array<{
      offer_id: string
      label: string
      client_total: number
      eta_end: string | null
      fee_scope: FeeScope | null
      /** Client-safe aircraft type (not carrier name). */
      type_name?: string | null
      time_to_position_min?: number | null
      quick_turn_min?: number | null
      live_leg_min?: number | null
      /** Desk-only — never render on client accept / portal. */
      operator_name?: string
      tail?: string | null
    }>
  }
  lost_reason?: string
  quick?: QuickDispatchMeta
  /** Single ETA chain SoT — copied onto the trip at estimate/book. */
  eta_chain: ChainLeg[]
  service_pattern: ServicePattern | null
  promised_delivery: string | null
  eta_defaults_snapshot: EtaDefaults | null
  /** Assigned SMS thread DID from pool. */
  thread_number: string | null
  thread_disbanded_at: string | null
  legs: TripLegRow[]
  participants: TripParticipant[]
  thread: ThreadMessage[]
  documents: TripDocument[]
  invoice: TripInvoice | null
  client_id?: string
  /** Denormalized client display name for Dispatch cards / docs. */
  client_name?: string | null
  /** Portal / dispatch request that spawned this trip. */
  request_id?: string
  /** Closest piston / turboprop / jet shortlist (Phase A). */
  shortlist?: BandShortlist | null
  po_number?: string | null
  /** Optional OnFly vendor # printed on the client invoice (some APs require it). */
  vendor_number?: string | null
  declared_value_usd?: number | null
  hard_deadline_at?: string | null
  forklift_recommended?: boolean
  forklift_required?: boolean
  /**
   * INTL cargo: desk still needs to create a House Air Waybill.
   * Set when availability is sent (or on book); cleared when AWB is done.
   */
  awb_needed?: boolean
  awb_cleared_at?: string | null
  /** Client portal street / door addresses (pickup & drop-off cards). */
  portal_pickup_address?: string | null
  portal_dropoff_address?: string | null
  /** Optional passenger names for portal cargo card. */
  portal_pax_names?: string[]
  /**
   * Structured passengers (name / weight / DOB) — often filled post booking
   * on the waterfall / trip page when details arrive late.
   */
  passengers?: TripPassenger[]
  /** Referral partner attached at book (profit share → financials). */
  referral?: {
    id: string | null
    name: string
    share_amount: number | null
  } | null
}

function syncLegsFromChain(t: TripStoreRow, chain: ChainLeg[]): void {
  t.eta_chain = chain
  if (!t.legs.length) {
    t.legs = asTripLegs(materializeChainToLegs(chain))
    return
  }
  t.legs = asTripLegs(applyChainToLegs(t.legs, chain))
}

const trips = new Map<string, TripStoreRow>()
/** Desk-deleted trip ids — block live hydrate from resurrecting until DB catches up. */
const deletedTripIds = new Set<string>()
/** Desk-removed offers (`tripId:offerId`) — same hydrate race guard. */
const deletedOfferKeys = new Set<string>()
/**
 * Trip ids ever seen in a successful active hydrate. Used to prune local
 * ghosts that soft-delete / close removed from the DB payload.
 */
const syncedFromDbIds = new Set<string>()

const TRIP_TOMBSTONE_KEY = 'onfly.trips.discarded.v1'
const OFFER_TOMBSTONE_KEY = 'onfly.offers.discarded.v1'

function loadTombstones(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const tripsRaw = localStorage.getItem(TRIP_TOMBSTONE_KEY)
    if (tripsRaw) {
      const ids = JSON.parse(tripsRaw) as unknown
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === 'string' && id) deletedTripIds.add(id)
        }
      }
    }
    const offersRaw = localStorage.getItem(OFFER_TOMBSTONE_KEY)
    if (offersRaw) {
      const keys = JSON.parse(offersRaw) as unknown
      if (Array.isArray(keys)) {
        for (const key of keys) {
          if (typeof key === 'string' && key.includes(':')) {
            deletedOfferKeys.add(key)
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
}

function persistTombstones(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      TRIP_TOMBSTONE_KEY,
      JSON.stringify([...deletedTripIds]),
    )
    localStorage.setItem(
      OFFER_TOMBSTONE_KEY,
      JSON.stringify([...deletedOfferKeys]),
    )
  } catch {
    /* ignore */
  }
}
let refSeq = 2000
const listeners = new Set<() => void>()
let snapshot: TripStoreRow[] = []

function rebuild() {
  snapshot = [...trips.values()].sort((a, b) => b.ref - a.ref)
}

function usedTripCodes(exceptId?: string): Set<string> {
  const used = new Set<string>()
  for (const t of trips.values()) {
    if (exceptId && t.id === exceptId) continue
    if (t.code && isValidTripCode(t.code)) used.add(normalizeTripCode(t.code))
  }
  return used
}

function allocateTripCode(exceptId?: string): string {
  return generateTripCode(usedTripCodes(exceptId))
}

/** Backfill missing/invalid codes on hydrated or legacy local trips. */
export function ensureTripCodes(): void {
  let changed = false
  const used = usedTripCodes()
  for (const t of trips.values()) {
    if (t.code && isValidTripCode(t.code)) {
      t.code = normalizeTripCode(t.code)
      used.add(t.code)
      continue
    }
    t.code = generateTripCode(used)
    used.add(t.code)
    changed = true
    schedulePersist(t.id)
  }
  if (changed) bump()
}

function persistLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...trips.values()]))
  } catch {
    /* quota / private mode */
  }
}

function loadLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as TripStoreRow[]
    if (!Array.isArray(parsed)) return
    for (const row of parsed) {
      if (!row?.id || !row.state) continue
      if (deletedTripIds.has(row.id)) continue
      // Backfill ETA spine fields for older localStorage snapshots
      if (!Array.isArray(row.eta_chain)) row.eta_chain = []
      if (row.service_pattern === undefined) row.service_pattern = null
      if (row.promised_delivery === undefined) row.promised_delivery = null
      if (row.eta_defaults_snapshot === undefined) row.eta_defaults_snapshot = null
      if (row.thread_number === undefined) row.thread_number = null
      if (row.thread_disbanded_at === undefined) row.thread_disbanded_at = null
      if (!Array.isArray(row.legs)) row.legs = []
      if (!Array.isArray(row.participants)) row.participants = []
      if (!row.code || !isValidTripCode(String(row.code))) {
        row.code = ''
      } else {
        row.code = normalizeTripCode(String(row.code))
      }
      row.participants = row.participants.map((p) => ({
        ...p,
        company: p.company ?? '',
        in_thread: p.in_thread ?? true,
        released_at: p.released_at ?? null,
        invite_sent_at: p.invite_sent_at ?? null,
      }))
      if (!Array.isArray(row.offers)) row.offers = []
      row.offers = row.offers
        .filter((o) => !deletedOfferKeys.has(`${row.id}:${o.id}`))
        .map((o) => ({
          ...o,
          fee_scope: o.fee_scope ?? null,
          notes: o.notes ?? null,
          duty_available_min: o.duty_available_min ?? null,
          duty_included_min: o.duty_included_min ?? null,
          declined_acked_at: o.declined_acked_at ?? null,
          notified_at: o.notified_at ?? null,
          quick_turn_min: o.quick_turn_min ?? null,
        }))
      if (row.shortlist === undefined) row.shortlist = null
      if (row.request_id === undefined) row.request_id = undefined
      trips.set(row.id, row)
      if (typeof row.ref === 'number' && row.ref >= refSeq) refSeq = row.ref + 1
    }
  } catch {
    /* ignore */
  }
}

function bump() {
  rebuild()
  persistLocal()
  persistTombstones()
  for (const l of listeners) l()
}

loadTombstones()
loadLocal()
ensureTripCodes()
rebuild()

export function subscribeTrips(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Test-only — clear in-memory trips (does not wipe localStorage). */
export function __resetTripsForTests(): void {
  trips.clear()
  deletedTripIds.clear()
  deletedOfferKeys.clear()
  syncedFromDbIds.clear()
  refSeq = 2000
  rebuild()
  for (const l of listeners) l()
}

export function listTripsStable(): TripStoreRow[] {
  return snapshot
}

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.trim().startsWith('+') && digits.length >= 10) return `+${digits}`
  return null
}

export type ResolvedOperatorContacts = {
  contact_cell: string
  contact_email: string
  quote_link_channel: 'sms' | 'email' | 'both'
  /** Legacy flag — we no longer invent cells; always false for new resolves. */
  cell_is_mock: boolean
}

/**
 * Resolve RFQ contacts from network profile → onboard → drafts.
 * Never invents a phone — blank means fill before notify.
 */
export function resolveOperatorContacts(
  operatorId: string,
  operatorName: string,
): ResolvedOperatorContacts {
  const netOp = getCachedNetwork()?.operators.find((o) => o.id === operatorId)
  let cell = normalizePhone(netOp?.contact_cell) || ''
  let email = (netOp?.contact_email || netOp?.ops_email || '').trim()
  let channel: 'sms' | 'email' | 'both' =
    netOp?.quote_link_channel === 'sms' ||
    netOp?.quote_link_channel === 'email' ||
    netOp?.quote_link_channel === 'both'
      ? netOp.quote_link_channel
      : 'both'

  if (!cell || !email) {
    const onboard = listOnboardSubmissions().find(
      (s) =>
        s.company_name.trim().toLowerCase() ===
        operatorName.trim().toLowerCase(),
    )
    if (onboard) {
      if (!cell) {
        cell =
          normalizePhone(
            onboard.after_hours_phone ||
              onboard.primary_contact?.phone ||
              onboard.company_phone,
          ) || ''
      }
      if (!email) {
        email = (
          onboard.primary_contact?.email ||
          onboard.email ||
          ''
        ).trim()
      }
    }
  }
  if (!cell || !email) {
    const draft = listOperatorDrafts().find(
      (d) =>
        d.name.trim().toLowerCase() === operatorName.trim().toLowerCase(),
    )
    if (draft) {
      if (!cell) cell = normalizePhone(draft.contacts?.[0]?.cell) || ''
      if (!email) email = (draft.contacts?.[0]?.email || '').trim()
    }
  }

  return {
    contact_cell: cell,
    contact_email: email,
    quote_link_channel: channel,
    cell_is_mock: false,
  }
}

/** Resolve RFQ contact from onboard / drafts; fallback is stable E.164 from operator id. */
export function resolveOperatorContactCell(
  operatorId: string,
  operatorName: string,
): string {
  return resolveOperatorContacts(operatorId, operatorName).contact_cell
}

export function buildOfferRow(
  tripId: string,
  c: Candidate,
  _index: number,
): OfferRow {
  const contacts = resolveOperatorContacts(c.operator_id, c.operator_name)
  return {
    id: crypto.randomUUID(),
    trip_id: tripId,
    operator_id: c.operator_id,
    operator_name: c.operator_name,
    aircraft_id: c.aircraft_id,
    tail: c.tail,
    type_name: c.type_name,
    state: 'pinged',
    ping_sent_at: null,
    notified_at: null,
    declined_acked_at: null,
    replied_at: null,
    time_to_position_min: null,
    quick_turn_min: null,
    live_leg_min: null,
    wait_ok: null,
    max_wait_hrs: null,
    price_net: null,
    fee_scope: null,
    notes: null,
    duty_available_min: null,
    duty_included_min: null,
    magic_token: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    bookingGated: c.bookingGated,
    needsInfo: c.needsInfo,
    contact_cell: contacts.contact_cell,
    contact_cell_is_mock: contacts.cell_is_mock,
    contact_email: contacts.contact_email,
    quote_link_channel: contacts.quote_link_channel,
  }
}

/**
 * Create trip at draft with banded shortlist, then transition → routed.
 * No offers yet — dispatcher approves shortlist to spool.
 */
export function createRoutedTripWithShortlist(opts: {
  request_id?: string
  client_id?: string
  client_name?: string | null
  lane: string
  payload_summary: string
  ready_label: string
  payload_kind: 'cargo' | 'pax' | 'both'
  candidates: Candidate[]
  shortlist: BandShortlist
  po_number?: string
  declared_value_usd?: number | null
  hard_deadline_at?: string | null
  forklift_recommended?: boolean
  forklift_required?: boolean
}): TripStoreRow {
  const id = crypto.randomUUID()
  const chain = copyChainToTrip(
    opts.candidates.find((c) => c.chain?.length)?.chain ?? [],
  )
  const defaults = getEtaDefaults()
  const legs = chain.length ? asTripLegs(materializeChainToLegs(chain)) : []
  const row: TripStoreRow = {
    id,
    ref: ++refSeq,
    code: allocateTripCode(),
    state: 'draft',
    lane: opts.lane,
    payload_summary: opts.payload_summary,
    ready_label: opts.ready_label,
    candidates: opts.candidates,
    offers: [],
    client_id: opts.client_id,
    client_name: opts.client_name?.trim() || null,
    request_id: opts.request_id,
    shortlist: opts.shortlist,
    po_number: opts.po_number ?? null,
    declared_value_usd: opts.declared_value_usd ?? null,
    hard_deadline_at: opts.hard_deadline_at ?? null,
    forklift_recommended: opts.forklift_recommended ?? false,
    forklift_required: opts.forklift_required ?? false,
    eta_chain: chain,
    service_pattern: null,
    promised_delivery: projectedDeliveryUtc(chain),
    eta_defaults_snapshot: { ...defaults },
    thread_number: null,
    thread_disbanded_at: null,
    legs,
    participants: [
      {
        id: crypto.randomUUID(),
        role: 'dispatcher',
        name: 'On-shift',
        company: 'OnFly Air',
        cell: '',
        email: '',
        in_thread: true,
        released_at: null,
        invite_sent_at: null,
      },
    ],
    thread: [],
    documents: [],
    invoice: null,
    events: [
      {
        at: new Date().toISOString(),
        actor: 'system',
        kind: 'created_from_request',
        payload: {
          request_id: opts.request_id ?? null,
          client_id: opts.client_id ?? null,
          shortlist_tails: [
            opts.shortlist.piston?.tail,
            opts.shortlist.turboprop?.tail,
            opts.shortlist.jet?.tail,
          ].filter(Boolean),
        },
      },
      {
        at: new Date().toISOString(),
        actor: 'system',
        kind: 'payload_kind',
        payload: { payload_kind: opts.payload_kind },
      },
    ],
  }
  trips.set(id, row)
  bump()
  schedulePersist(id)
  return safeTransitionTrip(id, 'routed', 'system', {
    reason: 'Banded shortlist ready for approve → spool',
  })
}

export function createTripFromCandidates(opts: {
  lane: string
  payload_summary: string
  ready_label: string
  candidates: Candidate[]
  payload_kind: 'cargo' | 'pax' | 'both'
  client_id?: string
  client_name?: string | null
  /** Prefer this chain when materializing legs (selected option). */
  selectedChain?: ChainLeg[]
  service_pattern?: ServicePattern | null
  forklift_required?: boolean
  forklift_recommended?: boolean
}): TripStoreRow {
  const id = crypto.randomUUID()
  const chain = copyChainToTrip(
    opts.selectedChain ??
      opts.candidates.find((c) => c.chain?.length)?.chain ??
      [],
  )
  const defaults = getEtaDefaults()
  const legs = chain.length ? asTripLegs(materializeChainToLegs(chain)) : []
  const row: TripStoreRow = {
    id,
    ref: ++refSeq,
    code: allocateTripCode(),
    state: 'quoted_estimated',
    lane: opts.lane,
    payload_summary: opts.payload_summary,
    ready_label: opts.ready_label,
    candidates: opts.candidates,
    offers: opts.candidates.slice(0, 5).map((c, i) =>
      buildOfferRow(id, c, i),
    ),
    client_id: opts.client_id,
    client_name: opts.client_name?.trim() || null,
    shortlist: null,
    eta_chain: chain,
    service_pattern: opts.service_pattern ?? null,
    forklift_required: opts.forklift_required ?? false,
    forklift_recommended: opts.forklift_recommended ?? false,
    promised_delivery: projectedDeliveryUtc(chain),
    eta_defaults_snapshot: { ...defaults },
    thread_number: null,
    thread_disbanded_at: null,
    legs,
    participants: [
      {
        id: crypto.randomUUID(),
        role: 'dispatcher',
        name: 'On-shift',
        company: 'OnFly Air',
        cell: '',
        email: '',
        in_thread: true,
        released_at: null,
        invite_sent_at: null,
      },
    ],
    thread: [],
    documents: [],
    invoice: null,
    events: [
      {
        at: new Date().toISOString(),
        actor: 'dispatcher',
        kind: 'created_from_estimate',
        payload: {
          client_id: opts.client_id ?? null,
          client_name: opts.client_name?.trim() || null,
          chain_legs: legs.length,
        },
      },
      {
        at: new Date().toISOString(),
        actor: 'system',
        kind: 'payload_kind',
        payload: { payload_kind: opts.payload_kind },
      },
    ],
  }
  trips.set(id, row)
  bump()
  schedulePersist(id)
  return row
}

export function createQuickDispatchTrip(meta: QuickDispatchMeta): TripStoreRow {
  const id = crypto.randomUUID()
  const lane = meta.legs
    .map((l) => `${l.origin_icao || '?'}→${l.dest_icao || '?'}`)
    .join(' · ')
  // Materialize ETA spine from desk repo/live times so Tracking + ETA sheet work.
  const chain = copyChainToTrip(
    buildQuickDispatchChain(meta.legs, { timing: meta.timing }),
  )
  const legs = chain.length
    ? asTripLegs(materializeChainToLegs(chain))
    : buildQuickLegs(meta)
  const row: TripStoreRow = {
    id,
    ref: ++refSeq,
    code: allocateTripCode(),
    state: 'booked',
    lane,
    payload_summary: meta.cargo_only
      ? `cargo · ${meta.tail || 'TBD'}`
      : `${meta.legs.reduce((n, l) => n + l.pax, 0)} pax · ${meta.tail || 'TBD'}`,
    ready_label: meta.timing === 'asap' ? 'ASAP' : meta.legs[0]?.date || 'scheduled',
    candidates: [],
    offers: [],
    quick: structuredClone(meta),
    client_id: meta.client_id,
    client_name: meta.client_name?.trim() || null,
    eta_chain: chain,
    service_pattern: 'A2A',
    promised_delivery: projectedDeliveryUtc(chain),
    eta_defaults_snapshot: { ...getEtaDefaults() },
    thread_number: null,
    thread_disbanded_at: null,
    legs,
    participants: buildQuickParticipants(meta),
    thread: [],
    documents: [
      {
        id: crypto.randomUUID(),
        kind: 'eta_sheet',
        title: `ETA sheet · PO ${meta.po || 'TBD'}`,
        at: new Date().toISOString(),
        url: `#eta-${id.slice(0, 8)}`,
      },
    ],
    invoice: null,
    hard_quote: {
      total: meta.client_price,
      accept_token: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
      payload_kind: meta.cargo_only ? 'cargo' : 'pax',
    },
    referral: (() => {
      const person = meta.referral_id ? getReferral(meta.referral_id) : undefined
      if (!person) return null
      const share = computeReferralShareAmount({
        share_mode: person.share_mode,
        share_value: person.share_value,
        margin: meta.client_price - meta.vendor_cost,
        override_amount: meta.referral_share_amount,
      })
      return {
        id: person.id,
        name: person.name,
        share_amount: share,
      }
    })(),
    events: [
      {
        at: new Date().toISOString(),
        actor: 'dispatcher',
        kind: 'quick_dispatch',
        payload: {
          po: meta.po,
          client_id: meta.client_id,
          vendor_cost: meta.vendor_cost,
          client_price: meta.client_price,
        },
      },
      {
        at: new Date().toISOString(),
        actor: 'system',
        kind: 'payload_kind',
        payload: { payload_kind: meta.cargo_only ? 'cargo' : 'pax' },
      },
      ...(chain.length
        ? [
            {
              at: new Date().toISOString(),
              actor: 'system' as const,
              kind: 'eta_chain_copied_to_trip',
              payload: { count: chain.length, pattern: 'A2A', via: 'quick_dispatch' },
            },
          ]
        : []),
    ],
  }
  trips.set(id, row)
  bump()
  schedulePersist(id)
  void import('@/lib/ensureFinancialFromTrip').then((m) =>
    m.ensureFinancialFromBookedTrip(getTrip(id)!),
  )
  return row
}

export function getTrip(id: string) {
  return trips.get(id) ?? null
}

/** Ensure a hydrated/stub trip is editable in this session (portal address save). */
export function ensureTripInSession(row: TripStoreRow): TripStoreRow {
  const existing = trips.get(row.id)
  if (existing) return existing
  trips.set(row.id, row)
  bump()
  return row
}

/**
 * Remove a trip from the desk queue (local + soft-delete in Supabase).
 * Does not hard-DELETE — trip_events are append-only. Sets trips.discarded_at.
 */
export function deleteTrip(id: string): boolean {
  if (!trips.has(id) && !deletedTripIds.has(id)) return false
  deletedTripIds.add(id)
  for (const key of [...deletedOfferKeys]) {
    if (key.startsWith(`${id}:`)) deletedOfferKeys.delete(key)
  }
  trips.delete(id)
  bump()
  void import('@/lib/db/persistTrip')
    .then(async (m) => {
      // Keep tombstone until a successful hydrate confirms the trip is gone.
      // Clearing on discard-ok races an in-flight poll and resurrects the card.
      await m.deleteTripFromDb(id)
    })
    .catch((e) => console.warn('[trips] discard in db failed', id, e))
  return true
}

/**
 * Remove one operator offer from a trip (waterfall cleanup).
 * Does not change trip state. Hard-deletes the offer row + orphan sync.
 */
export function removeOfferFromTrip(tripId: string, offerId: string): boolean {
  const trip = trips.get(tripId)
  if (!trip) return false
  const before = trip.offers.length
  const removed = trip.offers.find((o) => o.id === offerId)
  if (!removed) return false
  const tombstone = `${tripId}:${offerId}`
  deletedOfferKeys.add(tombstone)
  const at = new Date().toISOString()
  mutateTrip(tripId, (t) => {
    t.offers = t.offers.filter((o) => o.id !== offerId)
    if (t.hard_quote?.options?.length) {
      t.hard_quote.options = t.hard_quote.options.filter(
        (o) => o.offer_id !== offerId,
      )
      if (t.hard_quote.options.length) {
        t.hard_quote.total = Math.min(
          ...t.hard_quote.options.map((o) => o.client_total),
        )
      }
    }
    t.events.push({
      at,
      actor: 'dispatcher',
      kind: 'offer_removed',
      payload: {
        offer_id: offerId,
        operator_name: removed.operator_name,
        previous_count: before,
      },
    })
  })
  void import('@/lib/db/persistTrip')
    .then(async (m) => {
      await m.deleteOfferFromDb(offerId)
      await m.persistOfferRemovedEvent({
        tripId,
        offerId,
        operatorName: removed.operator_name,
        previousCount: before,
        at,
      })
      // Tombstone clears only when a non-empty hydrate omits this offer.
    })
    .catch((e) => console.warn('[trips] offer delete in db failed', offerId, e))
  return true
}

/** Merge DB rows into session (does not wipe local-only trips still syncing). */
export function replaceTripsFromDb(
  rows: TripStoreRow[],
  opts?: { emptyOk?: boolean },
): void {
  // Empty hydrate must not clear tombstones — live poll can briefly return []
  // while a delete is in flight; clearing would let the next tick resurrect.
  // Only prune when the caller confirms a successful empty active desk.
  if (!rows.length) {
    if (opts?.emptyOk) {
      for (const id of [...syncedFromDbIds]) {
        trips.delete(id)
        deletedTripIds.delete(id)
        syncedFromDbIds.delete(id)
        for (const key of [...deletedOfferKeys]) {
          if (key.startsWith(`${id}:`)) deletedOfferKeys.delete(key)
        }
      }
      bump()
      void flushLocalOnlyTrips(new Set())
    }
    return
  }

  const dbIds = new Set(rows.map((r) => r.id))
  for (const id of dbIds) syncedFromDbIds.add(id)

  const offerPersistIds = new Set<string>()

  for (const r of rows) {
    if (deletedTripIds.has(r.id)) {
      // Still present in DB after desk delete — keep out of UI and retry soft-delete.
      // Do not clear the tombstone on discard-ok (in-flight hydrate race).
      void import('@/lib/db/persistTrip')
        .then(async (m) => {
          await m.deleteTripFromDb(r.id)
        })
        .catch((e) =>
          console.warn('[trips] retry discard from db failed', r.id, e),
        )
      continue
    }

    const existing = trips.get(r.id)
    const hydratedOffers = r.offers ?? []

    // Live hydrate can return [] when offers.hydrate fails — do not wipe local
    // offers or clear tombstones (that resurrected deleted waterfall rows).
    if (!hydratedOffers.length && existing?.offers.length) {
      r.offers = existing.offers.filter(
        (o) => !deletedOfferKeys.has(`${r.id}:${o.id}`),
      )
    } else {
      const keptOffers = hydratedOffers.filter(
        (o) => !deletedOfferKeys.has(`${r.id}:${o.id}`),
      )
      if (keptOffers.length < hydratedOffers.length) {
        offerPersistIds.add(r.id)
      }
      r.offers = keptOffers

      // Only clear tombstones when a non-empty hydrate confirms the row is gone.
      if (hydratedOffers.length > 0) {
        for (const key of [...deletedOfferKeys]) {
          if (!key.startsWith(`${r.id}:`)) continue
          const offerId = key.slice(r.id.length + 1)
          if (!hydratedOffers.some((o) => o.id === offerId)) {
            deletedOfferKeys.delete(key)
          }
        }
      }
    }

    if (existing) {
      // Preserve richer session overlays until DB catches up.
      if (!r.request_id && existing.request_id) {
        r.request_id = existing.request_id
      }
      if (!r.events.length && existing.events.length) r.events = existing.events
      else if (r.events.length && existing.events.length) {
        r.events = mergeTripEvents(r.events, existing.events)
      }
      if (!r.thread.length && existing.thread.length) r.thread = existing.thread
      if (!r.documents.length && existing.documents.length) {
        r.documents = existing.documents
      }
      if (!r.eta_chain.length && existing.eta_chain.length) {
        r.eta_chain = existing.eta_chain
        r.service_pattern = r.service_pattern ?? existing.service_pattern
        r.promised_delivery = r.promised_delivery ?? existing.promised_delivery
      }
      // Live hydrate can briefly return empty legs before trip_legs upserts land.
      if (!r.legs.length && existing.legs.length) {
        r.legs = existing.legs
      }
      // Keep desk-parsed client name — live hydrate can briefly omit session_meta.
      if (!r.client_name?.trim() && existing.client_name?.trim()) {
        r.client_name = existing.client_name
      }
      if (!r.client_id && existing.client_id) {
        r.client_id = existing.client_id
      } else if (
        existing.client_id &&
        r.client_id &&
        existing.client_id !== r.client_id &&
        getClient(existing.client_id) &&
        !getClient(r.client_id)
      ) {
        // Directory is keyed by legacy_key; hydrated trips.client_id is UUID.
        r.client_id = existing.client_id
      }
      // Desk pricing edits race the 4s live hydrate — keep local hard_quote
      // until the DB event log includes the same pricing update.
      if (existing.hard_quote) {
        const localPricing = [...existing.events]
          .reverse()
          .find((e) => e.kind === 'hard_quote_pricing_updated')
        const dbHasPricing =
          localPricing != null &&
          r.events.some(
            (e) =>
              e.kind === 'hard_quote_pricing_updated' &&
              e.at === localPricing.at,
          )
        if (localPricing && !dbHasPricing) {
          r.hard_quote = existing.hard_quote
          r.offer_margin_pct = existing.offer_margin_pct
        }
      }
    }
    if (!r.request_id) {
      const fromEvent = [...r.events]
        .reverse()
        .find((e) => e.kind === 'created_from_request')
      const rid = fromEvent?.payload?.request_id
      if (typeof rid === 'string' && rid.trim()) r.request_id = rid.trim()
    }
    if (!r.code || !isValidTripCode(r.code)) {
      r.code = allocateTripCode(r.id)
    } else {
      r.code = normalizeTripCode(r.code)
    }
    trips.set(r.id, r)
    if (r.ref >= refSeq) refSeq = r.ref + 1
  }

  // Drop local ghosts that used to be on the active desk but are gone now
  // (soft-deleted, closed, or cancelled — hydrate filters those out).
  for (const id of [...trips.keys()]) {
    if (dbIds.has(id)) continue
    if (deletedTripIds.has(id) || syncedFromDbIds.has(id)) {
      trips.delete(id)
      syncedFromDbIds.delete(id)
    }
  }

  // Trip tombstones confirmed absent from this hydrate payload.
  for (const id of [...deletedTripIds]) {
    if (!dbIds.has(id)) {
      deletedTripIds.delete(id)
      syncedFromDbIds.delete(id)
    }
  }


  bump()
  // Push any local-only trips that never made it to DB (never re-push tombstoned).
  void flushLocalOnlyTrips(dbIds)

  for (const id of offerPersistIds) {
    void flushPersistTrip(id)
  }
}

function mergeTripEvents(
  dbEvents: TripStoreRow['events'],
  localEvents: TripStoreRow['events'],
): TripStoreRow['events'] {
  const keyOf = (e: TripStoreRow['events'][number]) =>
    `${e.at}|${e.kind}|${e.actor}|${JSON.stringify(e.payload ?? {})}`
  const seen = new Set(dbEvents.map(keyOf))
  const merged = [...dbEvents]
  for (const e of localEvents) {
    if (seen.has(keyOf(e))) continue
    seen.add(keyOf(e))
    merged.push(e)
  }
  return merged.sort((a, b) => a.at.localeCompare(b.at))
}

async function flushLocalOnlyTrips(knownDbIds: Set<string>): Promise<void> {
  for (const [id] of trips) {
    if (deletedTripIds.has(id)) continue
    if (!knownDbIds.has(id)) await flushPersistTrip(id)
  }
}

/** Attach / replace legs + eta_chain from a quote chain (book / hard-quote select). */
export function materializeTripLegsFromChain(
  tripId: string,
  chain: ChainLeg[],
  opts?: { pattern?: ServicePattern | null; lockPromised?: boolean },
): void {
  if (!chain.length) return
  const copied = copyChainToTrip(chain)
  mutateTrip(tripId, (t) => {
    if (t.legs.some((l) => l.actual_start || l.actual_end)) return
    t.eta_chain = copied
    t.legs = asTripLegs(materializeChainToLegs(copied))
    if (opts?.pattern) t.service_pattern = opts.pattern
    if (opts?.lockPromised !== false) {
      t.promised_delivery = projectedDeliveryUtc(copied)
    }
    if (!t.eta_defaults_snapshot) {
      t.eta_defaults_snapshot = { ...getEtaDefaults() }
    }
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'eta_chain_copied_to_trip',
      payload: { count: copied.length, pattern: t.service_pattern },
    })
  })
}

/** Apply operator-quoted TTP onto trip chain + matching candidate → recompute. */
export function applyOfferTtpToTrip(
  tripId: string,
  offerId: string,
  ttpMin: number,
): void {
  mutateTrip(tripId, (t) => {
    const offer = t.offers.find((o) => o.id === offerId)
    if (!offer) return

    // Update candidate chain (offer board / magic link same numbers)
    const cand =
      t.candidates.find((c) => c.aircraft_id === offer.aircraft_id) ??
      t.candidates.find((c) => c.tail === offer.tail)
    if (cand?.chain?.length) {
      const { chain } = applyQuotedTtp(cand.chain, ttpMin)
      cand.chain = chain
      cand.eta_end = projectedDeliveryUtc(chain) ?? cand.eta_end
    }

    if (t.eta_chain.length) {
      const { chain, slippedMinutes } = applyQuotedTtp(t.eta_chain, ttpMin)
      syncLegsFromChain(t, chain)
      t.events.push({
        at: new Date().toISOString(),
        actor: offer.operator_name,
        kind: 'eta_ttp_quoted',
        payload: { offer_id: offerId, ttp_min: ttpMin, slipped_min: slippedMinutes },
      })
    }
  })
}

/** Apply operator-quoted live leg minutes onto the first air_leg. */
export function applyOfferLiveLegToTrip(
  tripId: string,
  offerId: string,
  liveLegMin: number,
): void {
  if (!(liveLegMin > 0)) return
  mutateTrip(tripId, (t) => {
    const offer = t.offers.find((o) => o.id === offerId)
    if (!offer) return

    const cand =
      t.candidates.find((c) => c.aircraft_id === offer.aircraft_id) ??
      t.candidates.find((c) => c.tail === offer.tail)

    const applyTo = (chain: typeof t.eta_chain) => {
      const air = chain.find((l) => l.type === 'air_leg')
      if (!air) return null
      return editDuration(chain, air.seq, liveLegMin, 'quoted')
    }

    if (cand?.chain?.length) {
      const updated = applyTo(cand.chain)
      if (updated) {
        cand.chain = updated.chain
        cand.eta_end = projectedDeliveryUtc(updated.chain) ?? cand.eta_end
      }
    }

    if (t.eta_chain.length) {
      const updated = applyTo(t.eta_chain)
      if (updated) {
        syncLegsFromChain(t, updated.chain)
        t.events.push({
          at: new Date().toISOString(),
          actor: offer.operator_name,
          kind: 'eta_live_leg_quoted',
          payload: {
            offer_id: offerId,
            live_leg_min: liveLegMin,
            slipped_min: updated.slippedMinutes,
          },
        })
      }
    }
  })
}

/** Dispatcher edits an assumption cell on the trip sheet. */
export function editTripEtaDuration(
  tripId: string,
  seq: number,
  durationMin: number,
  source: EtaSource = 'manual',
): void {
  mutateTrip(tripId, (t) => {
    if (!t.eta_chain.length) return
    const { chain, slippedMinutes } = editDuration(
      t.eta_chain,
      seq,
      durationMin,
      source,
    )
    syncLegsFromChain(t, chain)
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'eta_duration_edited',
      payload: { seq, duration_min: durationMin, source, slipped_min: slippedMinutes },
    })
    const threshold =
      t.eta_defaults_snapshot?.slip_threshold ?? BUILTIN_ETA_DEFAULTS.slip_threshold
    if (Math.abs(slippedMinutes) >= threshold) {
      raiseException({
        trip_id: t.id,
        trip_ref: t.ref,
        title: `ETA slip ${slippedMinutes > 0 ? '+' : ''}${slippedMinutes}m`,
        detail: `Dispatcher edit on node #${seq}`,
        severity: 'late',
        href: `/trips/${t.id}`,
      })
    }
  })
}

export function resetTripEtaDuration(tripId: string, seq: number): void {
  mutateTrip(tripId, (t) => {
    if (!t.eta_chain.length) return
    const defaults = t.eta_defaults_snapshot ?? getEtaDefaults()
    const { chain, slippedMinutes } = resetDurationToDefault(
      t.eta_chain,
      seq,
      defaults,
    )
    syncLegsFromChain(t, chain)
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'eta_duration_reset',
      payload: { seq, slipped_min: slippedMinutes },
    })
  })
}

export function getTripByOfferToken(token: string) {
  for (const t of trips.values()) {
    const o = t.offers.find((x) => x.magic_token === token)
    if (o) return { trip: t, offer: o }
  }
  return null
}

export function getTripByAcceptToken(token: string) {
  for (const t of trips.values()) {
    if (t.hard_quote?.accept_token === token) return t
  }
  return null
}

export function listTrips() {
  return [...trips.values()].sort((a, b) => b.ref - a.ref)
}

/**
 * Trips for the Chat roster — booked / in progress only.
 * Lost, offers, quotes, and trip detail stay in Dispatch waterfall.
 */
export function listChatTrips(): TripStoreRow[] {
  return [...trips.values()]
    .filter((t) => t.state === 'booked' || t.state === 'in_progress')
    .sort((a, b) => {
      if (a.state !== b.state) {
        return a.state === 'in_progress' ? -1 : 1
      }
      return b.ref - a.ref
    })
}

export function mutateTrip(id: string, fn: (t: TripStoreRow) => void) {
  const t = trips.get(id)
  if (!t) throw new Error('trip not found')
  fn(t)
  trips.set(id, t)
  bump()
  schedulePersist(id)
  return t
}

/** Client portal — save street / door addresses on pickup & drop-off cards. */
export function setPortalStopAddresses(
  tripId: string,
  patch: { pickup?: string; dropoff?: string; paxNames?: string[] },
): TripStoreRow {
  if (!trips.has(tripId)) {
    throw new Error('Trip not loaded in this session — refresh and try again')
  }
  return mutateTrip(tripId, (t) => {
    if (patch.pickup !== undefined) {
      t.portal_pickup_address = patch.pickup.trim() || null
    }
    if (patch.dropoff !== undefined) {
      t.portal_dropoff_address = patch.dropoff.trim() || null
    }
    if (patch.paxNames !== undefined) {
      t.portal_pax_names = patch.paxNames.map((n) => n.trim()).filter(Boolean)
    }
    t.events.push({
      at: new Date().toISOString(),
      actor: 'client',
      kind: 'portal_stop_addresses',
      payload: {
        pickup: t.portal_pickup_address,
        dropoff: t.portal_dropoff_address,
        pax_names: t.portal_pax_names ?? [],
      },
    })
  })
}

/**
 * Dispatcher — set structured passenger info (often post booking).
 * Keeps portal_pax_names in sync for the client tracker cargo card.
 */
export function setTripPassengers(
  tripId: string,
  passengers: TripPassenger[],
  actor = 'dispatcher',
): TripStoreRow {
  if (!trips.has(tripId)) {
    throw new Error('Trip not loaded in this session — refresh and try again')
  }
  const normalized = normalizeTripPassengers(passengers).filter((p) =>
    Boolean(p.name.trim() || p.dob || p.weight_lbs !== ''),
  )
  return mutateTrip(tripId, (t) => {
    t.passengers = normalized
    t.portal_pax_names = tripPassengerNames(normalized)
    t.events.push({
      at: new Date().toISOString(),
      actor,
      kind: 'passenger_info_updated',
      payload: {
        count: normalized.length,
        pax_names: t.portal_pax_names,
        passengers: normalized,
      },
    })
  })
}

export function safeTransitionTrip(
  id: string,
  to: TripState,
  actor: string,
  payload: Record<string, unknown> = {},
) {
  const prev = trips.get(id)
  if (!prev) throw new Error('trip not found')
  const fromState = prev.state
  // Validate before mutating so illegal edges never touch local state.
  transition(fromState, to, actor, payload)
  const result = mutateTrip(id, (t) => {
    const tr = transition(t.state, to, actor, payload)
    t.state = tr.to
    t.events.push({
      at: new Date().toISOString(),
      actor,
      kind: tr.event.kind,
      payload: tr.event.payload,
    })
  })
  void import('@/lib/db/persistTrip').then((m) =>
    m
      .syncTripTransition({
        trip: result,
        fromState,
        toState: to,
        actor,
        payload,
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e)
        if (/already in state/i.test(msg)) return
        console.warn('[trips] transition RPC failed — rolling back local state', msg)
        const cur = trips.get(id)
        if (!cur || cur.state !== to) return
        mutateTrip(id, (t) => {
          t.state = fromState
          for (let i = t.events.length - 1; i >= 0; i--) {
            const ev = t.events[i]
            if (
              ev?.kind === 'state_transition' &&
              (ev.payload.to === to || ev.payload.to_state === to)
            ) {
              t.events.splice(i, 1)
              break
            }
          }
        })
      }),
  )
  if (to === 'delivered') {
    void createInvoiceForTrip(id).catch((e) =>
      console.warn('[invoice] auto on delivered failed', e),
    )
  }
  return result
}

export function payloadKindOf(t: TripStoreRow): 'cargo' | 'pax' | 'both' {
  const ev = [...t.events].reverse().find((e) => e.kind === 'payload_kind')
  return (ev?.payload.payload_kind as 'cargo' | 'pax' | 'both') ?? 'cargo'
}

export function getTripByLegToken(token: string): {
  trip: TripStoreRow
  leg: TripLegRow
} | null {
  if (!token || token.startsWith('expired-')) return null
  for (const t of trips.values()) {
    if (t.thread_disbanded_at) continue
    const leg = t.legs.find((l) => l.one_tap_token === token)
    if (leg) return { trip: t, leg }
  }
  return null
}

export function completeLegCheckIn(
  token: string,
  actor = 'field',
  podNote?: string,
): { trip: TripStoreRow; leg: TripLegRow } | null {
  const hit = getTripByLegToken(token)
  if (!hit) return null
  const now = new Date().toISOString()
  let wantDelivered = false
  let wantInProgress = false
  mutateTrip(hit.trip.id, (t) => {
    const leg = t.legs.find((l) => l.id === hit.leg.id)
    if (!leg || leg.status === 'done') return
    const { legs: cascaded, slippedMinutes } = cascadeRecomputeFromActual(
      t.legs,
      leg.seq,
      { actual_start: leg.actual_start ?? now, actual_end: now },
    )
    t.legs = asTripLegs(cascaded).map((l) => {
      if (l.id !== leg.id) return l
      return {
        ...l,
        status: 'done',
        actual_start: l.actual_start ?? now,
        actual_end: now,
      }
    })
    if (t.eta_chain.length) {
      const { chain } = applyActual(t.eta_chain, {
        seq: leg.seq,
        actual_start: leg.actual_start ?? now,
        actual_end: now,
      })
      t.eta_chain = chain
    }
    const next = t.legs.find((l) => l.status === 'pending')
    if (next) {
      t.legs = t.legs.map((l) =>
        l.id === next.id ? { ...l, status: 'active' } : l,
      )
    }
    t.events.push({
      at: now,
      actor,
      kind: 'one_tap_checkin',
      payload: {
        leg_id: leg.id,
        label: leg.label,
        token,
        slipped_min: slippedMinutes,
      },
    })
    if (
      Math.abs(slippedMinutes) >= DEFAULT_LEG_DEFAULTS.slipThresholdMin
    ) {
      raiseException({
        trip_id: t.id,
        trip_ref: t.ref,
        title: `ETA slip ${slippedMinutes > 0 ? '+' : ''}${slippedMinutes}m`,
        detail: `${leg.label} actual moved the chain`,
        severity: 'late',
        href: `/trips/${t.id}`,
      })
    }
    if (leg.type === 'offload' || token.includes('del')) {
      t.documents.push({
        id: crypto.randomUUID(),
        kind: 'pod',
        title: podNote?.trim() || `POD · T-${t.ref}`,
        at: now,
        url: `#pod-${leg.id.slice(0, 8)}`,
      })
      if (t.state === 'booked' || t.state === 'in_progress') wantDelivered = true
    } else if (t.state === 'booked') {
      wantInProgress = true
    }
  })
  if (wantInProgress) {
    try {
      safeTransitionTrip(hit.trip.id, 'in_progress', actor, { via: 'one_tap' })
    } catch {
      /* ignore */
    }
  }
  if (wantDelivered) {
    try {
      // booked → in_progress → delivered when still booked
      const cur = getTrip(hit.trip.id)
      if (cur?.state === 'booked') {
        safeTransitionTrip(hit.trip.id, 'in_progress', actor, { via: 'one_tap' })
      }
      safeTransitionTrip(hit.trip.id, 'delivered', actor, { via: 'one_tap' })
    } catch {
      /* already past */
    }
  }
  return getTripByLegToken(token)
}

export function postThreadMessage(
  tripId: string,
  opts: { from: string; channel: ThreadMessage['channel']; body: string },
): ThreadMessage | null {
  let msg: ThreadMessage | null = null
  mutateTrip(tripId, (t) => {
    const parsed = parseThreadActual(opts.body)
    msg = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      from: opts.from,
      channel: opts.channel,
      body: opts.body.trim(),
      parsed_kind: parsed.kind === 'unknown' ? null : parsed.kind,
    }
    t.thread.push(msg)
    t.events.push({
      at: msg.at,
      actor: opts.from,
      kind: 'thread_message',
      payload: {
        parsed: msg.parsed_kind,
        channel: opts.channel,
        confidence: parsed.confidence,
      },
    })

    if (t.legs.length && parsed.kind !== 'unknown') {
      const applied = applyParsedActualToLegs(t.legs, parsed, msg.at)
      if (applied.appliedSeq != null) {
        t.legs = asTripLegs(applied.legs)
        // Keep trip eta_chain in lockstep (SoT) via the same recompute path
        if (t.eta_chain.length) {
          if (applied.autoApplied) {
            const endKinds = new Set(['wheels_down', 'delivered', 'arrived'])
            const { chain } = applyActual(t.eta_chain, {
              seq: applied.appliedSeq,
              actual_start: msg.at,
              actual_end: endKinds.has(parsed.kind) ? msg.at : undefined,
            })
            t.eta_chain = chain
          } else {
            const bySeq = new Map(t.legs.map((l) => [l.seq, l]))
            t.eta_chain = t.eta_chain.map((c) => {
              const l = bySeq.get(c.seq)
              if (!l) return c
              return {
                ...c,
                est_start: l.est_start ?? c.est_start,
                est_end: l.est_end ?? c.est_end,
              }
            })
          }
        }
        t.events.push({
          at: msg.at,
          actor: 'system',
          kind: applied.autoApplied
            ? 'thread_actual_applied'
            : 'thread_actual_suggested',
          payload: {
            seq: applied.appliedSeq,
            slipped_min: applied.slippedMinutes,
            kind: parsed.kind,
            auto: applied.autoApplied,
          },
        })
        const threshold =
          t.eta_defaults_snapshot?.slip_threshold ??
          DEFAULT_LEG_DEFAULTS.slipThresholdMin
        if (Math.abs(applied.slippedMinutes) >= threshold) {
          raiseException({
            trip_id: t.id,
            trip_ref: t.ref,
            title: `Thread ETA slip ${applied.slippedMinutes > 0 ? '+' : ''}${applied.slippedMinutes}m`,
            detail: `${parsed.kind} from ${opts.from}`,
            severity: 'attn',
            href: `/trips/${t.id}`,
          })
        }
      }
    }
  })
  return msg
}

/** Create QB invoice for a trip (ACH on). Email = branded Resend with PO + itinerary. */
const invoiceInFlight = new Set<string>()

/** @deprecated Use createInvoiceForTrip */
export async function createMockInvoiceForTrip(tripId: string): Promise<TripInvoice | null> {
  return createInvoiceForTrip(tripId)
}

export async function createInvoiceForTrip(
  tripId: string,
  opts?: {
    /** Skip QBO send — desk sends later from Approved actions. */
    skipEmail?: boolean
    to?: string[]
    cc?: string[]
    bcc?: string[]
    /** Force a PO; otherwise allocate last+1 for the client. */
    poNumber?: string
  },
): Promise<TripInvoice | null> {
  const t = trips.get(tripId)
  if (!t) return null
  if (t.invoice) return t.invoice
  if (invoiceInFlight.has(tripId)) return t.invoice
  invoiceInFlight.add(tripId)
  try {
  const total = t.quick?.client_price ?? t.hard_quote?.total ?? 0
  if (!(total > 0)) return null
  const { createAccountingAdapter } = await import('@/adapters/accounting')
  const { getClient, listInvoiceEmails } = await import('@/lib/clientStore')
  const { ONFLY_INFO_BCC } = await import('@/domain/onflyEmails')
  const { invoiceTripFacts } = await import('@/lib/invoiceTripFacts')
  const { resolveTripPoNumber } = await import('@/domain/tripPo')
  const acct = createAccountingAdapter()
  const client = t.client_id ? getClient(t.client_id) : undefined
  const clientName =
    t.quick?.client_name ?? client?.name ?? 'Client'
  const po =
    opts?.poNumber?.trim() || resolveTripPoNumber(t) || ''
  // Do not invent CLI0001 / sequential POs here — desk must enter the real PO.
  if (!po) return null
  mutateTrip(tripId, (row) => {
    row.po_number = po
    if (row.quick) row.quick.po = po
  })
  const txnDate = new Date().toISOString().slice(0, 10)
  const { getTaxRates } = await import('@/lib/taxRatesStore')
  const { buildTripInvoiceLines } = await import('@/domain/tripInvoiceBuild')
  const selected =
    t.offers.find((o) => o.state === 'selected') ??
    t.offers.find((o) => o.state === 'quoted')
  const mtow =
    t.candidates.find((c) => c.aircraft_id === selected?.aircraft_id)
      ?.mtow_lbs ??
    t.candidates.find((c) => c.tail === selected?.tail)?.mtow_lbs ??
    null
  const payloadKind =
    t.hard_quote?.payload_kind ??
    (t.quick ? (t.quick.cargo_only ? 'cargo' : 'pax') : payloadKindOf(t))
  const facts = invoiceTripFacts(trips.get(tripId) ?? t, {
    poNumber: po,
    clientName,
  })
  const payTerms = t.quick?.pay_terms ?? client?.pay_terms ?? facts.payTerms
  const { buildInvoiceCustomerMemo } = await import('@/domain/qbInvoice')
  const memo = buildInvoiceCustomerMemo({
    lane: facts.lane,
    flightDate: facts.flightDate,
    aircraftType: facts.aircraftType,
    tail: facts.tail,
    poNumber: po,
    payTerms,
    vendorNumber: (trips.get(tripId) ?? t).vendor_number,
    itineraryLines: facts.itineraryLines,
    pickupAddress: facts.pickupAddress,
    dropoffAddress: facts.dropoffAddress,
    extraNotes: facts.extraNotes,
  })
  const built = buildTripInvoiceLines({
    tripRef: t.ref,
    lane: facts.lane,
    flightDate: facts.flightDate,
    clientTotal: total,
    aircraftType: facts.aircraftType,
    tail: facts.tail,
    payloadKind,
    mtowLbs: mtow,
    rates: getTaxRates(),
  })
  const lines = built.lines
  const billEmail =
    opts?.to?.[0] ||
    t.quick?.invoice_email ||
    client?.invoice_email ||
    (t.client_id ? listInvoiceEmails(t.client_id)[0] : undefined) ||
    null
  let created
  try {
    created = await acct.createInvoice({
      customerName: clientName,
      customerId: client?.qb_customer_id ?? undefined,
      poNumber: po,
      txnDate,
      payTerms,
      tripRef: t.ref,
      lines,
      notes: memo,
      billEmail,
      allowOnlineAch: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[invoice] create failed — queued for retry', msg)
    const { enqueueInvoiceRetry } = await import('@/lib/invoiceRetryQueue')
    enqueueInvoiceRetry(tripId, msg)
    mutateTrip(tripId, (row) => {
      row.events.push({
        at: new Date().toISOString(),
        actor: 'system',
        kind: 'invoice_create_failed',
        payload: { error: msg },
      })
    })
    return null
  }

  // Persist QBO customer id on the client directory when we learn it
  if (t.client_id && created.customerId && !client?.qb_customer_id) {
    const { updateClient } = await import('@/lib/clientStore')
    updateClient(t.client_id, { qb_customer_id: created.customerId })
  }
  // Branded payment-request email (PO in subject + trip itinerary in body).
  const defaultTo = [
    ...(opts?.to ?? []),
    t.quick?.invoice_email,
    client?.invoice_email,
    ...(t.client_id ? listInvoiceEmails(t.client_id) : []),
    ...t.participants
      .filter((p) => p.role === 'client_ap' && p.email)
      .map((p) => p.email),
  ]
    .filter((e): e is string => Boolean(e?.includes('@')))
    .map((e) => e.toLowerCase())
  const uniqueTo = [...new Set(opts?.to?.length ? opts.to.map((e) => e.toLowerCase()) : defaultTo)]
  const uniqueCc = [
    ...new Set(
      (opts?.cc ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@') && !uniqueTo.includes(e)),
    ),
  ]
  const uniqueBcc = [
    ...new Set(
      [...(opts?.bcc ?? []), ONFLY_INFO_BCC]
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  ]
  const shouldEmail =
    !opts?.skipEmail &&
    uniqueTo.length > 0 &&
    (t.quick?.send_invoice ?? true)
  if (shouldEmail) {
    try {
      const mail = await buildTripInvoiceMailPayload({
        trip: trips.get(tripId) ?? t,
        poNumber: created.qbInvoiceNumber || po,
        clientName: facts.clientName,
        amountUsd: facts.amountUsd,
        payUrl: created.url || null,
        contractUrl: facts.contractUrl,
        toEmail: uniqueTo[0]!,
        customerMemo: memo,
      })
      await acct.sendInvoiceEmail({
        to: uniqueTo,
        cc: uniqueCc,
        bcc: uniqueBcc,
        poNumber: created.qbInvoiceNumber || po,
        qbInvoiceId: created.qbInvoiceId,
        ...mail,
      })
    } catch (e) {
      console.warn('[invoice] QBO send failed (invoice still created)', e)
    }
  }

  const inv: TripInvoice = {
    id: crypto.randomUUID(),
    qb_invoice_id: created.qbInvoiceId,
    total,
    status: shouldEmail ? 'sent' : 'draft',
    url: created.url,
    created_at: new Date().toISOString(),
  }
  const wasDelivered = t.state === 'delivered'
  mutateTrip(tripId, (row) => {
    row.invoice = inv
    row.po_number = created.qbInvoiceNumber || po
    row.documents.push({
      id: crypto.randomUUID(),
      kind: 'other',
      title: `Invoice ${created.qbInvoiceNumber || inv.qb_invoice_id}`,
      at: inv.created_at,
      url: inv.url,
    })
    row.events.push({
      at: inv.created_at,
      actor: 'system',
      kind: 'invoice_created',
      payload: {
        qb_invoice_id: inv.qb_invoice_id,
        doc_number: created.qbInvoiceNumber,
        total,
        auto: wasDelivered,
        emailed: shouldEmail,
        to: uniqueTo,
        cc: uniqueCc,
        bcc: uniqueBcc,
      },
    })
  })
  if (wasDelivered) {
    try {
      safeTransitionTrip(tripId, 'invoiced', 'system', {
        qb_invoice_id: inv.qb_invoice_id,
        doc_number: created.qbInvoiceNumber,
      })
    } catch {
      /* ignore */
    }
  }
  return inv
  } finally {
    invoiceInFlight.delete(tripId)
  }
}

/**
 * Send (or re-send) the QuickBooks invoice via branded payment-request email.
 * Stamps PO + itinerary onto the QBO invoice, attaches PDF, fills subject/body.
 * Creates the QB invoice first when missing.
 */
export async function sendTripInvoiceEmail(
  tripId: string,
  opts: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    /** Dispatcher-confirmed aircraft type (dropdown) before client send. */
    aircraftType?: string
  },
): Promise<{ poNumber: string; emailed: boolean }> {
  let trip = trips.get(tripId)
  if (!trip) throw new Error('trip not found')
  const confirmedType = opts.aircraftType?.trim()
  if (confirmedType) {
    mutateTrip(tripId, (t) => {
      if (t.quick) t.quick.aircraft_type = confirmedType
      const selected = t.offers.find((o) => o.state === 'selected')
      if (selected) selected.type_name = confirmedType
      if (t.hard_quote?.options?.length) {
        for (const opt of t.hard_quote.options) {
          if (!selected || opt.offer_id === selected.id) {
            opt.type_name = confirmedType
          }
        }
      }
    })
    void import('@/lib/ensureFinancialFromTrip').then((m) => {
      const row = trips.get(tripId)
      if (row) m.ensureFinancialFromBookedTrip(row)
    })
    trip = trips.get(tripId)
  }
  if (!trip) throw new Error('trip not found')
  const { resolveTripPoNumber } = await import('@/domain/tripPo')
  const poReady = resolveTripPoNumber(trip)
  if (!poReady) {
    throw new Error('Enter PO # before sending the invoice')
  }
  if (!trip.invoice) {
    await createInvoiceForTrip(tripId, {
      skipEmail: true,
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      poNumber: poReady,
    })
    trip = trips.get(tripId)
  }
  if (!trip?.invoice) {
    throw new Error('Could not create invoice — client total or PO # missing?')
  }
  const { createAccountingAdapter } = await import('@/adapters/accounting')
  const { getClient } = await import('@/lib/clientStore')
  const { ONFLY_INFO_BCC } = await import('@/domain/onflyEmails')
  const { isInvoicePoPlaceholder } = await import('@/domain/invoiceEmail')
  const acct = createAccountingAdapter()
  const client = trip.client_id ? getClient(trip.client_id) : undefined
  const clientName =
    trip.quick?.client_name ?? client?.name ?? 'Client'
  const po = resolveTripPoNumber(trip) || poReady
  if (isInvoicePoPlaceholder(po)) {
    throw new Error('Enter a real PO number before sending the invoice')
  }
  const to = [...new Set(opts.to.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))]
  if (!to.length) throw new Error('Add at least one To email for the invoice')
  const cc = [
    ...new Set(
      (opts.cc ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@') && !to.includes(e)),
    ),
  ]
  const bcc = [
    ...new Set(
      [...(opts.bcc ?? []), ONFLY_INFO_BCC]
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  ]
  const pdf = await acct.getInvoicePdfBase64(trip.invoice.qb_invoice_id)
  const { invoiceTripFacts } = await import('@/lib/invoiceTripFacts')
  const { buildInvoiceCustomerMemo } = await import('@/domain/qbInvoice')
  const facts = invoiceTripFacts(trip, { poNumber: po, clientName })
  const memo = buildInvoiceCustomerMemo({
    lane: facts.lane,
    flightDate: facts.flightDate,
    aircraftType: facts.aircraftType,
    tail: facts.tail,
    poNumber: po,
    payTerms: facts.payTerms,
    vendorNumber: trip.vendor_number,
    itineraryLines: facts.itineraryLines,
    pickupAddress: facts.pickupAddress,
    dropoffAddress: facts.dropoffAddress,
    extraNotes: facts.extraNotes,
  })
  const mail = await buildTripInvoiceMailPayload({
    trip,
    poNumber: po,
    clientName: facts.clientName,
    amountUsd: facts.amountUsd,
    payUrl: trip.invoice.url || null,
    contractUrl: facts.contractUrl,
    toEmail: to[0]!,
    customerMemo: memo,
  })
  await acct.sendInvoiceEmail({
    to,
    cc,
    bcc,
    poNumber: po,
    qbInvoiceId: trip.invoice.qb_invoice_id,
    pdfBase64: pdf ?? undefined,
    ...mail,
  })
  mutateTrip(tripId, (row) => {
    if (row.invoice) row.invoice.status = 'sent'
    row.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'invoice_emailed',
      payload: { to, cc, bcc, po_number: po },
    })
  })
  return { poNumber: po, emailed: true }
}

/** ETA-sheet-chrome invoice email + QBO memo fields for send. */
async function buildTripInvoiceMailPayload(opts: {
  trip: TripStoreRow
  poNumber: string
  clientName: string
  amountUsd: number
  payUrl?: string | null
  contractUrl?: string | null
  toEmail: string
  customerMemo: string
}) {
  const { portalTrackingUrlForTrip } = await import('@/lib/etaSheetSender')
  const { buildInvoiceEmailTemplate } = await import('@/lib/buildInvoiceEmail')
  const {
    invoiceEmailSubject,
    renderInvoiceEmailHtml,
    renderInvoiceEmailText,
  } = await import('@/domain/invoiceEmail')
  const { invoiceEmailLogoUrl } = await import('@/lib/invoiceEmailLogo')
  const portalUrl = portalTrackingUrlForTrip(opts.trip.id, opts.toEmail)
  const tpl = buildInvoiceEmailTemplate({
    trip: opts.trip,
    portalUrl,
    amountUsd: opts.amountUsd,
    poNumber: opts.poNumber,
    payUrl: opts.payUrl,
    contractUrl: opts.contractUrl,
    clientName: opts.clientName,
  })
  return {
    clientName: opts.clientName,
    logoUrl: invoiceEmailLogoUrl(),
    amountUsd: opts.amountUsd,
    lane: tpl.laneShort,
    aircraftType: tpl.aircraftType,
    tail: tpl.tail,
    contractUrl: opts.contractUrl ?? null,
    payUrl: opts.payUrl ?? null,
    portalUrl,
    customerMemo: opts.customerMemo,
    subject: invoiceEmailSubject({
      poNumber: tpl.poNumber,
      laneShort: tpl.laneShort,
      tail: tpl.tail,
    }),
    html: renderInvoiceEmailHtml(tpl),
    text: renderInvoiceEmailText(tpl),
  }
}

export function addTripDocument(
  tripId: string,
  doc: Omit<TripDocument, 'id' | 'at'> & { at?: string },
): void {
  mutateTrip(tripId, (t) => {
    t.documents.push({
      id: crypto.randomUUID(),
      at: doc.at ?? new Date().toISOString(),
      kind: doc.kind,
      title: doc.title,
      url: doc.url,
    })
  })
}

function originBase(): string {
  return appPublicUrl() || 'https://ofaops.onflyair.com'
}

/** Assign a pool DID and open the trip SMS thread (idempotent). */
export async function ensureTripThread(tripId: string): Promise<string | null> {
  const trip = getTrip(tripId)
  if (!trip) return null
  if (trip.thread_number && !trip.thread_disbanded_at) return trip.thread_number

  const { assignThreadNumber } = await import('@/lib/threadPoolStore')
  const active = listTrips().filter(
    (t) =>
      t.id !== tripId &&
      t.thread_number &&
      !t.thread_disbanded_at &&
      !['closed', 'cancelled', 'lost'].includes(t.state),
  )
  const number = assignThreadNumber({
    tripId,
    candidateCells: trip.participants.map((p) => p.cell).filter(Boolean),
    activeTrips: active.map((t) => ({
      id: t.id,
      thread_number: t.thread_number,
      cells: t.participants.map((p) => p.cell).filter(Boolean),
    })),
  })
  if (!number) return null

  mutateTrip(tripId, (t) => {
    t.thread_number = number
    t.thread_disbanded_at = null
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'thread_assigned',
      payload: { thread_number: number },
    })
  })
  return number
}

export function addTripParticipant(
  tripId: string,
  input: {
    name: string
    role: string
    company?: string
    cell?: string
    email?: string
    /** Force onto ops thread; default by role. */
    in_thread?: boolean
  },
): TripParticipant {
  const inThread = input.in_thread ?? roleOnOpsThread(input.role)
  const company =
    (input.company ?? '').trim() ||
    (input.role === 'dispatcher' ? 'OnFly Air' : '')
  let created!: TripParticipant
  mutateTrip(tripId, (t) => {
    created = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      company,
      role: input.role,
      cell: (input.cell ?? '').trim(),
      email: (input.email ?? '').trim(),
      in_thread: inThread,
      released_at: null,
      invite_sent_at: null,
    }
    t.participants.push(created)
    t.events.push({
      at: new Date().toISOString(),
      actor: 'dispatcher',
      kind: 'participant_added',
      payload: {
        participant_id: created.id,
        role: created.role,
        company: created.company,
        in_thread: created.in_thread,
      },
    })
  })
  return created
}

/** Send intro / portal / track / one-tap invite to a participant's phone. */
export async function inviteTripParticipant(
  tripId: string,
  participantId: string,
): Promise<{ ok: boolean; channel: string; detail: string }> {
  const trip = getTrip(tripId)
  if (!trip) return { ok: false, channel: '', detail: 'trip not found' }
  const p = trip.participants.find((x) => x.id === participantId)
  if (!p) return { ok: false, channel: '', detail: 'participant not found' }

  const {
    introSmsBody,
    portalInviteSmsBody,
    trackLinkSmsBody,
    roleGetsPortalInvite,
    roleOnOpsThread,
  } = await import('@/domain/tripThread')
  const { createCommsAdapter } = await import('@/adapters/comms')
  const { createEmailAdapter } = await import('@/adapters/email')
  const comms = createCommsAdapter()

  if (roleOnOpsThread(p.role) && p.in_thread && !p.released_at) {
    const number = trip.thread_number ?? (await ensureTripThread(tripId))
    if (!number) {
      return { ok: false, channel: 'sms', detail: 'no thread number available' }
    }
    if (!p.cell) {
      return { ok: false, channel: 'sms', detail: 'participant has no cell' }
    }
    const body = introSmsBody({
      tripRef: trip.ref,
      lane: trip.lane,
      threadNumber: number,
    })
    try {
      await comms.send({ channel: 'sms', to: p.cell, from: number, body })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      console.warn('[invite] thread SMS failed', p.name, detail)
      return { ok: false, channel: 'sms', detail }
    }
    mutateTrip(tripId, (t) => {
      const row = t.participants.find((x) => x.id === participantId)!
      row.invite_sent_at = new Date().toISOString()
      t.events.push({
        at: row.invite_sent_at,
        actor: 'comms',
        kind: 'participant_invite_sms',
        payload: { participant_id: participantId, to: p.cell },
      })
      t.thread.push({
        id: crypto.randomUUID(),
        at: row.invite_sent_at,
        from: 'OnFly Dispatch',
        channel: 'sms',
        body: `[invite → ${p.name}] ${body}`,
        parsed_kind: null,
      })
    })
    return { ok: true, channel: 'sms', detail: `Intro SMS → ${p.cell}` }
  }

  if (roleGetsPortalInvite(p.role)) {
    const { createPortalTrackToken } = await import('@/lib/portalTrackStore')
    const token = createPortalTrackToken({
      tripId,
      email: p.email || `trip-${trip.ref}@track.onfly`,
    })
    const trackUrl = `${originBase()}/portal/track/${token}`
    const portalUrl = `${originBase()}/portal/login`
    if (p.cell) {
      const body = trackLinkSmsBody({ tripRef: trip.ref, trackUrl })
      await comms.send({ channel: 'sms', to: p.cell, body })
      mutateTrip(tripId, (t) => {
        const row = t.participants.find((x) => x.id === participantId)!
        row.invite_sent_at = new Date().toISOString()
        t.events.push({
          at: row.invite_sent_at,
          actor: 'comms',
          kind: 'participant_track_sms',
          payload: { participant_id: participantId, to: p.cell },
        })
      })
      return { ok: true, channel: 'sms', detail: `Tracking link → ${p.cell}` }
    }
    if (p.email) {
      const email = createEmailAdapter()
      await email.send({
        to: p.email,
        subject: `OnFly Trip #${trip.ref} — portal & tracking`,
        text: `${portalInviteSmsBody({ portalUrl })}\n\nLive tracking: ${trackUrl}`,
        html: `<p>${portalInviteSmsBody({ portalUrl })}</p><p><a href="${trackUrl}">Open live tracking</a></p>`,
      })
      mutateTrip(tripId, (t) => {
        const row = t.participants.find((x) => x.id === participantId)!
        row.invite_sent_at = new Date().toISOString()
        t.events.push({
          at: row.invite_sent_at,
          actor: 'comms',
          kind: 'participant_portal_email',
          payload: { participant_id: participantId, to: p.email },
        })
      })
      return { ok: true, channel: 'email', detail: `Portal invite → ${p.email}` }
    }
    return { ok: false, channel: '', detail: 'need cell or email for portal invite' }
  }

  return { ok: false, channel: '', detail: 'no invite path for this role' }
}

export async function releaseTripParticipant(
  tripId: string,
  participantId: string,
): Promise<void> {
  const trip = getTrip(tripId)
  if (!trip) return
  const p = trip.participants.find((x) => x.id === participantId)
  if (!p || p.released_at) return
  const { releaseSmsBody } = await import('@/domain/tripThread')
  const { createCommsAdapter } = await import('@/adapters/comms')
  if (p.cell && p.in_thread && trip.thread_number) {
    await createCommsAdapter().send({
      channel: 'sms',
      to: p.cell,
      from: trip.thread_number,
      body: releaseSmsBody({ tripRef: trip.ref, lane: trip.lane }),
    })
  }
  mutateTrip(tripId, (t) => {
    const row = t.participants.find((x) => x.id === participantId)!
    row.released_at = new Date().toISOString()
    row.in_thread = false
    t.events.push({
      at: row.released_at,
      actor: 'dispatcher',
      kind: 'participant_released',
      payload: { participant_id: participantId },
    })
  })
}

/**
 * Close trip communications: release everyone on the thread, free the DID
 * (+24h grace), expire one-tap tokens, optionally bank contacts.
 */
export async function disbandTripComms(
  tripId: string,
  opts?: { bankContacts?: boolean; promoteToClient?: boolean },
): Promise<{ banked: number; promoted: number }> {
  const trip = getTrip(tripId)
  if (!trip) return { banked: 0, promoted: 0 }
  if (trip.thread_disbanded_at) {
    return { banked: 0, promoted: 0 }
  }

  const { disbandSmsBody } = await import('@/domain/tripThread')
  const { createCommsAdapter } = await import('@/adapters/comms')
  const { releaseThreadNumber } = await import('@/lib/threadPoolStore')
  const comms = createCommsAdapter()
  const now = new Date().toISOString()

  for (const p of trip.participants) {
    if (p.released_at || !p.in_thread) continue
    if (p.cell && trip.thread_number) {
      await comms.send({
        channel: 'sms',
        to: p.cell,
        from: trip.thread_number,
        body: disbandSmsBody({ tripRef: trip.ref, lane: trip.lane }),
      })
    }
  }

  if (trip.thread_number) {
    releaseThreadNumber(trip.id)
  }

  let banked = 0
  let promoted = 0
  if (opts?.bankContacts !== false) {
    const { bankParticipants, promoteBankedToClientContacts } = await import(
      '@/lib/contactBankStore'
    )
    const saved = bankParticipants({
      participants: trip.participants,
      client_id: trip.client_id,
      trip_id: trip.id,
      trip_ref: trip.ref,
    })
    banked = saved.length
    if (opts?.promoteToClient && trip.client_id) {
      promoted = await promoteBankedToClientContacts(trip.client_id, saved)
    }
  }

  mutateTrip(tripId, (t) => {
    t.thread_disbanded_at = now
    for (const p of t.participants) {
      if (!p.released_at && p.in_thread) {
        p.released_at = now
        p.in_thread = false
      }
    }
    // Expire one-tap tokens by blanking them
    t.legs = t.legs.map((l) => ({
      ...l,
      one_tap_token: l.one_tap_token ? `expired-${l.id.slice(0, 8)}` : l.one_tap_token,
    }))
    t.events.push({
      at: now,
      actor: 'dispatcher',
      kind: 'thread_disbanded',
      payload: {
        banked,
        promoted,
        prior_thread: trip.thread_number,
      },
    })
  })

  return { banked, promoted }
}

