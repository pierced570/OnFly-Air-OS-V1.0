/**
 * Client live-tracking body — route, aircraft position, tail, stage progress.
 * No projected-vs-actual comparison (late teams must not look bad on the portal).
 * Stop / ETA edits live on the OnFly dispatcher Live tracking card — not here.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalAircraftMap } from '@/components/PortalAircraftMap'
import { PortalShell } from '@/components/PortalShell'
import {
  portalAircraftMapBlocked,
  portalAircraftMapVisible,
  clientOpsStageLabel,
  type OpsForecastRow,
  type PortalTrackingView,
} from '@/domain/portalTracking'
import {
  formatPortalStopAddress,
  formatPortalStopTitle,
} from '@/domain/portalStopLocation'
import { listFbos, subscribeFbos } from '@/lib/fboStore'
import { enrichTrackingStops } from '@/lib/portalTrackingEnrich'

function stageStatusLabel(status: OpsForecastRow['status']): string {
  if (status === 'done') return 'Complete'
  if (status === 'active') return 'Current'
  return 'Upcoming'
}

function aircraftWhereLabel(view: PortalTrackingView): string {
  const a = view.aircraft
  if (a.laddBlocked) return 'Blocked from view'
  if (a.source === 'adsb' && a.phase === 'airborne') {
    return 'In the air · live track'
  }
  if (a.phase === 'airborne') return 'In the air'
  if (a.phase === 'on_ground') {
    const icao = a.toIcao || a.fromIcao || view.flightFacts.originIcao
    return icao ? `On the ground · ${icao}` : 'On the ground'
  }
  if (a.phase === 'positioning') return 'Enroute to pickup'
  const active = view.opsForecastRows.find((r) => r.status === 'active')
  if (active) return clientOpsStageLabel(active)
  if (view.state === 'delivered') return 'Landed at destination'
  if (view.state === 'booked') return 'Booked · standing by'
  return 'Standing by'
}

export function PortalTrackingBody({
  view,
  backHref = '/portal',
}: {
  view: PortalTrackingView
  backHref?: string
  /** @deprecated Desk edits moved to OnFly Live tracking — ignored. */
  tripId?: string | null
}) {
  const fbos = useSyncExternalStore(subscribeFbos, listFbos, listFbos)
  const enrichedStops = useMemo(
    () => enrichTrackingStops(view.stops),
    [view.stops, fbos],
  )
  const a = view.aircraft
  const mapBlocked = portalAircraftMapBlocked(a)
  const showMap = !mapBlocked && portalAircraftMapVisible(a)
  const po =
    view.poNumber?.replace(/^PO\s*#?\s*/i, '') || `T-${view.ref}`
  const title = view.code
    ? `PO #${po} · Trip ${view.code}`
    : `PO #${po} · Trip T-${view.ref}`
  const patternLabel =
    view.pattern === 'D2D'
      ? 'Door to door'
      : view.pattern === 'D2A'
        ? 'Door to airport'
        : view.pattern === 'A2D'
          ? 'Airport to door'
          : 'Airport to airport'

  const pickup = enrichedStops.find((s) => s.role === 'pickup')
  const drop = enrichedStops.find((s) => s.role === 'delivery')
  const depFbo = enrichedStops.find((s) => s.role === 'departure_fbo')
  const arrFbo = enrichedStops.find((s) => s.role === 'arrival_fbo')

  const shareUrl =
    typeof window !== 'undefined' ? window.location.href : backHref

  function shareTracking() {
    void navigator.clipboard?.writeText(shareUrl).catch(() => undefined)
    window.alert('Tracking link copied')
  }

  const seenAgo = (() => {
    if (!a.seenAt) return null
    const sec = Math.max(
      0,
      Math.round((Date.now() - Date.parse(a.seenAt)) / 1000),
    )
    if (sec < 60) return `UPDATED ${sec} SEC AGO`
    return `UPDATED ${Math.round(sec / 60)} MIN AGO`
  })()

  const opsRows: OpsForecastRow[] = view.opsForecastRows
  const currentStage =
    opsRows.find((r) => r.status === 'active') ??
    (opsRows.every((r) => r.status === 'done') ? opsRows.at(-1) : null)
  const currentStageName = currentStage
    ? clientOpsStageLabel(currentStage)
    : aircraftWhereLabel(view)
  const tailRaw =
    (a.tail !== '—' ? a.tail : view.tail)?.trim() || ''
  const tail =
    tailRaw && tailRaw.toUpperCase() !== 'TBD' ? tailRaw : 'Pending'
  const originLabel =
    view.flightFacts.originIcao ||
    depFbo?.icao ||
    pickup?.icao ||
    'Origin'
  const destLabel =
    view.flightFacts.destIcao ||
    arrFbo?.icao ||
    drop?.icao ||
    'Destination'

  const pickupTitle = view.pickupStop
    ? formatPortalStopTitle(view.pickupStop)
    : pickup?.displayAddress ||
      depFbo?.displayAddress ||
      depFbo?.fboName ||
      originLabel
  const pickupSub = view.pickupStop
    ? formatPortalStopAddress(view.pickupStop) ||
      (view.pickupStop.kind === 'tbd'
        ? 'To be confirmed'
        : view.pickupStop.icao || undefined)
    : undefined
  const dropoffTitle = view.dropoffStop
    ? formatPortalStopTitle(view.dropoffStop)
    : drop?.displayAddress ||
      arrFbo?.displayAddress ||
      arrFbo?.fboName ||
      destLabel
  const dropoffSub = view.dropoffStop
    ? formatPortalStopAddress(view.dropoffStop) ||
      (view.dropoffStop.kind === 'tbd'
        ? 'To be confirmed'
        : view.dropoffStop.icao || undefined)
    : undefined

  return (
    <PortalShell wide>
      <div className="mb-4">
        <Link
          to={backHref}
          className="text-xs font-semibold uppercase tracking-[0.14em] text-gold hover:text-gold-lt"
        >
          ← All shipments
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            {patternLabel}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          <p className="avionic mt-1 text-sm text-muted">{view.lane}</p>
          <p className="mt-2 text-sm text-ink">
            <span className="font-semibold text-gold">{currentStageName}</span>
            <span className="text-muted"> · Tail </span>
            <span className="avionic font-semibold">{tail}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={shareTracking}
            className="rounded-md border border-gold/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold hover:bg-gold/10"
          >
            Share tracking
          </button>
        </div>
      </header>

      <section className="mt-6 overflow-hidden rounded-md border border-ink/20 bg-ink text-cream">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.14em]">
          <span className="text-gold">
            ●{' '}
            {mapBlocked
              ? 'Track unavailable'
              : a.source === 'adsb'
                ? `Live · ${tail}`
                : a.source === 'eta'
                  ? `Track · ${tail}`
                  : 'Track'}
          </span>
          <span className="text-cream/55">
            {mapBlocked
              ? 'BLOCKED'
              : seenAgo ||
                (view.state === 'in_progress'
                  ? a.phase === 'positioning' || a.phase === 'airborne'
                    ? 'LIVE'
                    : 'AT PICKUP'
                  : 'STANDING BY')}
          </span>
        </div>
        {mapBlocked ? (
          <div className="relative flex h-56 items-center justify-center bg-[#141414] px-6 text-center sm:h-72">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 30% 40%, #2a2a2e 0%, transparent 55%), radial-gradient(circle at 70% 60%, #1a1a1c 0%, transparent 50%)',
              }}
            />
            <div className="relative max-w-md space-y-2">
              <p className="avionic text-sm font-semibold tracking-wide text-gold">
                {tail !== 'Pending' ? tail : 'Aircraft'}
              </p>
              <p className="text-sm leading-relaxed text-cream/85">
                Unfortunately this tail number is blocked from view. Dispatch
                will manually provide updates.
              </p>
            </div>
          </div>
        ) : showMap ? (
          <PortalAircraftMap
            aircraft={a}
            className="h-56 w-full border-y border-cream/10 bg-[#141414] sm:h-72"
          />
        ) : (
          <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-cream/50">
            {view.state === 'in_progress'
              ? tail === 'Pending'
                ? 'Trip is live — assign a real tail on dispatch for live track.'
                : 'Waiting for wheels-up or a live lock on this tail.'
              : view.state === 'booked'
                ? 'Aircraft position appears when the trip goes live.'
                : 'Route map appears once the trip is live.'}
          </div>
        )}
        <div className="grid gap-2 px-4 py-3 font-mono text-[11px] text-gold sm:grid-cols-3 sm:text-xs">
          <div>
            {tail}
            {view.aircraftType ? ` · ${view.aircraftType.toUpperCase()}` : ''}
          </div>
          <div className="sm:text-center">{aircraftWhereLabel(view)}</div>
          <div className="avionic sm:text-right">
            {originLabel} → {destLabel}
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Trip stages
        </div>
        {opsRows.length === 0 ? (
          <p className="text-sm text-muted">
            Stages appear once the trip is live.
          </p>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-md border border-border bg-white">
            {opsRows.map((row) => {
              const done = row.status === 'done'
              const active = row.status === 'active'
              return (
                <li
                  key={row.key}
                  className="flex items-start gap-3 px-3.5 py-3"
                >
                  <span
                    className={[
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                      done
                        ? 'border-gold bg-gold text-ink'
                        : active
                          ? 'border-gold bg-[#F7F2E3] text-gold ring-4 ring-gold/25'
                          : 'border-border bg-white text-transparent',
                    ].join(' ')}
                    aria-hidden
                  >
                    {done ? '✓' : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={[
                        'text-sm font-semibold leading-snug',
                        active ? 'text-gold' : 'text-ink',
                      ].join(' ')}
                    >
                      {clientOpsStageLabel(row)}
                    </div>
                    <div
                      className={[
                        'mt-0.5 text-[11px] uppercase tracking-wider',
                        done
                          ? 'text-[#2E7D32]'
                          : active
                            ? 'text-gold'
                            : 'text-muted',
                      ].join(' ')}
                    >
                      {stageStatusLabel(row.status)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <InfoCard
          title="Aircraft"
          body={`${tail}${view.aircraftType ? ` · ${view.aircraftType}` : ''}`}
          sub={`Operated by ${view.carrierLabel}.`}
        />
        <InfoCard title="Pickup" body={pickupTitle} sub={pickupSub} />
        <InfoCard title="Drop-off" body={dropoffTitle} sub={dropoffSub} />
      </section>
    </PortalShell>
  )
}

function InfoCard(props: { title: string; body: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {props.title}
      </div>
      <div className="mt-2 text-sm font-medium text-ink">{props.body}</div>
      {props.sub ? <p className="mt-1 text-xs text-muted">{props.sub}</p> : null}
    </div>
  )
}
