/**
 * Signed-in client shipments dashboard — always the map+list chrome
 * (matches live tracking UI even when empty). Shows cargo/pax, tail, ETAs.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortalGlassPanel } from '@/components/PortalGlass'
import { PortalOverviewMap } from '@/components/PortalOverviewMap'
import { PortalQuickActions } from '@/components/PortalQuickActions'
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
  const empty = shipments.length === 0
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
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Your trips
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {empty ? 'Live tracking' : props.summaryLine}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {empty
              ? 'Map, cargo/pax, tail, and ETAs appear here once a trip is booked.'
              : 'Select a trip — map pins, cargo/pax, tail, and ETAs update live.'}
          </p>
        </div>
        <span className="avionic text-[11px] text-muted">{props.nowLabel}</span>
      </div>

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
                placeholder="Search PO, lane, tail, cargo…"
                disabled={empty}
                className="portal-glass-input w-full rounded-xl px-3 py-2 text-sm text-ink outline-none disabled:opacity-60"
              />
            </label>
          </div>

          <div className="max-h-[28rem] space-y-4 overflow-y-auto p-3 lg:max-h-[min(70vh,36rem)]">
            {empty ? (
              <p className="rounded-xl border border-dashed border-[rgba(201,162,39,0.25)] px-3 py-6 text-center text-xs text-muted">
                No shipments yet. Book a trip or get a rough estimate — live
                pins light up here when something is out.
              </p>
            ) : (
              <>
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
              </>
            )}
          </div>

          <div className="border-t border-[rgba(201,162,39,0.18)] p-3">
            <PortalQuickActions stacked compact />
          </div>
        </aside>

        <div className="min-h-0 space-y-4">
          {selected ? (
            <PortalShipmentMapPane
              tripId={selected.id}
              trackHref={selected.trackHref}
            />
          ) : (
            <>
              <div className="portal-glass-ink overflow-hidden rounded-2xl">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-cream">
                  <span className="text-gold">● Live routes on map</span>
                  <span className="text-cream/55">{props.nowLabel}</span>
                </div>
                {mapPins.length === 0 ? (
                  <div className="flex h-56 flex-col items-center justify-center gap-2 px-6 text-center sm:h-72">
                    <p className="text-sm text-cream/70">
                      Overview map waits for a booked trip with airports or a
                      live tail.
                    </p>
                    <p className="text-xs text-cream/45">
                      Cargo / pax · tail · ETA show on each shipment once
                      tracking starts.
                    </p>
                  </div>
                ) : (
                  <PortalOverviewMap
                    pins={mapPins}
                    onSelect={setSelectedId}
                    className="h-56 w-full border-t border-cream/10 bg-[#141414] sm:h-72"
                  />
                )}
              </div>
              <PortalGlassPanel className="flex min-h-[10rem] flex-col items-center justify-center gap-2 border-dashed px-5 py-6 text-center text-sm text-muted">
                <p>Select a trip from the sidebar to open live tracking.</p>
                <p className="text-xs">
                  You&apos;ll see cargo/pax, tail number, and ETAs for the
                  selected flight.
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
                  <Link to="/quote" className="font-semibold text-gold">
                    Rough estimate →
                  </Link>
                  <Link
                    to="/portal/request?mode=book"
                    className="font-semibold text-ink hover:text-gold"
                  >
                    Book a trip →
                  </Link>
                </div>
              </PortalGlassPanel>
            </>
          )}
        </div>
      </div>
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
              payloadSummary={s.payload_summary}
              selected={props.selectedId === s.id}
              onSelect={props.onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
