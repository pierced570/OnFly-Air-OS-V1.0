/**
 * Client live-tracking — frosted-glass split (Pinterest inspo).
 * Left: live map. Right: glass facts (cargo/pax, tail, ETA, stages).
 * No projected-vs-actual comparison. Cream client theme; never cost/margin/operator.
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

function cargoPaxLine(view: PortalTrackingView): string {
  const c = view.cargo
  if (c.payloadKind === 'pax') {
    return c.paxCount > 0 ? `${c.paxCount} pax` : 'Passengers'
  }
  if (c.payloadKind === 'both') {
    return [
      c.paxCount > 0 ? `${c.paxCount} pax` : null,
      c.cargoLines[0] || 'Cargo',
    ]
      .filter(Boolean)
      .join(' · ')
  }
  return c.cargoLines[0] || c.summaryLine || view.payloadSummary || 'Cargo'
}

const frostPanel =
  'rounded-3xl border border-white/45 bg-white/35 shadow-[0_20px_60px_rgba(12,12,14,0.1)] backdrop-blur-2xl'
const frostTile =
  'rounded-2xl border border-white/40 bg-white/30 px-4 py-3 backdrop-blur-xl'
const pillBtn =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-ink/15 bg-ink/75 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream backdrop-blur transition hover:bg-ink'

export function PortalTrackingBody({
  view,
  backHref = '/',
  tripId = null,
  trackToken = null,
}: {
  view: PortalTrackingView
  backHref?: string
  tripId?: string | null
  trackToken?: string | null
}) {
  const { signedIn } = usePortalSession()
  const [section, setSection] = useState<'live' | 'stages' | 'details' | 'chat'>(
    'live',
  )
  const fbos = useSyncExternalStore(subscribeFbos, listFbos, listFbos)
  const enrichedStops = useMemo(
    () => enrichTrackingStops(view.stops),
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
  const etaLine =
    view.eteLabel ||
    view.projectedDisplay ||
    view.promisedDisplay ||
    view.nextMilestoneLabel ||
    '—'

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

  const sections: Array<{ id: typeof section; label: string }> = [
    { id: 'live', label: 'Live' },
    { id: 'stages', label: 'Stages' },
    { id: 'details', label: 'Details' },
    { id: 'chat', label: 'Chat' },
  ]

  const statusBadge =
    mapBlocked
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
                  (view.state === 'in_progress' ? 'LIVE' : 'STANDING BY')

  return (
    <PortalShell wide="dashboard" appNav={signedIn} frost>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={backHref}
          className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/55 hover:text-ink"
        >
          ← {signedIn ? 'All shipments' : 'Portal'}
        </Link>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={shareTracking} className={pillBtn}>
            Copy link →
          </button>
          <Link to="/book" className={`${pillBtn} !bg-gold !text-ink !border-gold/40 hover:!bg-gold-lt`}>
            Book another →
          </Link>
        </div>
      </div>

      {/* Frost split: map left · facts right */}
      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:gap-6">
        <section className={`${frostPanel} overflow-hidden text-cream`}>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-ink/70 px-4 py-2.5 text-[10px] uppercase tracking-[0.14em]">
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
            <span className="text-cream/55">{statusBadge}</span>
          </div>
          {mapBlocked ? (
            <div className="relative flex h-64 items-center justify-center bg-[#141414] px-6 text-center sm:h-80">
              <div className="relative max-w-md space-y-2">
                <p className="avionic text-sm font-semibold tracking-wide text-gold">
                  {tail !== 'Pending' ? tail : 'Aircraft'}
                </p>
                <p className="text-sm leading-relaxed text-cream/85">
                  Live ADS-B for this registration is restricted. Stage updates
                  still appear when ETAs are on the trip.
                </p>
              </div>
            </div>
          ) : showMap ? (
            <PortalAircraftMap
              aircraft={a}
              className="h-64 w-full bg-[#141414] sm:h-80"
            />
          ) : (
            <div className="flex h-56 items-center justify-center bg-ink/80 px-4 text-center text-sm text-cream/55 sm:h-72">
              {view.phase === 'delivered' || view.state === 'delivered'
                ? 'Delivered — tracking complete.'
                : view.state === 'in_progress'
                  ? tail === 'Pending'
                    ? 'Trip is live — assign a real tail on dispatch for live track.'
                    : 'Waiting for a live lock on this tail.'
                  : view.state === 'booked'
                    ? 'Aircraft position appears when the trip goes live.'
                    : 'Route map appears once the trip is live.'}
            </div>
          )}
          <div className="grid gap-1 border-t border-white/10 bg-ink/55 px-4 py-3 font-mono text-[11px] text-gold sm:grid-cols-3 sm:text-xs">
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

        <aside className={`${frostPanel} flex flex-col p-5 text-ink sm:p-6`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
            {patternLabel}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="avionic mt-1 text-sm text-ink/55">{view.lane}</p>
          <p className="mt-3 text-sm">
            <span className="font-semibold text-ink">{currentStageName}</span>
          </p>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <FactTile label="Tail" value={tail} mono />
            <FactTile label="ETA" value={etaLine} mono />
            <FactTile label="Cargo / pax" value={cargoPaxLine(view)} />
            <FactTile
              label="Aircraft"
              value={view.aircraftType || '—'}
            />
          </div>

          <div className="mt-4 space-y-2">
            <FactTile
              label="Pickup"
              value={pickupTitle}
              sub={pickupSub}
            />
            <FactTile
              label="Drop-off"
              value={dropoffTitle}
              sub={dropoffSub}
            />
          </div>

          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="mt-auto pt-5 text-xs text-ink/50 hover:text-ink"
          >
            Need help? Call ops{' '}
            <span className="avionic font-semibold text-ink">
              {BRAND_PHONE}
            </span>
          </a>
        </aside>
      </div>

      <nav
        aria-label="Tracking sections"
        className="mt-6 flex gap-1 overflow-x-auto pb-1"
      >
        {sections.map((s) => {
          const active = section === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={[
                'inline-flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] backdrop-blur',
                active
                  ? 'border border-ink/20 bg-ink/80 text-cream'
                  : 'border border-white/40 bg-white/35 text-ink/60 hover:bg-white/50',
              ].join(' ')}
            >
              {s.label}
            </button>
          )
        })}
      </nav>

      {section === 'live' ? (
        <div className="mt-4">
          <TailFlightActivity
            groups={view.flightActivity}
            variant="portal"
            aircraftType={view.aircraftType}
          />
        </div>
      ) : null}

      {section === 'stages' ? (
        <section className={`mt-4 ${frostPanel} overflow-hidden`}>
          <div className="border-b border-white/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">
            Trip stages
          </div>
          {opsRows.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink/55">
              {view.state === 'in_progress' || view.state === 'booked'
                ? 'Trip schedule is updating — check back shortly, or ask dispatch.'
                : 'Stages appear once the trip is live.'}
            </p>
          ) : (
            <ol className="divide-y divide-white/25">
              {opsRows.map((row) => {
                const done = row.status === 'done'
                const active = row.status === 'active'
                return (
                  <li
                    key={row.key}
                    className="flex items-start gap-3 px-4 py-3.5"
                  >
                    <span
                      className={[
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                        done
                          ? 'border-gold bg-gold text-ink'
                          : active
                            ? 'border-gold bg-white/70 text-gold ring-4 ring-gold/20'
                            : 'border-ink/20 bg-white/40 text-transparent',
                      ].join(' ')}
                      aria-hidden
                    >
                      {done ? '✓' : ''}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={[
                          'text-sm font-semibold leading-snug',
                          active ? 'text-ink' : 'text-ink/85',
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
                              : 'text-ink/45',
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
      ) : null}

      {section === 'details' ? (
        <div className="mt-4 space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className={frostTile}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                Aircraft
              </div>
              <div className="mt-2 text-sm font-medium text-ink">
                {tail}
                {view.aircraftType ? ` · ${view.aircraftType}` : ''}
              </div>
              <p className="mt-1 text-xs text-ink/50">
                Operated by {view.carrierLabel}.
              </p>
            </div>
            <div className={frostTile}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                Pickup
              </div>
              <div className="mt-2 text-sm font-medium text-ink">{pickupTitle}</div>
              {pickupSub ? (
                <p className="mt-1 text-xs text-ink/50">{pickupSub}</p>
              ) : null}
            </div>
            <div className={frostTile}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                Drop-off
              </div>
              <div className="mt-2 text-sm font-medium text-ink">
                {dropoffTitle}
              </div>
              {dropoffSub ? (
                <p className="mt-1 text-xs text-ink/50">{dropoffSub}</p>
              ) : null}
            </div>
          </section>
          {tripId ? <PortalTripManifestForm tripId={tripId} /> : null}
        </div>
      ) : null}

      {section === 'chat' ? (
        <div className="mt-4">
          {tripId ? (
            <PortalTripChat
              tripId={tripId}
              variant="portal"
              token={trackToken}
            />
          ) : (
            <p className="text-sm text-ink/55">
              Chat opens once this trip is linked.
            </p>
          )}
        </div>
      ) : null}

      {!signedIn ? (
        <p className="mt-8 text-center text-xs text-ink/50">
          Want every company shipment in one place?{' '}
          <Link to="/portal/login" className="font-semibold text-ink underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      ) : null}
    </PortalShell>
  )
}

function FactTile(props: {
  label: string
  value: string
  sub?: string
  mono?: boolean
}) {
  return (
    <div className={frostTile}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">
        {props.label}
      </div>
      <div
        className={[
          'mt-1.5 text-sm font-semibold text-ink',
          props.mono ? 'avionic' : '',
        ].join(' ')}
      >
        {props.value}
      </div>
      {props.sub ? (
        <p className="mt-0.5 text-xs text-ink/50">{props.sub}</p>
      ) : null}
    </div>
  )
}
