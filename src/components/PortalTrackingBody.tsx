/**
 * Client live-tracking body — route, aircraft position, tail, stage progress.
 * No projected-vs-actual comparison (late teams must not look bad on the portal).
 * Stop / ETA edits live on the OnFly dispatcher Live tracking card — not here.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalAircraftMap } from '@/components/PortalAircraftMap'
import { PortalShell } from '@/components/PortalShell'
import { PortalTripManifestForm } from '@/components/PortalTripManifestForm'
import { PortalTripChat } from '@/components/PortalTripChat'
import { TailFlightActivity } from '@/components/TailFlightActivity'
import { usePortalSession } from '@/hooks/usePortalSession'
import { BRAND_PHONE, BRAND_PHONE_E164 } from '@/domain/brand'
import {
  portalAircraftMapBlocked,
  portalAircraftMapVisible,
  clientOpsStageLabel,
  type OpsForecastRow,
  type PortalTrackingView,
} from '@/domain/portalTracking'
import { adsbIsLiveLock } from '@/domain/adsbFreshness'
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
  if (view.phase === 'delivered' || view.state === 'delivered') return 'Delivered'
  if (a.laddBlocked && a.source === 'none') return 'Live track restricted'
  const active = view.opsForecastRows.find((r) => r.status === 'active')
  if (active) return clientOpsStageLabel(active)
  if (a.source === 'adsb' && a.phase === 'airborne') {
    return 'In the air · live track'
  }
  if (a.phase === 'airborne') return 'In the air'
  if (a.phase === 'positioning') return 'Enroute to pickup'
  if (view.state === 'booked') return 'Booked · standing by'
  return 'Standing by'
}

export function PortalTrackingBody({
  view,
  backHref = '/portal',
  tripId = null,
  trackToken = null,
}: {
  view: PortalTrackingView
  backHref?: string
  /** Enables client passenger / cargo details form on this trip. */
  tripId?: string | null
  /** Magic-link token so guests can persist portal chat. */
  trackToken?: string | null
}) {
  const { signedIn } = usePortalSession()
  const [section, setSection] = useState<'live' | 'stages' | 'details' | 'chat'>(
    'live',
  )
  const fbos = useSyncExternalStore(subscribeFbos, listFbos, listFbos)
  const enrichedStops = useMemo(
    () => enrichTrackingStops(view.stops),
    // fbos subscription invalidates via store; stops are the primary key
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const liveLock = adsbIsLiveLock(a.seenAt)
  const seenAgo = (() => {
    if (a.source !== 'adsb' || !a.seenAt || !liveLock) return null
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
  const currentStageName =
    view.phase === 'delivered' || view.state === 'delivered'
      ? 'Delivered'
      : currentStage
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

  const sections: Array<{
    id: typeof section
    label: string
  }> = [
    { id: 'live', label: 'Live' },
    { id: 'stages', label: 'Stages' },
    { id: 'details', label: 'Details' },
    { id: 'chat', label: 'Chat' },
  ]

  return (
    <PortalShell wide appNav>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={backHref}
          className="text-xs font-semibold uppercase tracking-[0.14em] text-gold hover:text-gold-lt"
        >
          ← All shipments
        </Link>
        <Link
          to="/portal/request?mode=book"
          className="inline-flex min-h-10 items-center rounded-md bg-gold px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink hover:bg-gold-lt"
        >
          Request another trip
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
            className="inline-flex min-h-11 items-center rounded-md border border-gold/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold hover:bg-gold/10"
          >
            Share tracking
          </button>
        </div>
      </header>

      {/* One screen at a time on mobile — desktop still shows the full stack. */}
      <nav
        aria-label="Tracking sections"
        className="mt-5 flex gap-1 overflow-x-auto pb-1 md:hidden"
      >
        {sections.map((s) => {
          const active = section === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={[
                'inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-[11px] font-semibold uppercase tracking-[0.12em]',
                active
                  ? 'bg-gold text-ink'
                  : 'border border-border bg-white text-muted',
              ].join(' ')}
            >
              {s.label}
            </button>
          )
        })}
      </nav>

      <div
        className={
          section === 'live' ? 'mt-4 block' : 'mt-4 hidden md:block'
        }
      >
      <section className="overflow-hidden rounded-md border border-ink/20 bg-ink text-cream">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.14em]">
          <span className="text-gold">
            ●{' '}
            {mapBlocked
              ? 'Track unavailable'
              : a.source === 'adsb' && liveLock
                ? `Live · ${tail}`
                : a.source === 'adsb'
                  ? `Last known · ${tail}`
                  : a.source === 'eta'
                    ? `Track · ${tail}`
                    : 'Track'}
          </span>
          <span className="text-cream/55">
            {mapBlocked
              ? 'BLOCKED'
              : view.phase === 'delivered' || view.state === 'delivered'
                ? 'DELIVERED'
                : currentStage?.key === 'enroute_pickup'
                  ? 'ENROUTE PICKUP'
                  : currentStage?.key === 'at_pickup'
                    ? 'AT PICKUP'
                    : currentStage?.key === 'enroute_dest'
                      ? 'ENROUTE'
                      : currentStage?.key === 'landed_dest'
                        ? currentStage.label === 'Delivered'
                          ? 'DELIVERED'
                          : 'LANDED'
                        : seenAgo ||
                          (view.state === 'in_progress' ? 'LIVE' : 'STANDING BY')}
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
                Live ADS-B for this registration is restricted. Schedule track and
                stage updates still appear when ETAs are on the trip.
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
            {view.phase === 'delivered' || view.state === 'delivered'
              ? 'Delivered — tracking complete.'
              : view.state === 'in_progress'
                ? tail === 'Pending'
                  ? 'Trip is live — assign a real tail on dispatch for live track.'
                  : currentStage?.key === 'enroute_pickup'
                    ? 'Waiting for FlightAware landing at pickup.'
                    : currentStage?.key === 'at_pickup'
                      ? 'On the ground at pickup — live track when airborne to destination.'
                      : 'Waiting for a live lock on this tail.'
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

      <TailFlightActivity
        groups={view.flightActivity}
        variant="portal"
        aircraftType={view.aircraftType}
      />
      </div>

      <div
        className={
          section === 'stages' ? 'mt-6 block' : 'mt-6 hidden md:block'
        }
      >
        <section>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Trip stages
          </div>
          {opsRows.length === 0 ? (
            <p className="text-sm text-muted">
              {view.state === 'in_progress' || view.state === 'booked'
                ? 'Trip schedule is updating — check back shortly, or ask dispatch.'
                : 'Stages appear once the trip is live.'}
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
      </div>

      <div
        className={
          section === 'details' ? 'mt-6 block' : 'mt-6 hidden md:block'
        }
      >
        <section className="grid gap-3 sm:grid-cols-3">
          <InfoCard
            title="Aircraft"
            body={`${tail}${view.aircraftType ? ` · ${view.aircraftType}` : ''}`}
            sub={`Operated by ${view.carrierLabel}.`}
          />
          <InfoCard title="Pickup" body={pickupTitle} sub={pickupSub} />
          <InfoCard title="Drop-off" body={dropoffTitle} sub={dropoffSub} />
        </section>
        {tripId ? <PortalTripManifestForm tripId={tripId} /> : null}
      </div>

      <div
        className={
          section === 'chat' ? 'mt-6 block' : 'mt-6 hidden md:block'
        }
      >
        {tripId ? (
          <PortalTripChat tripId={tripId} variant="portal" token={trackToken} />
        ) : (
          <p className="text-sm text-muted">Chat opens once this trip is linked.</p>
        )}
      </div>

      <div className="mt-8 space-y-3 border-t border-border/60 pt-5">
        <Link
          to="/portal/request?mode=book"
          className="flex w-full min-h-12 items-center justify-center rounded-md bg-gold px-4 text-sm font-semibold text-ink hover:bg-gold-lt"
        >
          Request another trip
        </Link>
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-ink/20 bg-ink px-4 py-3 text-center text-sm font-semibold text-gold"
        >
          <span>Rather talk to a real person? Call now</span>
          <span className="text-xs font-normal text-gold/80">
            Dispatchers always on call ·{' '}
            <span className="avionic">{BRAND_PHONE}</span>
          </span>
        </a>
        {!signedIn ? (
          <p className="text-center text-xs text-muted">
            Want every company shipment in one place?{' '}
            <Link to="/portal/login" className="font-semibold text-gold">
              Sign in
            </Link>
          </p>
        ) : null}
      </div>
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
