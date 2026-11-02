/**
 * Signed-in trips — map-first, boomer-simple.
 * Big Live / Pending / Past tabs. Tap a row → route lights on the US map.
 * Estimate / Book / Call sit as large separate actions. Minimal copy.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PortalAmendedBookPanel } from '@/components/PortalAmendedBookPanel'
import { PortalFastQuote } from '@/components/PortalFastQuote'
import { PortalOverviewMap } from '@/components/PortalOverviewMap'
import {
  BRAND_PHONE,
  BRAND_PHONE_E164,
  dialBrandOps,
} from '@/domain/brand'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
  type PortalShipmentPhase,
} from '@/domain/portalTracking'
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

type FlightTab = 'live' | 'pending' | 'past'

function isLive(phase: PortalShipmentPhase, state: string): boolean {
  if (phase === 'in_flight' || phase === 'on_truck') return true
  if (phase === 'booked') return true
  if (state === 'in_progress' || state === 'booked') return true
  return false
}

function isPast(phase: PortalShipmentPhase): boolean {
  return phase === 'delivered'
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function shortLane(lane: string): string {
  return lane.replace(/\s+/g, ' ').trim() || '—'
}

function statusForShipment(s: PortalDashboardShipment): {
  label: string
  tone: 'live' | 'pending' | 'done' | 'warn'
} {
  if (s.phase === 'in_flight') return { label: 'In air', tone: 'live' }
  if (s.phase === 'on_truck') return { label: 'On ground', tone: 'warn' }
  if (s.phase === 'delivered') return { label: 'Done', tone: 'done' }
  if (s.phase === 'booked' || s.state === 'booked')
    return { label: 'Booked', tone: 'pending' }
  return { label: 'Open', tone: 'pending' }
}

const toneClass: Record<string, string> = {
  live: 'bg-gold text-ink',
  pending: 'bg-ink/80 text-cream',
  done: 'bg-[#2E7D32] text-cream',
  warn: 'bg-[#C0392B]/90 text-cream',
}

export function PortalShipmentsDashboard(props: {
  shipments: PortalDashboardShipment[]
  pending?: PortalDashboardPending[]
  summaryLine: string
  nowLabel: string
  email?: string | null
}) {
  const { shipments } = props
  const pendingReqs = props.pending ?? []
  const [searchParams, setSearchParams] = useSearchParams()
  const panel = searchParams.get('panel')
  const historyFlag = searchParams.get('history') === '1'

  const [tab, setTab] = useState<FlightTab>(() =>
    historyFlag ? 'past' : 'live',
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    () =>
      shipments.find((s) => isLive(s.phase, s.state))?.id ??
      shipments[0]?.id ??
      null,
  )

  useEffect(() => {
    if (historyFlag) setTab('past')
  }, [historyFlag])

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

  const live = useMemo(
    () =>
      shipments.filter(
        (s) => isLive(s.phase, s.state) && !isPast(s.phase),
      ),
    [shipments],
  )
  const past = useMemo(
    () => shipments.filter((s) => isPast(s.phase)),
    [shipments],
  )
  const pendingTrips = useMemo(
    () =>
      shipments.filter(
        (s) => !isPast(s.phase) && !isLive(s.phase, s.state),
      ),
    [shipments],
  )

  const selected =
    shipments.find((s) => s.id === selectedId) ??
    live[0] ??
    pendingTrips[0] ??
    past[0] ??
    null

  const mapPins = useMemo(() => {
    const base = tab === 'past' ? past : tab === 'pending' ? pendingTrips : live
    const ids = new Set(base.map((s) => s.id))
    if (selected && !ids.has(selected.id)) ids.add(selected.id)
    return [...ids].map((id) => {
      const s = shipments.find((x) => x.id === id)!
      return {
        id,
        phase: s.phase,
        selected: selected?.id === id,
      }
    })
  }, [tab, live, past, pendingTrips, selected, shipments])

  function setPanel(next: string | null) {
    const sp = new URLSearchParams(searchParams)
    if (next) sp.set('panel', next)
    else sp.delete('panel')
    sp.delete('history')
    setSearchParams(sp, { replace: true })
  }

  function selectShipment(id: string) {
    setSelectedId(id)
    if (panel === 'book' || panel === 'quote') setPanel(null)
  }

  function switchTab(next: FlightTab) {
    setTab(next)
    const sp = new URLSearchParams(searchParams)
    if (next === 'past') sp.set('history', '1')
    else sp.delete('history')
    setSearchParams(sp, { replace: true })
    const pool =
      next === 'live' ? live : next === 'past' ? past : pendingTrips
    if (pool[0]) setSelectedId(pool[0].id)
  }

  const stageBook = panel === 'book'
  const stageQuote = panel === 'quote'

  const selectedFacts = useMemo(() => {
    if (!selected) return null
    const trip = getTrip(selected.id)
    const view = trip
      ? buildPortalTrackingView(tripToTrackingInput(trip), { adsb: null })
      : null
    const po = (
      selected.poNumber ||
      view?.poNumber ||
      trip?.po_number ||
      `T-${selected.ref}`
    ).replace(/^PO\s*#?\s*/i, '')
    const tail =
      (view?.tail && view.tail !== '—' ? view.tail : null) ||
      trip?.quick?.tail ||
      null
    const eta =
      view?.eteLabel ||
      view?.projectedDisplay ||
      view?.promisedDisplay ||
      null
    return {
      po,
      lane: shortLane(view?.lane || selected.lane),
      tail,
      eta,
      trackHref: selected.trackHref,
      status: statusForShipment(selected),
    }
  }, [selected])

  return (
    <section className="space-y-3">
      {/* Stage */}
      <div className="relative min-h-[min(82vh,54rem)] overflow-hidden rounded-[1.75rem] border border-white/30 bg-[#0C0C0E] shadow-[0_28px_80px_rgba(12,12,14,0.35)]">
        {stageBook ? (
          <PortalAmendedBookPanel
            email={props.email}
            onClose={() => setPanel(null)}
          />
        ) : stageQuote ? (
          <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[rgba(247,242,227,0.94)] px-4 py-5 backdrop-blur-xl sm:px-8">
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="mb-4 self-start text-sm font-semibold text-ink/60 hover:text-ink"
            >
              ← Map
            </button>
            <div className="mx-auto w-full max-w-3xl">
              <PortalFastQuote email={props.email} />
            </div>
          </div>
        ) : (
          <>
            <PortalOverviewMap
              pins={mapPins}
              onSelect={selectShipment}
              lockUsFrame={mapPins.length === 0}
              className="absolute inset-0 h-full w-full"
            />

            {/* Left flight list — big tabs, big rows */}
            <aside className="absolute bottom-3 left-3 top-3 z-10 flex w-[min(100%-1.5rem,21rem)] flex-col overflow-hidden rounded-3xl border border-white/50 bg-[rgba(247,242,227,0.88)] shadow-[0_18px_50px_rgba(12,12,14,0.28)] backdrop-blur-2xl sm:w-[21rem]">
              <div className="grid grid-cols-3 gap-1 border-b border-ink/10 p-2">
                {(
                  [
                    { id: 'live', label: 'Live', n: live.length },
                    {
                      id: 'pending',
                      label: 'Pending',
                      n: pendingTrips.length + pendingReqs.length,
                    },
                    { id: 'past', label: 'Past', n: past.length },
                  ] as const
                ).map((t) => {
                  const active = tab === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => switchTab(t.id)}
                      className={[
                        'min-h-12 rounded-2xl px-1 text-sm font-semibold transition',
                        active
                          ? 'bg-ink text-cream'
                          : 'text-ink/55 hover:bg-white/50 hover:text-ink',
                      ].join(' ')}
                    >
                      {t.label}
                      <span
                        className={[
                          'ml-1 avionic text-xs',
                          active ? 'text-gold' : 'text-ink/35',
                        ].join(' ')}
                      >
                        {t.n}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {tab === 'live' ? (
                  <FlightList
                    empty="Nothing flying yet. Tap Book."
                    items={live}
                    selectedId={selected?.id ?? null}
                    onSelect={selectShipment}
                  />
                ) : null}
                {tab === 'pending' ? (
                  <PendingList
                    requests={pendingReqs}
                    trips={pendingTrips}
                    selectedId={selected?.id ?? null}
                    onSelect={selectShipment}
                  />
                ) : null}
                {tab === 'past' ? (
                  <PastList
                    items={past}
                    selectedId={selected?.id ?? null}
                    onSelect={selectShipment}
                  />
                ) : null}
              </div>
            </aside>

            {/* Big simple actions — own space */}
            <div className="absolute right-3 top-3 z-10 flex w-[min(100%-1.5rem,11.5rem)] flex-col gap-2 sm:right-4 sm:top-4">
              <ActionBtn
                label="Estimate"
                hint="Ballpark $"
                onClick={() => setPanel('quote')}
                tone="glass"
              />
              <ActionBtn
                label="Book"
                hint="Send to desk"
                onClick={() => setPanel('book')}
                tone="gold"
              />
              <ActionBtn
                label="Call"
                hint={BRAND_PHONE}
                onClick={() => dialBrandOps()}
                tone="ink"
                href={`tel:${BRAND_PHONE_E164}`}
              />
            </div>

            {/* Selected flight strip — FUI-simple facts, one tap to full track */}
            {selectedFacts ? (
              <div className="absolute bottom-3 left-[calc(min(100%-1.5rem,21rem)+1.1rem)] right-3 z-10 sm:right-4">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/40 bg-[rgba(12,12,14,0.82)] px-4 py-3 text-cream shadow-[0_16px_40px_rgba(12,12,14,0.35)] backdrop-blur-xl">
                  <span
                    className={[
                      'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
                      toneClass[selectedFacts.status.tone],
                    ].join(' ')}
                  >
                    {selectedFacts.status.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="avionic truncate text-lg font-semibold text-gold sm:text-xl">
                      {selectedFacts.lane}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-cream/60">
                      PO #{selectedFacts.po}
                      {selectedFacts.tail
                        ? ` · Tail ${selectedFacts.tail}`
                        : ''}
                      {selectedFacts.eta ? ` · ETA ${selectedFacts.eta}` : ''}
                    </p>
                  </div>
                  <Link
                    to={selectedFacts.trackHref}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-gold px-4 text-sm font-semibold text-ink hover:bg-gold-lt"
                  >
                    Track →
                  </Link>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

function ActionBtn(props: {
  label: string
  hint: string
  onClick: () => void
  tone: 'glass' | 'gold' | 'ink'
  href?: string
}) {
  const cls =
    props.tone === 'gold'
      ? 'border-gold/60 bg-gold text-ink hover:bg-gold-lt'
      : props.tone === 'ink'
        ? 'border-ink/80 bg-ink/90 text-cream hover:border-gold/50'
        : 'border-white/55 bg-white/55 text-ink hover:bg-white/70'
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'rounded-2xl border px-3.5 py-3 text-left shadow-[0_10px_28px_rgba(12,12,14,0.2)] backdrop-blur-xl transition',
        cls,
      ].join(' ')}
    >
      <div className="text-base font-semibold">{props.label}</div>
      <p
        className={[
          'mt-0.5 text-xs',
          props.tone === 'ink' ? 'text-cream/55' : 'text-ink/55',
          props.tone === 'gold' ? 'text-ink/70' : '',
        ].join(' ')}
      >
        {props.href ? (
          <a href={props.href} className="avionic font-semibold text-gold">
            {props.hint}
          </a>
        ) : (
          props.hint
        )}
      </p>
    </button>
  )
}

function FlightList(props: {
  empty: string
  items: PortalDashboardShipment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (!props.items.length) {
    return <Empty>{props.empty}</Empty>
  }
  return (
    <ul className="space-y-2">
      {props.items.map((s) => {
        const st = statusForShipment(s)
        const selected = props.selectedId === s.id
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => props.onSelect(s.id)}
              aria-current={selected ? 'true' : undefined}
              className={[
                'flex min-h-[4.5rem] w-full flex-col justify-center rounded-2xl px-3.5 py-3 text-left transition',
                selected
                  ? 'bg-ink text-cream shadow-[0_0_0_2px_rgba(201,162,39,0.85)]'
                  : 'bg-white/55 text-ink hover:bg-white/80',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    selected ? 'bg-gold text-ink' : toneClass[st.tone],
                  ].join(' ')}
                >
                  {st.label}
                </span>
                <span
                  className={[
                    'avionic text-[11px]',
                    selected ? 'text-cream/50' : 'text-ink/45',
                  ].join(' ')}
                >
                  PO #
                  {(s.poNumber || `T-${s.ref}`).replace(/^PO\s*#?\s*/i, '')}
                </span>
              </div>
              <div
                className={[
                  'avionic mt-1.5 text-lg font-semibold leading-tight',
                  selected ? 'text-gold' : 'text-ink',
                ].join(' ')}
              >
                {shortLane(s.lane)}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function PendingList(props: {
  requests: PortalDashboardPending[]
  trips: PortalDashboardShipment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (!props.requests.length && !props.trips.length) {
    return <Empty>Nothing pending. Tap Estimate or Book.</Empty>
  }
  return (
    <ul className="space-y-2">
      {props.requests.map((p) => (
        <li key={p.id}>
          <Link
            to={p.href}
            className="flex min-h-[4.5rem] w-full flex-col justify-center rounded-2xl bg-white/55 px-3.5 py-3 text-left text-ink hover:bg-white/80"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cream">
                Pending
              </span>
              <span className="avionic text-[11px] text-ink/45">
                R-{p.ref}
                {p.at ? ` · ${formatShortDate(p.at)}` : ''}
              </span>
            </div>
            <div className="avionic mt-1.5 text-lg font-semibold text-ink">
              {shortLane(p.lane)}
            </div>
          </Link>
        </li>
      ))}
      {props.trips.map((s) => {
        const selected = props.selectedId === s.id
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => props.onSelect(s.id)}
              className={[
                'flex min-h-[4.5rem] w-full flex-col justify-center rounded-2xl px-3.5 py-3 text-left',
                selected
                  ? 'bg-ink text-cream shadow-[0_0_0_2px_rgba(201,162,39,0.85)]'
                  : 'bg-white/55 text-ink hover:bg-white/80',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    selected ? 'bg-gold text-ink' : 'bg-ink/80 text-cream',
                  ].join(' ')}
                >
                  Pending
                </span>
                <span
                  className={[
                    'avionic text-[11px]',
                    selected ? 'text-cream/50' : 'text-ink/45',
                  ].join(' ')}
                >
                  PO #
                  {(s.poNumber || `T-${s.ref}`).replace(/^PO\s*#?\s*/i, '')}
                </span>
              </div>
              <div
                className={[
                  'avionic mt-1.5 text-lg font-semibold',
                  selected ? 'text-gold' : 'text-ink',
                ].join(' ')}
              >
                {shortLane(s.lane)}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function PastList(props: {
  items: PortalDashboardShipment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (!props.items.length) {
    return <Empty>No past flights yet.</Empty>
  }
  return (
    <ul className="space-y-2">
      {props.items.map((s) => {
        const selected = props.selectedId === s.id
        const date = formatShortDate(s.requestedAt)
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => props.onSelect(s.id)}
              className={[
                'flex min-h-[4.5rem] w-full flex-col justify-center rounded-2xl px-3.5 py-3 text-left',
                selected
                  ? 'bg-ink text-cream shadow-[0_0_0_2px_rgba(201,162,39,0.85)]'
                  : 'bg-white/55 text-ink hover:bg-white/80',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={[
                    'avionic text-[11px] font-semibold',
                    selected ? 'text-cream/55' : 'text-ink/45',
                  ].join(' ')}
                >
                  {date || '—'}
                </span>
                <span
                  className={[
                    'avionic text-sm font-semibold',
                    selected ? 'text-cream' : 'text-ink',
                  ].join(' ')}
                >
                  PO #
                  {(s.poNumber || `T-${s.ref}`).replace(/^PO\s*#?\s*/i, '')}
                </span>
              </div>
              <div
                className={[
                  'avionic mt-1.5 text-lg font-semibold',
                  selected ? 'text-gold' : 'text-ink',
                ].join(' ')}
              >
                {shortLane(s.lane)}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Empty(props: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-ink/15 px-3 py-8 text-center text-sm text-ink/45">
      {props.children}
    </p>
  )
}
