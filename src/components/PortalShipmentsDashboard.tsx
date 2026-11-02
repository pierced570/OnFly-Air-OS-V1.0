/**
 * Signed-in client shipments dashboard — glass sidebar (out now + past)
 * + overview map with lit pins + selected FlightAware detail pane.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortalGlassPanel } from '@/components/PortalGlass'
import { PortalOverviewMap } from '@/components/PortalOverviewMap'
import { PortalShipmentListItem } from '@/components/PortalShipmentListItem'
import { PortalShipmentMapPane } from '@/components/PortalShipmentMapPane'
import type { PortalShipmentPhase } from '@/domain/portalTracking'

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
}

function isOutNow(phase: PortalShipmentPhase): boolean {
  return (
    phase === 'in_flight' ||
    phase === 'on_truck' ||
    phase === 'booked' ||
    phase === 'other'
  )
}

function isPast(phase: PortalShipmentPhase): boolean {
  return phase === 'delivered'
}

export function PortalShipmentsDashboard(props: {
  shipments: PortalDashboardShipment[]
  summaryLine: string
  nowLabel: string
}) {
  const { shipments } = props
  const [selectedId, setSelectedId] = useState<string | null>(
    () => shipments.find((s) => isOutNow(s.phase))?.id ?? shipments[0]?.id ?? null,
  )
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!shipments.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !shipments.some((s) => s.id === selectedId)) {
      setSelectedId(
        shipments.find((s) => isOutNow(s.phase))?.id ?? shipments[0].id,
      )
    }
  }, [shipments, selectedId])

  const needle = query.trim().toLowerCase()
  const matchesQuery = (s: PortalDashboardShipment) => {
    if (!needle) return true
    return [s.lane, s.payload_summary, `t-${s.ref}`, s.ready_label, s.state]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  }

  const outNow = useMemo(
    () => shipments.filter((s) => isOutNow(s.phase) && matchesQuery(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shipments, needle],
  )
  const past = useMemo(
    () => shipments.filter((s) => isPast(s.phase) && matchesQuery(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shipments, needle],
  )

  const selected =
    shipments.find((s) => s.id === selectedId) ??
    outNow[0] ??
    past[0] ??
    null

  const mapPins = useMemo(
    () =>
      [...outNow, ...past.filter((s) => s.id === selected?.id)].map((s) => ({
        id: s.id,
        phase: s.phase,
        selected: selected?.id === s.id,
      })),
    [outNow, past, selected?.id],
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Your trips
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {shipments.length === 0 ? 'No shipments yet' : props.summaryLine}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Select a trip in the sidebar — map pins light up for routes in motion.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <span className="avionic mr-1 text-[11px] text-muted">{props.nowLabel}</span>
          <Link
            to="/quote"
            className="portal-glass-row inline-flex min-h-12 flex-1 items-center justify-center rounded-xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink sm:flex-none"
          >
            Rough estimate
          </Link>
          <Link
            to="/portal/request?mode=book"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-gold px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink shadow-[0_10px_28px_rgba(201,162,39,0.28)] hover:bg-gold-lt sm:flex-none"
          >
            Book a trip
          </Link>
        </div>
      </div>

      {shipments.length === 0 ? (
        <PortalGlassPanel
          strong
          className="border-dashed px-6 py-8 text-sm text-muted"
        >
          <p>
            After booking you&apos;ll see live and past trips here — map pins
            light up for anything currently out.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link
              to="/quote"
              className="portal-glass-row inline-flex min-h-11 items-center justify-center rounded-xl text-xs font-semibold uppercase tracking-[0.12em] text-ink"
            >
              Rough estimate
            </Link>
            <Link
              to="/portal/request?mode=book"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold text-xs font-semibold uppercase tracking-[0.12em] text-ink hover:bg-gold-lt"
            >
              Book a trip
            </Link>
          </div>
        </PortalGlassPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-start">
          <aside className="portal-glass-strong flex min-h-0 flex-col overflow-hidden rounded-2xl">
            <div className="border-b border-[rgba(201,162,39,0.18)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                  Trips
                </h2>
                <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
                  {outNow.length} out · {past.length} past
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

            <div className="max-h-[28rem] space-y-4 overflow-y-auto p-3 lg:max-h-[min(70vh,36rem)]">
              <SidebarGroup
                title="Out now"
                empty="Nothing currently out."
                items={outNow}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
              <SidebarGroup
                title="Past trips"
                empty="No delivered trips yet."
                items={past}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[rgba(201,162,39,0.18)] p-3">
              <Link
                to="/quote"
                className="portal-glass-row flex min-h-11 items-center justify-center rounded-xl text-[10px] font-semibold uppercase tracking-[0.1em] text-ink"
              >
                Estimate
              </Link>
              <Link
                to="/portal/request?mode=book"
                className="flex min-h-11 items-center justify-center rounded-xl bg-gold text-[10px] font-semibold uppercase tracking-[0.1em] text-ink hover:bg-gold-lt"
              >
                Book
              </Link>
            </div>
          </aside>

          <div className="min-h-0 space-y-4">
            <div className="portal-glass-ink overflow-hidden rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-cream">
                <span className="text-gold">
                  ● {outNow.length} live route{outNow.length === 1 ? '' : 's'} on map
                </span>
                <span className="text-cream/55">{props.nowLabel}</span>
              </div>
              {mapPins.length === 0 ? (
                <div className="flex h-56 items-center justify-center px-4 text-center text-sm text-cream/55 sm:h-72">
                  Trip pins appear when airports or a live tail are on the
                  shipment.
                </div>
              ) : (
                <PortalOverviewMap
                  pins={mapPins}
                  onSelect={setSelectedId}
                  className="h-56 w-full border-t border-cream/10 bg-[#141414] sm:h-72"
                />
              )}
            </div>

            {selected ? (
              <PortalShipmentMapPane
                tripId={selected.id}
                trackHref={selected.trackHref}
              />
            ) : (
              <PortalGlassPanel className="flex min-h-[12rem] items-center justify-center border-dashed text-sm text-muted">
                Select a trip from the sidebar.
              </PortalGlassPanel>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function SidebarGroup(props: {
  title: string
  empty: string
  items: PortalDashboardShipment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          {props.title}
        </h3>
        <span className="text-[10px] font-semibold text-gold">
          {props.items.length}
        </span>
      </div>
      {props.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgba(201,162,39,0.25)] px-3 py-4 text-center text-xs text-muted">
          {props.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {props.items.map((s) => (
            <PortalShipmentListItem
              key={s.id}
              id={s.id}
              tripRef={s.ref}
              state={s.state}
              lane={s.lane}
              nextLabel={s.nextLabel}
              selected={props.selectedId === s.id}
              onSelect={props.onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
