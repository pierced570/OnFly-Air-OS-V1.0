/**
 * Client mobile app helpers — active vs history, PO / invoice ledger rows.
 * Pure TS. Never includes operator names, margins, or vendor cost.
 */

export const PORTAL_APP_ACTIVE_STATES = new Set([
  'draft',
  'routed',
  'quoted_estimated',
  'offers_out',
  'quoted_hard',
  'booked',
  'in_progress',
])

export const PORTAL_APP_HISTORY_STATES = new Set([
  'delivered',
  'invoiced',
  'closed',
  'lost',
  'cancelled',
])

export type PortalAppTab = 'home' | 'book' | 'history' | 'account'

export type PortalAppTripLike = {
  id: string
  ref: number
  state: string
  lane: string
  ready_label?: string | null
  payload_summary?: string | null
  po_number?: string | null
  code?: string | null
  updated_at?: string | null
  invoice?: {
    total: number
    status: string
    url?: string | null
    qb_invoice_id?: string | null
    created_at?: string | null
  } | null
  documents?: Array<{
    id: string
    kind: string
    title: string
    at: string
    url?: string | null
  }>
}

export type PortalHistoryRow = {
  id: string
  tripId: string
  tripRef: number
  kind: 'trip' | 'po' | 'invoice'
  title: string
  subtitle: string
  state: string
  poNumber: string | null
  amountUsd: number | null
  href: string
  at: string | null
}

/** Open portal soft/hard quote request — links into trip track or request restore. */
export type PortalOpenRequestCard = {
  id: string
  ref: number
  lane: string
  summary: string
  statusLabel: string
  hardQuote: boolean
  href: string
  created_at: string
}

export type PortalOpenRequestLike = {
  id: string
  ref: number
  lane: string
  summary: string
  status: string
  created_at: string
  hard_quote_requested_at?: string | null
  linked_trip_id?: string | null
  track_token?: string | null
  email?: string | null
  client_id?: string | null
}

export function isPortalAppActiveState(state: string): boolean {
  return PORTAL_APP_ACTIVE_STATES.has(state)
}

export function isPortalAppHistoryState(state: string): boolean {
  return PORTAL_APP_HISTORY_STATES.has(state)
}

export function portalAppStateLabel(state: string): string {
  switch (state) {
    case 'quoted_estimated':
      return 'Estimate'
    case 'quoted_hard':
      return 'Quote'
    case 'offers_out':
      return 'Sourcing'
    case 'booked':
      return 'Booked'
    case 'in_progress':
      return 'Live'
    case 'delivered':
      return 'Delivered'
    case 'invoiced':
      return 'Invoiced'
    case 'closed':
      return 'Closed'
    case 'lost':
      return 'Lost'
    case 'cancelled':
      return 'Cancelled'
    default:
      return state.replace(/_/g, ' ')
  }
}

function poFromTrip(t: PortalAppTripLike): string | null {
  const po = (t.po_number ?? '').trim()
  if (po) return po
  const code = (t.code ?? '').trim()
  if (code) return code
  return null
}

function tripHref(t: PortalAppTripLike): string {
  return `/portal/trips/${t.id}`
}

/** Split signed-in trips into active (home) vs past (history). */
export function partitionPortalAppTrips<T extends { state: string }>(
  trips: T[],
): { active: T[]; history: T[] } {
  const active: T[] = []
  const history: T[] = []
  for (const t of trips) {
    if (isPortalAppHistoryState(t.state)) history.push(t)
    else active.push(t)
  }
  return { active, history }
}

/** Cards for open portal requests — deep-link trip track when linked, else restore quote. */
export function buildPortalOpenRequestCards(
  requests: PortalOpenRequestLike[],
): PortalOpenRequestCard[] {
  return [...requests]
    .filter((r) => r.status !== 'withdrawn')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => {
      const hardQuote = Boolean(r.hard_quote_requested_at)
      const href = r.linked_trip_id
        ? `/portal/trips/${r.linked_trip_id}`
        : r.track_token
          ? `/portal/track/${r.track_token}`
          : `/portal/request?requestId=${encodeURIComponent(r.id)}`
      return {
        id: r.id,
        ref: r.ref,
        lane: (r.lane || '').trim() || '—',
        summary: (r.summary || '').trim() || 'Trip request',
        statusLabel: hardQuote
          ? 'Hard quote requested'
          : r.status === 'quoted'
            ? 'Rough quote'
            : 'Request open',
        hardQuote,
        href,
        created_at: r.created_at,
      }
    })
}

/**
 * One place for previous trips, POs, and invoices — client-safe only.
 * Invoice rows show client total when present (never vendor / margin).
 */
export function buildPortalHistoryLedger(
  trips: PortalAppTripLike[],
): PortalHistoryRow[] {
  const rows: PortalHistoryRow[] = []
  for (const t of trips) {
    const po = poFromTrip(t)
    const at = t.updated_at ?? t.invoice?.created_at ?? null
    const lane = (t.lane ?? '').trim() || '—'
    const stateLabel = portalAppStateLabel(t.state)

    rows.push({
      id: `trip:${t.id}`,
      tripId: t.id,
      tripRef: t.ref,
      kind: 'trip',
      title: `T-${t.ref}`,
      subtitle: `${lane} · ${stateLabel}`,
      state: t.state,
      poNumber: po,
      amountUsd: null,
      href: tripHref(t),
      at,
    })

    if (po) {
      rows.push({
        id: `po:${t.id}:${po}`,
        tripId: t.id,
        tripRef: t.ref,
        kind: 'po',
        title: `PO ${po}`,
        subtitle: `T-${t.ref} · ${lane}`,
        state: t.state,
        poNumber: po,
        amountUsd: null,
        href: tripHref(t),
        at,
      })
    }

    const inv = t.invoice
    const invDoc = (t.documents ?? []).find((d) => d.kind === 'invoice')
    if (inv || invDoc || t.state === 'invoiced' || t.state === 'closed') {
      const amount =
        inv && Number.isFinite(inv.total) ? Number(inv.total) : null
      const status = inv?.status
        ? inv.status
        : t.state === 'closed'
          ? 'paid'
          : 'sent'
      rows.push({
        id: `invoice:${t.id}`,
        tripId: t.id,
        tripRef: t.ref,
        kind: 'invoice',
        title: po ? `Invoice · PO ${po}` : `Invoice · T-${t.ref}`,
        subtitle: `${lane} · ${status}`,
        state: t.state,
        poNumber: po,
        amountUsd: amount,
        href: inv?.url?.trim() || invDoc?.url?.trim() || tripHref(t),
        at: inv?.created_at ?? invDoc?.at ?? at,
      })
    }
  }

  return rows.sort((a, b) => {
    const ta = a.at ?? ''
    const tb = b.at ?? ''
    if (ta !== tb) return tb.localeCompare(ta)
    return b.tripRef - a.tripRef
  })
}

export function filterPortalHistoryLedger(
  rows: PortalHistoryRow[],
  opts: { kind?: 'all' | 'trip' | 'po' | 'invoice'; q?: string },
): PortalHistoryRow[] {
  const kind = opts.kind ?? 'all'
  const needle = (opts.q ?? '').trim().toLowerCase()
  return rows.filter((r) => {
    if (kind !== 'all' && r.kind !== kind) return false
    if (!needle) return true
    return [
      r.title,
      r.subtitle,
      r.poNumber,
      r.tripRef,
      r.state,
      r.amountUsd != null ? String(r.amountUsd) : '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })
}

export function portalAppTabPath(tab: PortalAppTab): string {
  if (tab === 'home') return '/portal'
  if (tab === 'book') return '/portal/request'
  if (tab === 'history') return '/portal/history'
  return '/portal/account'
}

/**
 * Request-page chrome when the client is signed in.
 * Guests see "Already moving? Sign in" instead.
 */
export function portalRequestHelloLabel(
  companyName: string | null | undefined,
): string {
  const name = (companyName ?? '').trim()
  return name ? `Hello ${name}` : 'Hello'
}

export function portalAppTabFromPath(pathname: string): PortalAppTab | null {
  if (pathname === '/portal' || pathname === '/portal/') return 'home'
  if (pathname.startsWith('/portal/request')) return 'book'
  if (pathname.startsWith('/portal/history') || pathname.startsWith('/portal/documents'))
    return 'history'
  if (pathname.startsWith('/portal/account')) return 'account'
  if (pathname.startsWith('/portal/trips/') || pathname.startsWith('/portal/track/'))
    return 'home'
  if (pathname.startsWith('/portal/c/')) return null
  if (pathname.startsWith('/portal/login')) return null
  return null
}
