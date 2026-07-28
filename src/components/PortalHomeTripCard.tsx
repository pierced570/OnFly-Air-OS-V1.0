/**
 * Signed-in portal home card — date, routing, live map, cargo (no pricing).
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createAdsbAdapter, type AdsbPosition } from '@/adapters/adsb'
import { PortalAircraftMap } from '@/components/PortalAircraftMap'
import {
  buildPortalTrackingView,
  portalAircraftMapVisible,
  tripToTrackingInput,
} from '@/domain/portalTracking'
import { formatClientLocal } from '@/domain/timeFmt'
import { getTrip } from '@/lib/tripStore'

const REFRESH_MS = 30_000

function useAdsbForTail(tail: string | null | undefined): AdsbPosition | null {
  const [pos, setPos] = useState<AdsbPosition | null>(null)
  useEffect(() => {
    if (!tail) {
      setPos(null)
      return
    }
    let cancelled = false
    const tick = () => {
      void createAdsbAdapter()
        .positions([tail])
        .then((rows) => {
          if (!cancelled) setPos(rows[0] ?? null)
        })
        .catch(() => {
          if (!cancelled) setPos(null)
        })
    }
    tick()
    const id = window.setInterval(tick, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [tail])
  return pos
}

export type PortalHomeTripCardProps = {
  id: string
  tripRef: number
  state: string
  lane: string
  ready_label: string
  payload_summary: string
  trackHref: string
  etaHint: string | null
  nextLabel: string | null
}

export function PortalHomeTripCard(props: PortalHomeTripCardProps) {
  const trip = getTrip(props.id)
  const nowIso = useMemo(() => new Date().toISOString(), [])
  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail)
  const view = useMemo(() => {
    if (!trip) return null
    return buildPortalTrackingView(tripToTrackingInput(trip), {
      adsb,
      nowIso,
    })
  }, [trip, adsb, nowIso])

  const dateLabel = (() => {
    if (props.ready_label?.trim()) return props.ready_label
    if (trip?.created_at) {
      return formatClientLocal(trip.created_at, 'UTC').local
    }
    return 'Date TBD'
  })()

  const cargo =
    props.payload_summary?.trim() ||
    trip?.payload_summary?.trim() ||
    'Cargo TBD'

  const showMap = view ? portalAircraftMapVisible(view.aircraft) : false

  return (
    <li className="overflow-hidden rounded-md border border-border bg-[#F7F2E3]/50">
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">T-{props.tripRef}</span>
          <span className="text-xs uppercase tracking-wider text-gold">
            {props.state.replace(/_/g, ' ')}
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted">
              Date
            </dt>
            <dd className="avionic mt-0.5 text-ink">{dateLabel}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted">
              Routing
            </dt>
            <dd className="avionic mt-0.5 text-ink">{props.lane || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[10px] uppercase tracking-wider text-muted">
              Cargo
            </dt>
            <dd className="mt-0.5 text-ink">{cargo}</dd>
          </div>
        </dl>
        {props.etaHint ? (
          <p className="avionic mt-2 text-sm text-ink">
            ETA {props.etaHint}
            {props.nextLabel ? (
              <span className="ml-2 text-xs text-muted">
                · next {props.nextLabel}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {showMap && view ? (
        <div className="border-t border-border/60 bg-white px-3 pb-2 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Live map
          </div>
          <div className="mt-1.5">
            <PortalAircraftMap aircraft={view.aircraft} />
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {view.aircraft.source === 'adsb'
              ? 'FlightAware / ADS-B live position'
              : 'Route from live ETA chain'}
          </p>
        </div>
      ) : (
        <div className="border-t border-dashed border-border/60 px-4 py-3 text-xs text-muted">
          Live map unlocks once the aircraft is assigned and tracking.
        </div>
      )}

      <div className="border-t border-border/60 px-4 py-3">
        <Link
          to={props.trackHref}
          className="inline-flex rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-ink"
        >
          Open live tracking →
        </Link>
      </div>
    </li>
  )
}
