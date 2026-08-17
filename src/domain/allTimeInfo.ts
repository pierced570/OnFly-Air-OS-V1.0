/**
 * All Time Info — master ops/financial tracker.
 * Pure TypeScript: project trip_events + money into CSV-shaped rows + KPIs.
 * No parallel trip SoT — rows reference trip_id and derive from the spine.
 */

export const ALL_TIME_COLUMNS = [
  'logged_at',
  'trip_id',
  'trip_code',
  'trip_ref',
  'client_name',
  'lane',
  'payload_kind',
  'source',
  'state',
  'discarded',
  'operator_name',
  'tail',
  'aircraft_type',
  'time_to_position_min',
  'vendor_cost',
  'client_price',
  'margin',
  'po_number',
  'referral_name',
  'request_logged_at',
  'parsed_at',
  'quote_sent_at',
  'minutes_to_quote',
  'booked_at',
  'minutes_request_to_book',
  'wheels_up_at',
  'wheels_down_at',
  'wheels_up_est_at',
  'wheels_down_est_at',
  'on_time_departure',
  'on_time_arrival',
  'delivered_at',
  'invoice_created_at',
  'invoice_sent_at',
  'invoice_paid_at',
  'invoice_status',
  'invoice_total',
  'adsb_actuals_logged',
  'discarded_at',
  'lost_reason',
] as const

export type AllTimeColumn = (typeof ALL_TIME_COLUMNS)[number]

export type AllTimeTripRow = Record<AllTimeColumn, string>

export type AllTimeEventKind =
  | 'request_parsed'
  | 'trip_created'
  | 'quote_sent'
  | 'trip_booked'
  | 'adsb_actual'
  | 'invoice_created'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'trip_delivered'
  | 'trip_discarded'
  | 'trip_state'
  | 'sync'

export type AllTimeEvent = {
  id: string
  at: string
  kind: AllTimeEventKind
  trip_id: string | null
  trip_code: string | null
  summary: string
  payload?: Record<string, unknown>
}

export type AllTimeKpis = {
  trips_total: number
  trips_active: number
  trips_booked: number
  trips_quoted: number
  trips_discarded: number
  trips_delivered: number
  invoices_sent: number
  revenue_total: number
  vendor_cost_total: number
  margin_total: number
  avg_minutes_to_quote: number | null
  avg_minutes_request_to_book: number | null
  avg_time_to_position_min: number | null
  on_time_departure_pct: number | null
  on_time_arrival_pct: number | null
  on_time_sample: number
  adsb_tracked: number
}

type TripEventLike = {
  at: string
  kind: string
  payload?: Record<string, unknown>
}

type ChainLegLike = {
  type: string
  est_start?: string | null
  est_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
}

type OfferLike = {
  state: string
  operator_name?: string
  tail?: string
  type_name?: string | null
  time_to_position_min?: number | null
  price_net?: number | null
}

type QuickLike = {
  client_name?: string
  operator_name?: string
  aircraft_type?: string
  tail?: string
  vendor_cost?: number
  client_price?: number
  po?: string
  referred_by?: string
  legs?: Array<{ origin_icao?: string; dest_icao?: string }>
}

export type AllTimeTripInput = {
  id: string
  ref?: number
  code?: string
  state: string
  lane?: string
  client_name?: string | null
  client_id?: string
  po_number?: string | null
  lost_reason?: string
  discarded?: boolean
  discarded_at?: string | null
  quick?: QuickLike | null
  hard_quote?: {
    total?: number
    sent_at?: string
    payload_kind?: string
    options?: Array<{
      operator_name?: string
      tail?: string | null
      type_name?: string | null
      time_to_position_min?: number | null
      client_total?: number
    }>
  } | null
  invoice?: {
    status?: string
    total?: number
  } | null
  offers?: OfferLike[]
  events?: TripEventLike[]
  eta_chain?: ChainLegLike[]
  legs?: Array<{
    type?: string
    origin?: string
    dest?: string
    est_start?: string | null
    est_end?: string | null
    actual_start?: string | null
    actual_end?: string | null
  }>
  financial?: {
    client_invoiced_amount?: number
    vendor_amount?: number
    margin?: number
    referral_name?: string | null
    operator_po?: string | null
  } | null
}

const BOOKED_STATES = new Set([
  'booked',
  'in_progress',
  'delivered',
  'invoiced',
  'closed',
])

const QUOTED_STATES = new Set([
  'quoted_estimated',
  'offers_out',
  'quoted_hard',
  'booked',
  'in_progress',
  'delivered',
  'invoiced',
  'closed',
])

/** On-time slack vs estimate (minutes). Within this = on time. */
export const ON_TIME_SLACK_MIN = 15

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function numStr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  return String(Math.round(n * 100) / 100)
}

function boolStr(v: boolean | null | undefined): string {
  if (v == null) return ''
  return v ? 'yes' : 'no'
}

function parseIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

export function minutesBetween(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const x = parseIso(a)
  const y = parseIso(b)
  if (x == null || y == null) return null
  return Math.round((y - x) / 60_000)
}

export function isOnTime(
  est: string | null | undefined,
  actual: string | null | undefined,
  slackMin = ON_TIME_SLACK_MIN,
): boolean | null {
  const delta = minutesBetween(est, actual)
  if (delta == null) return null
  return delta <= slackMin
}

function firstEventAt(
  events: TripEventLike[] | undefined,
  kinds: string[],
): string | null {
  if (!events?.length) return null
  const set = new Set(kinds)
  for (const e of events) {
    if (set.has(e.kind)) return e.at
  }
  return null
}

function stateEnteredAt(
  events: TripEventLike[] | undefined,
  state: string,
): string | null {
  if (!events?.length) return null
  for (const e of events) {
    if (e.kind !== 'state_transition') continue
    const to = String(e.payload?.to ?? e.payload?.to_state ?? '')
    if (to === state) return e.at
  }
  return null
}

function inferSource(events: TripEventLike[] | undefined): string {
  if (!events?.length) return ''
  for (const e of events) {
    if (e.kind === 'quick_dispatch') return 'quick_dispatch'
    if (e.kind === 'desk_scratch_spool') return 'desk_scratch'
    if (e.kind === 'created_from_estimate') return 'estimate'
    if (e.kind === 'created_from_request') return 'request'
    if (e.kind === 'estimated_quote_sent') return 'estimate'
  }
  return events[0]?.kind ?? ''
}

function payloadKindOf(trip: AllTimeTripInput): string {
  if (trip.hard_quote?.payload_kind) return trip.hard_quote.payload_kind
  const ev = [...(trip.events ?? [])]
    .reverse()
    .find((e) => e.kind === 'payload_kind')
  if (ev?.payload?.payload_kind) return String(ev.payload.payload_kind)
  if (trip.quick?.legs?.length) return 'cargo'
  return ''
}

function selectedOffer(trip: AllTimeTripInput): OfferLike | null {
  const offers = trip.offers ?? []
  return (
    offers.find((o) => o.state === 'selected') ??
    offers.find((o) => o.state === 'quoted') ??
    offers[0] ??
    null
  )
}

function airLeg(trip: AllTimeTripInput): {
  est_start: string | null
  est_end: string | null
  actual_start: string | null
  actual_end: string | null
} {
  const chainAir = trip.eta_chain?.find((l) => l.type === 'air_leg')
  if (chainAir) {
    return {
      est_start: chainAir.est_start ?? null,
      est_end: chainAir.est_end ?? null,
      actual_start: chainAir.actual_start ?? null,
      actual_end: chainAir.actual_end ?? null,
    }
  }
  const leg = trip.legs?.find((l) => l.type === 'air_leg')
  return {
    est_start: leg?.est_start ?? null,
    est_end: leg?.est_end ?? null,
    actual_start: leg?.actual_start ?? null,
    actual_end: leg?.actual_end ?? null,
  }
}

function laneOf(trip: AllTimeTripInput): string {
  if (trip.lane?.trim()) return trip.lane.trim()
  const q = trip.quick?.legs?.[0]
  if (q?.origin_icao && q?.dest_icao) {
    return `${q.origin_icao}→${q.dest_icao}`
  }
  const leg = trip.legs?.find((l) => l.origin && l.dest)
  if (leg?.origin && leg?.dest) return `${leg.origin}→${leg.dest}`
  return ''
}

function emptyRow(): AllTimeTripRow {
  const row = {} as AllTimeTripRow
  for (const c of ALL_TIME_COLUMNS) row[c] = ''
  return row
}

/** Build one CSV row from a trip (+ optional financial overlay). */
export function buildAllTimeTripRow(
  trip: AllTimeTripInput,
  opts?: { nowIso?: string },
): AllTimeTripRow {
  const events = trip.events ?? []
  const offer = selectedOffer(trip)
  const hqOpt = trip.hard_quote?.options?.[0]
  const air = airLeg(trip)
  const fin = trip.financial

  const vendor =
    trip.quick?.vendor_cost ??
    offer?.price_net ??
    fin?.vendor_amount ??
    null
  const client =
    trip.quick?.client_price ??
    trip.hard_quote?.total ??
    hqOpt?.client_total ??
    fin?.client_invoiced_amount ??
    null
  const margin =
    fin?.margin ??
    (vendor != null && client != null ? client - vendor : null)

  const requestAt =
    firstEventAt(events, [
      'created_from_request',
      'created_from_estimate',
      'quick_dispatch',
      'desk_scratch_spool',
    ]) ?? events[0]?.at ?? null
  const parsedAt =
    firstEventAt(events, [
      'desk_scratch_spool',
      'created_from_request',
      'created_from_estimate',
      'quick_dispatch',
    ]) ?? requestAt
  const quoteAt =
    firstEventAt(events, ['estimated_quote_sent', 'hard_quote_sent']) ??
    trip.hard_quote?.sent_at ??
    null
  const bookedAt =
    stateEnteredAt(events, 'booked') ??
    firstEventAt(events, ['desk_approve_trip', 'hard_quote_accepted']) ??
    (trip.state === 'booked' || BOOKED_STATES.has(trip.state)
      ? firstEventAt(events, ['quick_dispatch'])
      : null)
  const deliveredAt = stateEnteredAt(events, 'delivered')
  const invoiceCreatedAt = firstEventAt(events, ['invoice_created'])
  const invoiceSentAt = firstEventAt(events, ['invoice_emailed'])
  const invoicePaidAt = firstEventAt(events, ['invoice_paid'])
  const adsbAt = firstEventAt(events, ['adsb_actual_applied'])
  const discardedAt = trip.discarded_at ?? firstEventAt(events, ['trip_discarded'])

  const onTimeDep = isOnTime(air.est_start, air.actual_start)
  const onTimeArr = isOnTime(air.est_end, air.actual_end)

  const row = emptyRow()
  row.logged_at = opts?.nowIso ?? new Date().toISOString()
  row.trip_id = trip.id
  row.trip_code = trip.code ?? ''
  row.trip_ref = trip.ref != null ? String(trip.ref) : ''
  row.client_name =
    trip.client_name?.trim() ||
    trip.quick?.client_name?.trim() ||
    ''
  row.lane = laneOf(trip)
  row.payload_kind = payloadKindOf(trip)
  row.source = inferSource(events)
  row.state = trip.discarded ? 'discarded' : trip.state
  row.discarded = boolStr(Boolean(trip.discarded || discardedAt))
  row.operator_name =
    trip.quick?.operator_name ||
    offer?.operator_name ||
    hqOpt?.operator_name ||
    ''
  row.tail = trip.quick?.tail || offer?.tail || hqOpt?.tail || ''
  row.aircraft_type =
    trip.quick?.aircraft_type ||
    offer?.type_name ||
    hqOpt?.type_name ||
    ''
  row.time_to_position_min = numStr(
    offer?.time_to_position_min ?? hqOpt?.time_to_position_min ?? null,
  )
  row.vendor_cost = numStr(vendor)
  row.client_price = numStr(client)
  row.margin = numStr(margin)
  row.po_number =
    trip.po_number?.trim() ||
    trip.quick?.po?.trim() ||
    fin?.operator_po?.trim() ||
    ''
  row.referral_name =
    trip.quick?.referred_by?.trim() || fin?.referral_name?.trim() || ''
  row.request_logged_at = requestAt ?? ''
  row.parsed_at = parsedAt ?? ''
  row.quote_sent_at = quoteAt ?? ''
  row.minutes_to_quote = numStr(minutesBetween(parsedAt, quoteAt))
  row.booked_at = bookedAt ?? ''
  row.minutes_request_to_book = numStr(minutesBetween(requestAt, bookedAt))
  row.wheels_up_at = air.actual_start ?? ''
  row.wheels_down_at = air.actual_end ?? ''
  row.wheels_up_est_at = air.est_start ?? ''
  row.wheels_down_est_at = air.est_end ?? ''
  row.on_time_departure = boolStr(onTimeDep)
  row.on_time_arrival = boolStr(onTimeArr)
  row.delivered_at = deliveredAt ?? ''
  row.invoice_created_at = invoiceCreatedAt ?? ''
  row.invoice_sent_at = invoiceSentAt ?? ''
  row.invoice_paid_at = invoicePaidAt ?? ''
  row.invoice_status = trip.invoice?.status ?? ''
  row.invoice_total = numStr(
    trip.invoice?.total ?? client ?? fin?.client_invoiced_amount ?? null,
  )
  row.adsb_actuals_logged = boolStr(Boolean(adsbAt || air.actual_start || air.actual_end))
  row.discarded_at = discardedAt ?? ''
  row.lost_reason = trip.lost_reason ?? ''
  return row
}

/** Upsert by trip_id — keep earlier request/parse stamps if fresher row blanks them. */
export function mergeAllTimeTripRow(
  prev: AllTimeTripRow | undefined,
  next: AllTimeTripRow,
): AllTimeTripRow {
  if (!prev) return next
  const out = { ...next }
  const keepIfBlank: AllTimeColumn[] = [
    'request_logged_at',
    'parsed_at',
    'quote_sent_at',
    'booked_at',
    'wheels_up_at',
    'wheels_down_at',
    'invoice_created_at',
    'invoice_sent_at',
    'invoice_paid_at',
    'discarded_at',
    'source',
  ]
  for (const c of keepIfBlank) {
    if (!out[c] && prev[c]) out[c] = prev[c]
  }
  // Prefer discarded yes if either says yes
  if (prev.discarded === 'yes' || next.discarded === 'yes') {
    out.discarded = 'yes'
    if (next.state !== 'discarded' && prev.state === 'discarded') {
      out.state = 'discarded'
    }
  }
  return out
}

export function summarizeAllTimeKpis(rows: AllTimeTripRow[]): AllTimeKpis {
  const active = rows.filter((r) => r.discarded !== 'yes')
  const discarded = rows.filter((r) => r.discarded === 'yes')
  const booked = active.filter((r) => BOOKED_STATES.has(r.state))
  const quoted = active.filter((r) => QUOTED_STATES.has(r.state) || r.quote_sent_at)
  const delivered = active.filter(
    (r) =>
      r.state === 'delivered' ||
      r.state === 'invoiced' ||
      r.state === 'closed' ||
      Boolean(r.delivered_at),
  )
  const invoicesSent = active.filter(
    (r) => r.invoice_status === 'sent' || r.invoice_status === 'paid' || r.invoice_sent_at,
  )

  const sumCol = (col: AllTimeColumn) =>
    active.reduce((s, r) => {
      const n = Number(r[col])
      return s + (Number.isFinite(n) ? n : 0)
    }, 0)

  const avgOf = (vals: number[]) =>
    vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null

  const quoteMins = active
    .map((r) => Number(r.minutes_to_quote))
    .filter((n) => Number.isFinite(n) && n >= 0)
  const bookMins = active
    .map((r) => Number(r.minutes_request_to_book))
    .filter((n) => Number.isFinite(n) && n >= 0)
  const ttp = active
    .map((r) => Number(r.time_to_position_min))
    .filter((n) => Number.isFinite(n) && n >= 0)

  const depSamples = active.filter((r) => r.on_time_departure === 'yes' || r.on_time_departure === 'no')
  const arrSamples = active.filter((r) => r.on_time_arrival === 'yes' || r.on_time_arrival === 'no')
  const depOn = depSamples.filter((r) => r.on_time_departure === 'yes').length
  const arrOn = arrSamples.filter((r) => r.on_time_arrival === 'yes').length
  const sample = Math.max(depSamples.length, arrSamples.length)

  return {
    trips_total: rows.length,
    trips_active: active.length,
    trips_booked: booked.length,
    trips_quoted: quoted.length,
    trips_discarded: discarded.length,
    trips_delivered: delivered.length,
    invoices_sent: invoicesSent.length,
    revenue_total: Math.round(sumCol('client_price') * 100) / 100,
    vendor_cost_total: Math.round(sumCol('vendor_cost') * 100) / 100,
    margin_total: Math.round(sumCol('margin') * 100) / 100,
    avg_minutes_to_quote: avgOf(quoteMins),
    avg_minutes_request_to_book: avgOf(bookMins),
    avg_time_to_position_min: avgOf(ttp),
    on_time_departure_pct:
      depSamples.length === 0
        ? null
        : Math.round((100 * depOn) / depSamples.length),
    on_time_arrival_pct:
      arrSamples.length === 0
        ? null
        : Math.round((100 * arrOn) / arrSamples.length),
    on_time_sample: sample,
    adsb_tracked: active.filter((r) => r.adsb_actuals_logged === 'yes').length,
  }
}

export function allTimeRowsToCsv(rows: AllTimeTripRow[]): string {
  const lines = [ALL_TIME_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(ALL_TIME_COLUMNS.map((c) => csvEscape(row[c] ?? '')).join(','))
  }
  return lines.join('\n') + '\n'
}

export function sortAllTimeRows(rows: AllTimeTripRow[]): AllTimeTripRow[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.request_logged_at || a.logged_at) || 0
    const tb = Date.parse(b.request_logged_at || b.logged_at) || 0
    return tb - ta
  })
}

export function formatKpiMinutes(m: number | null): string {
  if (m == null) return '—'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

export function formatKpiPct(n: number | null): string {
  if (n == null) return '—'
  return `${n}%`
}

export function formatKpiUsd(n: number): string {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}
