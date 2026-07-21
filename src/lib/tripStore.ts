/**
 * Trip/offers store — session Map + localStorage + Supabase sync via trip_transition.
 */

import type { Candidate } from '@/domain/routing'
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
import { parseThreadActual } from '@/domain/threadParse'
import {
  applyChainToLegs,
  applyParsedActualToLegs,
  cascadeRecomputeFromActual,
  materializeChainToLegs,
  type AppLeg,
} from '@/domain/tripLegs'
import { tripInvoiceLines } from '@/domain/qbInvoice'
import { raiseException } from '@/lib/exceptionStore'
import { getEtaDefaults } from '@/lib/etaDefaultsStore'
import { getReferral } from '@/lib/referralStore'
import { computeReferralShareAmount } from '@/domain/referrals'
import { roleOnOpsThread } from '@/domain/tripThread'

const STORAGE_KEY = 'onfly.trips.v1'

function asTripLegs(legs: AppLeg[]): TripLegRow[] {
  return legs.map((l) => ({ ...l }))
}

function schedulePersist(tripId: string): void {
  void flushPersistTrip(tripId)
}

/** Flush one trip to Supabase (best-effort). */
export async function flushPersistTrip(tripId: string): Promise<void> {
  try {
    const m = await import('@/lib/db/persistTrip')
    const row = trips.get(tripId)
    if (row) await m.persistTripSnapshot(row)
  } catch (e) {
    console.warn('[trips] persist failed', tripId, e)
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
  const out: TripParticipant[] = [
    {
      id: crypto.randomUUID(),
      role: 'dispatcher',
      name: 'On-shift',
      cell: '',
      email: '',
      in_thread: true,
      released_at: null,
      invite_sent_at: null,
    },
    {
      id: crypto.randomUUID(),
      role: 'operator_ops',
      name: meta.operator_name || 'Operator',
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
      role: 'client_supply',
      name: email.split('@')[0] || 'CC',
      cell: '',
      email,
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
  replied_at: string | null
  time_to_position_min: number | null
  live_leg_min: number | null
  wait_ok: boolean | null
  max_wait_hrs: number | null
  price_net: number | null
  magic_token: string
  bookingGated: boolean
  needsInfo: string[]
  contact_cell: string
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
  cc_emails: string[]
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
  state: TripState
  lane: string
  payload_summary: string
  ready_label: string
  candidates: Candidate[]
  offers: OfferRow[]
  events: Array<{ at: string; actor: string; kind: string; payload: Record<string, unknown> }>
  hard_quote?: {
    total: number
    accept_token: string
    disclosure_text?: string
    disclosure_at?: string
    payload_kind: 'cargo' | 'pax' | 'both'
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
  /** Referral partner attached at book (profit share → financials). */
  referral?: {
    id: string | null
    name: string
    share_amount: number | null
  } | null
  po_number?: string | null
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
let refSeq = 2000
const listeners = new Set<() => void>()
let snapshot: TripStoreRow[] = []

function rebuild() {
  snapshot = [...trips.values()].sort((a, b) => b.ref - a.ref)
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
      // Backfill ETA spine fields for older localStorage snapshots
      if (!Array.isArray(row.eta_chain)) row.eta_chain = []
      if (row.service_pattern === undefined) row.service_pattern = null
      if (row.promised_delivery === undefined) row.promised_delivery = null
      if (row.eta_defaults_snapshot === undefined) row.eta_defaults_snapshot = null
      if (row.thread_number === undefined) row.thread_number = null
      if (row.thread_disbanded_at === undefined) row.thread_disbanded_at = null
      if (!Array.isArray(row.legs)) row.legs = []
      if (!Array.isArray(row.participants)) row.participants = []
      row.participants = row.participants.map((p) => ({
        ...p,
        in_thread: p.in_thread ?? true,
        released_at: p.released_at ?? null,
        invite_sent_at: p.invite_sent_at ?? null,
      }))
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
  for (const l of listeners) l()
}

loadLocal()
rebuild()

export function subscribeTrips(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listTripsStable(): TripStoreRow[] {
  return snapshot
}

export function createTripFromCandidates(opts: {
  lane: string
  payload_summary: string
  ready_label: string
  candidates: Candidate[]
  payload_kind: 'cargo' | 'pax' | 'both'
  client_id?: string
  /** Prefer this chain when materializing legs (selected option). */
  selectedChain?: ChainLeg[]
  service_pattern?: ServicePattern | null
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
    state: 'quoted_estimated',
    lane: opts.lane,
    payload_summary: opts.payload_summary,
    ready_label: opts.ready_label,
    candidates: opts.candidates,
    offers: opts.candidates.slice(0, 5).map((c, i) => ({
      id: crypto.randomUUID(),
      trip_id: id,
      operator_id: c.operator_id,
      operator_name: c.operator_name,
      aircraft_id: c.aircraft_id,
      tail: c.tail,
      type_name: c.type_name,
      state: 'pinged',
      ping_sent_at: null,
      replied_at: null,
      time_to_position_min: null,
      live_leg_min: null,
      wait_ok: null,
      max_wait_hrs: null,
      price_net: null,
      magic_token: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      bookingGated: c.bookingGated,
      needsInfo: c.needsInfo,
      contact_cell: `+1555000${String(1000 + i).slice(-4)}`,
    })),
    client_id: opts.client_id,
    eta_chain: chain,
    service_pattern: opts.service_pattern ?? null,
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
  const row: TripStoreRow = {
    id,
    ref: ++refSeq,
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
    eta_chain: [],
    service_pattern: 'A2A',
    promised_delivery: null,
    eta_defaults_snapshot: { ...getEtaDefaults() },
    thread_number: null,
    thread_disbanded_at: null,
    legs: buildQuickLegs(meta),
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

/** Merge DB rows into session (does not wipe local-only trips still syncing). */
export function replaceTripsFromDb(rows: TripStoreRow[]): void {
  if (!rows.length) return
  for (const r of rows) {
    const existing = trips.get(r.id)
    if (existing) {
      // Preserve richer session overlays until DB catches up.
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
    }
    trips.set(r.id, r)
    if (r.ref >= refSeq) refSeq = r.ref + 1
  }
  bump()
  // Push any local-only trips that never made it to DB
  void flushLocalOnlyTrips(new Set(rows.map((r) => r.id)))
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

export function mutateTrip(id: string, fn: (t: TripStoreRow) => void) {
  const t = trips.get(id)
  if (!t) throw new Error('trip not found')
  fn(t)
  trips.set(id, t)
  bump()
  schedulePersist(id)
  return t
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

/** Create QB invoice for a trip (mock or live). Does not use QBO email. */
const invoiceInFlight = new Set<string>()

export async function createMockInvoiceForTrip(tripId: string): Promise<TripInvoice | null> {
  return createInvoiceForTrip(tripId)
}

export async function createInvoiceForTrip(tripId: string): Promise<TripInvoice | null> {
  const t = trips.get(tripId)
  if (!t) return null
  if (t.invoice) return t.invoice
  if (invoiceInFlight.has(tripId)) return t.invoice
  invoiceInFlight.add(tripId)
  try {
  const total = t.quick?.client_price ?? t.hard_quote?.total ?? 0
  if (!(total > 0)) return null
  const { createAccountingAdapter } = await import('@/adapters/accounting')
  const acct = createAccountingAdapter()
  const clientName = t.quick?.client_name ?? 'Client'
  const po = t.quick?.po?.trim() || `T-${t.ref}`
  const txnDate = new Date().toISOString().slice(0, 10)
  const lines = tripInvoiceLines({
    tripRef: t.ref,
    lane: t.lane,
    flightDate: t.quick?.legs[0]?.date ?? null,
    airAmount: total,
  })
  const created = await acct.createInvoice({
    customerName: clientName,
    poNumber: po,
    txnDate,
    payTerms: t.quick?.pay_terms ?? 'Net 30',
    tripRef: t.ref,
    lines,
    notes: t.quick?.notes ?? null,
  })

  // Branded Resend delivery (never QBO /invoice/{id}/send)
  const apTo = [
    t.quick?.invoice_email,
    ...t.participants
      .filter((p) => p.role === 'client_ap' && p.email)
      .map((p) => p.email),
  ]
    .filter((e): e is string => Boolean(e?.includes('@')))
    .map((e) => e.toLowerCase())
  const uniqueTo = [...new Set(apTo)]
  if (uniqueTo.length && (t.quick?.send_invoice ?? true)) {
    try {
      const pdf = await acct.getInvoicePdfBase64(created.qbInvoiceId)
      if (pdf) {
        await acct.sendInvoiceEmail({
          to: uniqueTo,
          poNumber: created.qbInvoiceNumber || po,
          pdfBase64: pdf,
          clientName,
        })
      }
    } catch (e) {
      console.warn('[invoice] email failed (invoice still created)', e)
    }
  }

  const inv: TripInvoice = {
    id: crypto.randomUUID(),
    qb_invoice_id: created.qbInvoiceId,
    total,
    status: 'sent',
    url: created.url,
    created_at: new Date().toISOString(),
  }
  const wasDelivered = t.state === 'delivered'
  mutateTrip(tripId, (row) => {
    row.invoice = inv
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
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'https://app.onflyair.com'
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
    cell?: string
    email?: string
    /** Force onto ops thread; default by role. */
    in_thread?: boolean
  },
): TripParticipant {
  const inThread = input.in_thread ?? roleOnOpsThread(input.role)
  let created!: TripParticipant
  mutateTrip(tripId, (t) => {
    created = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
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
    await comms.send({ channel: 'sms', to: p.cell, from: number, body })
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

