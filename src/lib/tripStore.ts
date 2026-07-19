/**
 * Trip/offers store — session Map + localStorage + Supabase sync via trip_transition.
 */

import type { Candidate } from '@/domain/routing'
import type { ChainLeg } from '@/domain/etaChain'
import { DEFAULT_LEG_DEFAULTS } from '@/domain/etaChain'
import type { TripState } from '@/domain/stateMachine'
import { transition } from '@/domain/stateMachine'
import { parseThreadActual } from '@/domain/threadParse'
import {
  applyParsedActualToLegs,
  cascadeRecomputeFromActual,
  materializeChainToLegs,
  type AppLeg,
} from '@/domain/tripLegs'
import { tripInvoiceLines } from '@/domain/qbInvoice'
import { createAccountingAdapter } from '@/adapters/accounting'
import { raiseException } from '@/lib/exceptionStore'

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
    },
    {
      id: crypto.randomUUID(),
      role: 'operator_ops',
      name: meta.operator_name || 'Operator',
      cell: '',
      email: '',
    },
  ]
  if (meta.invoice_email) {
    out.push({
      id: crypto.randomUUID(),
      role: 'client_ap',
      name: 'AP',
      cell: '',
      email: meta.invoice_email,
    })
  }
  for (const email of meta.cc_emails) {
    out.push({
      id: crypto.randomUUID(),
      role: 'client_supply',
      name: email.split('@')[0] || 'CC',
      cell: '',
      email,
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
  legs: TripLegRow[]
  participants: TripParticipant[]
  thread: ThreadMessage[]
  documents: TripDocument[]
  invoice: TripInvoice | null
  client_id?: string
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
}): TripStoreRow {
  const id = crypto.randomUUID()
  const chain =
    opts.selectedChain ??
    opts.candidates.find((c) => c.chain?.length)?.chain ??
    []
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
    legs,
    participants: [
      {
        id: crypto.randomUUID(),
        role: 'dispatcher',
        name: 'On-shift',
        cell: '',
        email: '',
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
  return row
}

export function getTrip(id: string) {
  return trips.get(id) ?? null
}

/** Merge DB rows into session (does not wipe local-only trips still syncing). */
export function replaceTripsFromDb(rows: TripStoreRow[]): void {
  if (!rows.length) return
  for (const r of rows) {
    trips.set(r.id, r)
    if (r.ref >= refSeq) refSeq = r.ref + 1
  }
  bump()
  // Push any local-only trips that never made it to DB
  void flushLocalOnlyTrips(new Set(rows.map((r) => r.id)))
}

async function flushLocalOnlyTrips(knownDbIds: Set<string>): Promise<void> {
  for (const [id] of trips) {
    if (!knownDbIds.has(id)) await flushPersistTrip(id)
  }
}

/** Attach / replace legs from a quote chain (book / hard-quote select). */
export function materializeTripLegsFromChain(
  tripId: string,
  chain: ChainLeg[],
): void {
  if (!chain.length) return
  mutateTrip(tripId, (t) => {
    if (t.legs.some((l) => l.actual_start || l.actual_end)) return
    t.legs = asTripLegs(materializeChainToLegs(chain))
    t.events.push({
      at: new Date().toISOString(),
      actor: 'system',
      kind: 'legs_materialized',
      payload: { count: t.legs.length },
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
    m.syncTripTransition({
      trip: result,
      fromState,
      toState: to,
      actor,
      payload,
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
  for (const t of trips.values()) {
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
        if (
          Math.abs(applied.slippedMinutes) >=
          DEFAULT_LEG_DEFAULTS.slipThresholdMin
        ) {
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
export async function createMockInvoiceForTrip(tripId: string): Promise<TripInvoice | null> {
  return createInvoiceForTrip(tripId)
}

export async function createInvoiceForTrip(tripId: string): Promise<TripInvoice | null> {
  const t = trips.get(tripId)
  if (!t) return null
  if (t.invoice) return t.invoice
  const total = t.quick?.client_price ?? t.hard_quote?.total ?? 0
  if (!(total > 0)) return null
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
  void import('@/lib/db/persistQuote').then((m) =>
    m.persistInvoiceRow({
      tripId,
      qbInvoiceId: inv.qb_invoice_id,
      total,
    }),
  )
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
