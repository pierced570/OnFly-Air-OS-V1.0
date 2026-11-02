/**
 * Selected-shipment map pane — glass FlightAware-backed map for the
 * client dashboard. Polls ADS-B only for the selected in_progress trip.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalAircraftMap } from '@/components/PortalAircraftMap'
import { useAdsbForTail, adsbPollEnabledForState } from '@/hooks/useAdsbForTail'
import {
  buildPortalTrackingView,
  clientOpsStageLabel,
  portalAircraftMapBlocked,
  portalAircraftMapVisible,
  tripToTrackingInput,
} from '@/domain/portalTracking'
import { adsbIsLiveLock } from '@/domain/adsbFreshness'
import { ensurePortalTripTrackingReady } from '@/lib/portalTripHydrate'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

export function PortalShipmentMapPane(props: {
  tripId: string
  trackHref: string
  /** Show when the trip was requested alongside ETA. */
  showRequested?: boolean
}) {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const [hydrating, setHydrating] = useState(true)
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())

  useEffect(() => {
    const id = window.setInterval(
      () => setNowIso(new Date().toISOString()),
      30_000,
    )
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    setHydrating(true)
    void (async () => {
      await ensurePortalTripTrackingReady({ tripId: props.tripId })
      if (!cancelled) setHydrating(false)
    })()
    return () => {
      cancelled = true
    }
  }, [props.tripId])

  const trip = getTrip(props.tripId)
  const input = trip ? tripToTrackingInput(trip) : null
  const air = input?.eta_chain.find((l) => l.type === 'air_leg')
  const adsb = useAdsbForTail(input?.tail, {
    enabled: adsbPollEnabledForState(trip?.state),
    originIcao: air?.from.icao,
    destIcao: air?.to.icao,
  })

  const view = useMemo(() => {
    if (!trip) return null
    return buildPortalTrackingView(tripToTrackingInput(trip), {
      adsb,
      nowIso,
    })
  }, [trip, adsb, nowIso])

  if (hydrating && !trip) {
    return (
      <div className="portal-glass-strong flex h-full min-h-[20rem] items-center justify-center rounded-2xl text-sm text-muted">
        Loading shipment…
      </div>
    )
  }

  if (!trip || !view) {
    return (
      <div className="portal-glass flex h-full min-h-[20rem] items-center justify-center rounded-2xl border-dashed text-sm text-muted">
        Select a shipment to track.
      </div>
    )
  }

  const a = view.aircraft
  const mapBlocked = portalAircraftMapBlocked(a)
  const showMap = !mapBlocked && portalAircraftMapVisible(a)
  const liveLock = adsbIsLiveLock(a.seenAt)
  const active = view.opsForecastRows.find((r) => r.status === 'active')
  const stageName =
    view.phase === 'delivered'
      ? 'Delivered'
      : active
        ? clientOpsStageLabel(active)
        : view.nextMilestoneLabel || 'Standing by'
  const tail =
    (a.tail !== '—' ? a.tail : view.tail)?.trim() ||
    trip.quick?.tail ||
    'Pending'
  const po =
    view.poNumber?.replace(/^PO\s*#?\s*/i, '') || `T-${view.ref}`
  const requestedAt = trip.created_at || null
  const requestedLabel = (() => {
    if (!requestedAt) return null
    try {
      return new Date(requestedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return null
    }
  })()
  const etaLabel =
    view.eteLabel ||
    view.projectedDisplay ||
    view.promisedDisplay ||
    view.nextMilestoneLabel ||
    null

  return (
    <div className="portal-glass-strong flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgba(201,162,39,0.18)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
            {view.phase === 'delivered'
              ? 'Previous flight'
              : trip.state === 'in_progress'
                ? 'Live track'
                : 'Selected flight'}
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold text-ink">
            PO #{po}
            <span className="avionic text-muted"> · {view.lane}</span>
          </h2>
          <p className="mt-1 text-sm text-ink">
            <span className="font-semibold text-gold">{stageName}</span>
            <span className="text-muted"> · Tail </span>
            <span className="avionic font-semibold">{tail}</span>
            {view.aircraftType ? (
              <span className="text-muted"> · {view.aircraftType}</span>
            ) : null}
          </p>
          {props.showRequested ? (
            <p className="mt-1.5 text-xs text-muted">
              {requestedLabel ? (
                <>
                  Requested{' '}
                  <span className="avionic font-semibold text-ink">
                    {requestedLabel}
                  </span>
                </>
              ) : (
                'Request time pending'
              )}
              {etaLabel ? (
                <>
                  {' '}
                  · ETA{' '}
                  <span className="avionic font-semibold text-ink">
                    {etaLabel}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <Link
          to={props.trackHref}
          className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-gold/50 bg-gold/10 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold hover:bg-gold/20"
        >
          Full tracking →
        </Link>
      </div>

      <div className="relative bg-ink/90 text-cream">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.14em]">
          <span className="text-gold">
            ●{' '}
            {mapBlocked
              ? 'Track unavailable'
              : a.source === 'adsb' && liveLock
                ? `Live · FlightAware · ${tail}`
                : a.source === 'adsb'
                  ? `Last known · ${tail}`
                  : a.source === 'eta'
                    ? `Schedule track · ${tail}`
                    : 'Track'}
          </span>
          <span className="text-cream/55">
            {view.phase === 'delivered'
              ? 'DELIVERED'
              : trip.state === 'in_progress'
                ? 'ENROUTE'
                : trip.state === 'booked'
                  ? 'BOOKED'
                  : 'STANDING BY'}
          </span>
        </div>

        {mapBlocked ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-cream/80 sm:h-56">
            Live ADS-B for this registration is restricted. Stage updates still
            appear when ETAs are on the trip.
          </div>
        ) : showMap ? (
          <PortalAircraftMap
            aircraft={a}
            className="h-48 w-full border-y border-cream/10 bg-[#141414] sm:h-56"
          />
        ) : (
          <div className="flex h-48 items-center justify-center px-4 text-center text-sm text-cream/50 sm:h-56">
            {view.phase === 'delivered'
              ? 'Delivered — tracking complete.'
              : trip.state === 'in_progress'
                ? tail === 'Pending'
                  ? 'Trip is live — assign a real tail on dispatch for FlightAware track.'
                  : 'Waiting for a live FlightAware lock on this tail.'
                : trip.state === 'booked'
                  ? 'Aircraft position appears when the trip goes live.'
                  : 'Select a live shipment to see FlightAware position.'}
          </div>
        )}
      </div>

      <div className="grid gap-3 border-t border-[rgba(201,162,39,0.18)] px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
        <Meta
          label="Aircraft"
          value={`${tail}${view.aircraftType ? ` · ${view.aircraftType}` : ''}`}
        />
        <Meta
          label="Cargo / pax"
          value={
            view.cargo.payloadKind === 'pax'
              ? view.cargo.paxCount > 0
                ? `${view.cargo.paxCount} pax`
                : 'Passengers'
              : view.cargo.payloadKind === 'both'
                ? [
                    view.cargo.paxCount > 0
                      ? `${view.cargo.paxCount} pax`
                      : null,
                    view.cargo.cargoLines[0] || 'Cargo',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : view.cargo.cargoLines[0] ||
                  view.cargo.summaryLine ||
                  view.payloadSummary ||
                  'Cargo'
          }
        />
        <Meta
          label="ETA"
          value={
            view.eteLabel ||
            view.projectedDisplay ||
            view.promisedDisplay ||
            view.nextMilestoneLabel ||
            '—'
          }
        />
        <Meta
          label="Source"
          value={
            a.source === 'adsb' && liveLock
              ? 'FlightAware live'
              : a.source === 'adsb'
                ? 'FlightAware last known'
                : a.source === 'eta'
                  ? 'ETA schedule'
                  : 'Pending'
          }
        />
      </div>
    </div>
  )
}

function Meta(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {props.label}
      </div>
      <div className="mt-1 text-sm font-medium text-ink">{props.value}</div>
    </div>
  )
}
