/**
 * Signed-in client trips workspace — full-bleed US map with gold city
 * twinkles; sidebar Pending / Live / Previous; separate Estimate + Call spots;
 * Book replaces the map with a light amended booking panel.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PortalAmendedBookPanel } from '@/components/PortalAmendedBookPanel'
import { PortalFastQuote } from '@/components/PortalFastQuote'
import { PortalOverviewMap } from '@/components/PortalOverviewMap'
import { PortalShipmentMapPane } from '@/components/PortalShipmentMapPane'
import { PortalShipmentListItem } from '@/components/PortalShipmentListItem'
import {
  BRAND_PHONE,
  BRAND_PHONE_E164,
  dialBrandOps,
} from '@/domain/brand'
import type { PortalShipmentPhase } from '@/domain/portalTracking'
import { getTrip } from '@/lib/tripStore'

export type PortalDashboardShipment = {
  id: string
  ref: number
  state: string
  lane: string
  ready_label: string
  payload_summary: string
  trackHref: string
  nextLabel: string | null
  phase: PortalShipmentPhase
  /** ISO when the trip / request was opened. */
  requestedAt?: string | null
  poNumber?: string | null
}

export type PortalDashboardPending = {
  id: string
  ref: number
  lane: string
  statusLabel: string
  summary: string
  href: string
  at?: string | null
}

function isLive(phase: PortalShipmentPhase, state: string): boolean {
  if (phase === 'in_flight' || phase === 'on_truck') return true
  if (phase === 'booked') return true
  if (state === 'in_progress' || state === 'booked') return true
  return false
}

function isPrevious(phase: PortalShipmentPhase): boolean {
  return phase === 'delivered'
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function PortalShipmentsDashboard(props: {
  shipments: PortalDashboardShipment[]
  pending?: PortalDashboardPending[]
  summaryLine: string
  nowLabel: string
  email?: string | null
}) {
  const { shipments } = props
  const pending = props.pending ?? []
  const [searchParams, setSearchParams] = useSearchParams()
  const panel = searchParams.get('panel')
  const historyOpen = searchParams.get('history') === '1' || panel === 'history'

  const [selectedId, setSelectedId] = useState<string | null>(
    () =>
      shipments.find((s) => isLive(s.phase, s.state))?.id ??
      shipments[0]?.id ??
      null,
  )
  const [query, setQuery] = useState('')
  const [prevOpen, setPrevOpen] = useState(historyOpen)

  useEffect(() => {
    if (historyOpen) setPrevOpen(true)
  }, [historyOpen])

  useEffect(() => {
    if (!shipments.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !shipments.some((s) => s.id === selectedId)) {
      setSelectedId(
        shipments.find((s) => isLive(s.phase, s.state))?.id ??
          shipments[0]!.id,
      )
    }
  }, [shipments, selectedId])

  const needle = query.trim().toLowerCase()
  const matchesQuery = (s: PortalDashboardShipment) => {
    if (!needle) return true
    return [
      s.lane,
      s.payload_summary,
      `t-${s.ref}`,
      s.ready_label,
      s.state,
      s.poNumber,
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  }

  const live = useMemo(
    () =>
      shipments.filter(
        (s) => isLive(s.phase, s.state) && !isPrevious(s.phase) && matchesQuery(s),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shipments, needle],
  )
  const previous = useMemo(
    () => shipments.filter((s) => isPrevious(s.phase) && matchesQuery(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shipments, needle],
  )
  /** Pre-book trips (quoted / intake) sit with open requests under Pending. */
  const pendingTrips = useMemo(
    () =>
      shipments.filter(
        (s) =>
          !isPrevious(s.phase) &&
          !isLive(s.phase, s.state) &&
          matchesQuery(s),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shipments, needle],
  )
  const pendingFiltered = useMemo(() => {
    if (!needle) return pending
    return pending.filter((p) =>
      [p.lane, p.summary, `r-${p.ref}`, p.statusLabel]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [pending, needle])
  const pendingCount = pendingFiltered.length + pendingTrips.length

  const selected =
    shipments.find((s) => s.id === selectedId) ??
    live[0] ??
    pendingTrips[0] ??
    previous[0] ??
    null

  const mapPins = useMemo(
    () =>
      [
        ...live,
        ...pendingTrips.filter((s) => s.id === selected?.id),
        ...previous.filter((s) => s.id === selected?.id),
      ].map((s) => ({
        id: s.id,
        phase: s.phase,
        selected: selected?.id === s.id,
      })),
    [live, pendingTrips, previous, selected?.id],
  )

  function setPanel(next: string | null) {
    const sp = new URLSearchParams(searchParams)
    if (next) sp.set('panel', next)
    else sp.delete('panel')
    if (next !== 'history') sp.delete('history')
    setSearchParams(sp, { replace: true })
  }

  function selectShipment(id: string) {
    setSelectedId(id)
    if (panel === 'book' || panel === 'quote') setPanel(null)
  }

  const stageBook = panel === 'book'
  const stageQuote = panel === 'quote'

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Your trips
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {stageBook
              ? 'Quick book'
              : stageQuote
                ? 'Rough estimate'
                : props.summaryLine}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {stageBook
              ? 'Essentials only — desk finishes the rest.'
              : stageQuote
                ? 'Ballpark by aircraft class, then call or book.'
                : 'Select pending, live, or previous — the map lights the route. Live tails show tracking, request time, and ETA.'}
          </p>
        </div>
        <span className="avionic text-[11px] text-muted">{props.nowLabel}</span>
      </div>

      <div className="relative min-h-[min(78vh,52rem)] overflow-hidden rounded-3xl border border-white/35 bg-ink/80 shadow-[0_24px_70px_rgba(12,12,14,0.22)]">
        {/* Stage: map | amended book | rough estimate */}
        <div className="absolute inset-0">
          {stageBook ? (
            <PortalAmendedBookPanel
              email={props.email}
              onClose={() => setPanel(null)}
            />
          ) : stageQuote ? (
            <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[rgba(247,242,227,0.92)] px-4 py-5 backdrop-blur-xl sm:px-8">
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPanel(null)}
                  className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55 hover:text-ink"
                >
                  ← Back to map
                </button>
              </div>
              <div className="mx-auto w-full max-w-3xl">
                <PortalFastQuote email={props.email} />
              </div>
            </div>
          ) : (
            <PortalOverviewMap
              pins={mapPins}
              onSelect={selectShipment}
              lockUsFrame={mapPins.length === 0}
              className="h-full w-full"
            />
          )}
        </div>

        {/* Left sidebar — Pending / Live / Previous */}
        {!stageBook && !stageQuote ? (
          <aside className="absolute bottom-3 left-3 top-3 z-10 flex w-[min(100%-1.5rem,20rem)] flex-col overflow-hidden rounded-2xl border border-white/45 bg-white/40 shadow-[0_16px_48px_rgba(12,12,14,0.18)] backdrop-blur-2xl sm:w-[19.5rem]">
            <div className="border-b border-ink/10 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                  Flights
                </h2>
                <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
                  {pendingCount} pend · {live.length} live · {previous.length}{' '}
                  prev
                </span>
              </div>
              <label className="mt-2 block">
                <span className="sr-only">Search shipments</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search PO, lane, tail…"
                  className="portal-glass-input w-full rounded-xl px-3 py-2 text-sm text-ink outline-none"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              <SidebarGroup
                title="Pending"
                empty="No open quotes or requests."
                count={pendingCount}
              >
                {pendingCount === 0 ? null : (
                  <ul className="space-y-2">
                    {pendingFiltered.map((p) => (
                      <li key={p.id}>
                        <Link
                          to={p.href}
                          className="portal-glass-row block w-full rounded-xl px-3.5 py-3 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="avionic text-sm font-semibold text-ink">
                              R-{p.ref}
                            </div>
                            <span className="shrink-0 rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
                              Pending
                            </span>
                          </div>
                          <div className="avionic mt-1 text-xs font-medium text-gold">
                            {p.lane}
                          </div>
                          <p className="mt-1 truncate text-[11px] text-muted">
                            {p.statusLabel}
                            {p.at ? ` · ${formatShortDate(p.at)}` : ''}
                          </p>
                        </Link>
                      </li>
                    ))}
                    {pendingTrips.map((s) => (
                      <PortalShipmentListItem
                        key={s.id}
                        id={s.id}
                        tripRef={s.ref}
                        state={s.state}
                        lane={s.lane}
                        nextLabel={s.nextLabel}
                        payloadSummary={s.payload_summary}
                        selected={selected?.id === s.id}
                        onSelect={selectShipment}
                      />
                    ))}
                  </ul>
                )}
              </SidebarGroup>

              <SidebarGroup
                title="Live"
                empty="Nothing live yet — book a trip to light the map."
                count={live.length}
              >
                {live.length === 0 ? null : (
                  <ul className="space-y-2">
                    {live.map((s) => (
                      <PortalShipmentListItem
                        key={s.id}
                        id={s.id}
                        tripRef={s.ref}
                        state={s.state}
                        lane={s.lane}
                        nextLabel={s.nextLabel}
                        payloadSummary={s.payload_summary}
                        selected={selected?.id === s.id}
                        onSelect={selectShipment}
                      />
                    ))}
                  </ul>
                )}
              </SidebarGroup>

              <div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !prevOpen
                    setPrevOpen(next)
                    const sp = new URLSearchParams(searchParams)
                    if (next) sp.set('history', '1')
                    else {
                      sp.delete('history')
                      if (panel === 'history') sp.delete('panel')
                    }
                    setSearchParams(sp, { replace: true })
                  }}
                  className="mb-2 flex w-full items-center justify-between gap-2 px-0.5"
                  aria-expanded={prevOpen}
                >
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Previous
                  </h3>
                  <span className="flex items-center gap-2 text-[10px] font-semibold text-gold">
                    {previous.length}
                    <span aria-hidden>{prevOpen ? '▴' : '▾'}</span>
                  </span>
                </button>
                {prevOpen ? (
                  previous.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[rgba(201,162,39,0.25)] px-3 py-4 text-center text-xs text-muted">
                      No previous flights yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {previous.map((s) => (
                        <HistoryRow
                          key={s.id}
                          shipment={s}
                          selected={selected?.id === s.id}
                          onSelect={selectShipment}
                        />
                      ))}
                    </ul>
                  )
                ) : (
                  <p className="px-0.5 text-[11px] text-muted">
                    Expand for date · route · PO #
                  </p>
                )}
              </div>
            </div>
          </aside>
        ) : null}

        {/* Separate Rough estimate + Call ops spots */}
        {!stageBook && !stageQuote ? (
          <div className="absolute bottom-3 right-3 z-10 flex w-[min(100%-1.5rem,15.5rem)] flex-col gap-2 sm:bottom-4 sm:right-4">
            <button
              type="button"
              onClick={() => setPanel('quote')}
              className="rounded-2xl border border-white/50 bg-white/45 px-4 py-3.5 text-left text-ink shadow-[0_12px_36px_rgba(12,12,14,0.16)] backdrop-blur-xl transition hover:bg-white/60"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Rough estimate</div>
                  <p className="mt-0.5 text-xs text-ink/55">
                    Own space · ballpark in seconds
                  </p>
                </div>
                <span className="text-ink/40" aria-hidden>
                  →
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => dialBrandOps()}
              className="rounded-2xl border border-ink/70 bg-ink/80 px-4 py-3.5 text-left text-cream shadow-[0_12px_36px_rgba(12,12,14,0.28)] backdrop-blur-xl transition hover:border-gold/50"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Call ops</div>
                  <p className="mt-0.5 text-xs text-cream/55">
                    24-hr desk ·{' '}
                    <span className="avionic font-semibold text-gold">
                      {BRAND_PHONE}
                    </span>
                  </p>
                </div>
                <a
                  href={`tel:${BRAND_PHONE_E164}`}
                  className="text-gold"
                  aria-label={`Call ${BRAND_PHONE}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  →
                </a>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPanel('book')}
              className="rounded-2xl border border-gold/50 bg-gold px-4 py-3 text-left text-ink shadow-[0_12px_36px_rgba(201,162,39,0.35)] transition hover:bg-gold-lt"
            >
              <div className="text-sm font-semibold">Book a trip</div>
              <p className="mt-0.5 text-xs text-ink/70">
                Amended form over the map
              </p>
            </button>
          </div>
        ) : null}

        {/* Selected live / previous detail over the map */}
        {!stageBook && !stageQuote && selected ? (
          <div className="pointer-events-none absolute bottom-3 left-[calc(min(100%-1.5rem,20rem)+1.25rem)] right-[calc(min(100%-1.5rem,15.5rem)+1.25rem)] z-10 hidden min-w-0 lg:block">
            <div className="pointer-events-auto max-h-[42%] overflow-y-auto rounded-2xl shadow-[0_16px_48px_rgba(12,12,14,0.28)]">
              <PortalShipmentMapPane
                tripId={selected.id}
                trackHref={selected.trackHref}
                showRequested
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Mobile / tablet: selected detail below map when sidebar covers */}
      {!stageBook && !stageQuote && selected ? (
        <div className="lg:hidden">
          <PortalShipmentMapPane
            tripId={selected.id}
            trackHref={selected.trackHref}
            showRequested
          />
        </div>
      ) : null}

      {!stageBook && !stageQuote && !selected ? (
        <p className="text-center text-xs text-muted">
          Gold twinkles mark major US cities. Live tails and routes appear when
          a trip is out — or{' '}
          <button
            type="button"
            className="font-semibold text-gold"
            onClick={() => setPanel('book')}
          >
            book now
          </button>
          .
        </p>
      ) : null}
    </section>
  )
}

function SidebarGroup(props: {
  title: string
  empty: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          {props.title}
        </h3>
        <span className="text-[10px] font-semibold text-gold">
          {props.count}
        </span>
      </div>
      {props.count === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgba(201,162,39,0.25)] px-3 py-4 text-center text-xs text-muted">
          {props.empty}
        </p>
      ) : (
        props.children
      )}
    </div>
  )
}

function HistoryRow(props: {
  shipment: PortalDashboardShipment
  selected: boolean
  onSelect: (id: string) => void
}) {
  const s = props.shipment
  const trip = getTrip(s.id)
  const po =
    (s.poNumber || trip?.po_number || trip?.quick?.po || `T-${s.ref}`).replace(
      /^PO\s*#?\s*/i,
      '',
    )
  const requested = s.requestedAt || trip?.created_at || null

  return (
    <li>
      <button
        type="button"
        onClick={() => props.onSelect(s.id)}
        aria-current={props.selected ? 'true' : undefined}
        className={[
          'portal-glass-row w-full rounded-xl px-3.5 py-3 text-left',
          props.selected ? 'is-selected' : '',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="avionic text-[11px] font-semibold text-muted">
            {formatShortDate(requested)}
          </div>
          <div className="avionic text-sm font-semibold text-ink">
            PO #{po}
          </div>
        </div>
        <div className="avionic mt-1 text-xs font-medium text-gold">
          {s.lane || '—'}
        </div>
      </button>
    </li>
  )
}
