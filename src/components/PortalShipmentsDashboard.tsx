/**
 * Signed-in client shipments dashboard — glass sidebar list + live map.
 * FlightAware polls only the selected in_progress trip.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PortalGlassPanel } from '@/components/PortalGlass'
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

type Filter = 'all' | 'enroute' | 'booked' | 'delivered'

function matchesFilter(phase: PortalShipmentPhase, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'enroute') return phase === 'in_flight' || phase === 'on_truck'
  if (filter === 'booked') return phase === 'booked' || phase === 'other'
  if (filter === 'delivered') return phase === 'delivered'
  return true
}

export function PortalShipmentsDashboard(props: {
  shipments: PortalDashboardShipment[]
  summaryLine: string
  nowLabel: string
}) {
  const { shipments } = props
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(
    () => shipments[0]?.id ?? null,
  )
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!shipments.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !shipments.some((s) => s.id === selectedId)) {
      setSelectedId(shipments[0].id)
    }
  }, [shipments, selectedId])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return shipments.filter((s) => {
      if (!matchesFilter(s.phase, filter)) return false
      if (!needle) return true
      return [s.lane, s.payload_summary, `t-${s.ref}`, s.ready_label, s.state]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [shipments, filter, query])

  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'enroute', label: 'Enroute' },
    { id: 'booked', label: 'Booked' },
    { id: 'delivered', label: 'Delivered' },
  ]

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Tracking
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {shipments.length === 0 ? 'No shipments yet' : props.summaryLine}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Select a shipment to see FlightAware position on the map.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <span className="avionic text-[11px] text-muted">{props.nowLabel}</span>
          <Link
            to="/portal/request"
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
          After booking you&apos;ll see live shipments here — select one to open
          the FlightAware map.
        </PortalGlassPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-start">
          <aside className="portal-glass-strong flex min-h-0 flex-col overflow-hidden rounded-2xl">
            <div className="border-b border-[rgba(201,162,39,0.18)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                  Tracking list
                </h2>
                <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
                  {filtered.length}
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
              <div className="mt-2 flex flex-wrap gap-1.5">
                {filters.map((f) => {
                  const on = filter === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={[
                        'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]',
                        on
                          ? 'bg-ink text-gold'
                          : 'portal-glass-row text-muted hover:text-ink',
                      ].join(' ')}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <ul className="max-h-[28rem] space-y-2 overflow-y-auto p-3 lg:max-h-[min(70vh,36rem)]">
              {filtered.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[rgba(201,162,39,0.25)] px-3 py-6 text-center text-xs text-muted">
                  No shipments in this filter.
                </li>
              ) : (
                filtered.map((s) => (
                  <PortalShipmentListItem
                    key={s.id}
                    id={s.id}
                    tripRef={s.ref}
                    state={s.state}
                    lane={s.lane}
                    nextLabel={s.nextLabel}
                    selected={selected?.id === s.id}
                    onSelect={setSelectedId}
                  />
                ))
              )}
            </ul>
          </aside>

          <div className="min-h-0">
            {selected ? (
              <PortalShipmentMapPane
                tripId={selected.id}
                trackHref={selected.trackHref}
              />
            ) : (
              <PortalGlassPanel className="flex min-h-[20rem] items-center justify-center border-dashed text-sm text-muted">
                Select a shipment from the list.
              </PortalGlassPanel>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
