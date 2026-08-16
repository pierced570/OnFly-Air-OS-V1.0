/**
 * Client live-tracking body — route, aircraft position, tail, stage progress.
 * No projected-vs-actual comparison (late teams must not look bad on the portal).
 * OnFly desk (?desk=1 or staff session) can edit pickup / drop-off locations.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PortalAircraftMap } from '@/components/PortalAircraftMap'
import { PortalShell } from '@/components/PortalShell'
import { PortalStopPicker } from '@/components/PortalStopPicker'
import {
  portalAircraftMapVisible,
  clientOpsStageLabel,
  type OpsForecastRow,
  type PortalTrackingView,
} from '@/domain/portalTracking'
import {
  emptyPortalStop,
  formatPortalStopAddress,
  formatPortalStopTitle,
  type PortalStopLocation,
} from '@/domain/portalStopLocation'
import { listFbos, subscribeFbos } from '@/lib/fboStore'
import { enrichTrackingStops } from '@/lib/portalTrackingEnrich'
import { getSession, subscribeStaff } from '@/lib/staffStore'
import {
  ensureTripInSession,
  getTrip,
  setPortalStopLocations,
} from '@/lib/tripStore'

function stageStatusLabel(status: OpsForecastRow['status']): string {
  if (status === 'done') return 'Complete'
  if (status === 'active') return 'Current'
  return 'Upcoming'
}

function aircraftWhereLabel(view: PortalTrackingView): string {
  const a = view.aircraft
  if (a.source === 'adsb' && a.phase === 'airborne') {
    return 'In the air · live ADS-B'
  }
  if (a.phase === 'airborne') return 'In the air'
  if (a.phase === 'on_ground') {
    const icao = a.toIcao || a.fromIcao || view.flightFacts.originIcao
    return icao ? `On the ground · ${icao}` : 'On the ground'
  }
  if (a.phase === 'positioning') return 'Positioning to pickup'
  const active = view.opsForecastRows.find((r) => r.status === 'active')
  if (active) return clientOpsStageLabel(active)
  if (view.state === 'delivered') return 'Delivered'
  if (view.state === 'booked') return 'Booked · standing by'
  return 'Standing by'
}

export function PortalTrackingBody({
  view,
  backHref = '/portal',
  tripId = null,
}: {
  view: PortalTrackingView
  backHref?: string
  /** When set, OnFly desk can edit pickup / drop-off (staff session or ?desk=1). */
  tripId?: string | null
}) {
  const [searchParams] = useSearchParams()
  const staff = useSyncExternalStore(
    subscribeStaff,
    getSession,
    () => null,
  )
  const deskEdit =
    Boolean(tripId) &&
    (Boolean(staff) || searchParams.get('desk') === '1')

  const fbos = useSyncExternalStore(subscribeFbos, listFbos, listFbos)
  const enrichedStops = useMemo(
    () => enrichTrackingStops(view.stops),
    [view.stops, fbos],
  )
  const a = view.aircraft
  const showMap = portalAircraftMapVisible(a)
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

  const pickupIcao =
    view.pickupStop?.icao ||
    view.flightFacts.originIcao ||
    depFbo?.icao ||
    pickup?.icao ||
    ''
  const dropoffIcao =
    view.dropoffStop?.icao ||
    view.flightFacts.destIcao ||
    arrFbo?.icao ||
    drop?.icao ||
    ''

  const [editingStops, setEditingStops] = useState(false)
  const [draftPickup, setDraftPickup] = useState<PortalStopLocation>(
    () => view.pickupStop ?? emptyPortalStop(pickupIcao),
  )
  const [draftDropoff, setDraftDropoff] = useState<PortalStopLocation>(
    () => view.dropoffStop ?? emptyPortalStop(dropoffIcao),
  )
  const [saveNote, setSaveNote] = useState<string | null>(null)

  const shareUrl =
    typeof window !== 'undefined' ? window.location.href : backHref

  function shareTracking() {
    void navigator.clipboard?.writeText(shareUrl).catch(() => undefined)
    window.alert('Tracking link copied')
  }

  function openStopEditor() {
    setDraftPickup(view.pickupStop ?? emptyPortalStop(pickupIcao))
    setDraftDropoff(view.dropoffStop ?? emptyPortalStop(dropoffIcao))
    setEditingStops(true)
    setSaveNote(null)
  }

  function saveStops() {
    if (!tripId) return
    const trip = getTrip(tripId)
    if (!trip) {
      // Magic-link session may only have a stub — ensure editable.
      setSaveNote('Trip not in session — open from Dispatch Live tracking.')
      return
    }
    ensureTripInSession(trip)
    setPortalStopLocations(
      tripId,
      { pickup: draftPickup, dropoff: draftDropoff },
      'dispatcher',
    )
    setEditingStops(false)
    setSaveNote('Pickup & drop-off saved.')
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
  const tail =
    (a.tail !== '—' ? a.tail : view.tail)?.trim() || 'TBD'
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
          {deskEdit ? (
            <button
              type="button"
              onClick={() => (editingStops ? setEditingStops(false) : openStopEditor())}
              className="rounded-md border border-ink/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink hover:bg-ink/5"
            >
              {editingStops ? 'Close editor' : 'Edit stops'}
            </button>
          ) : null}
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
            {a.source === 'adsb'
              ? 'Live ADS-B'
              : a.source === 'eta'
                ? 'Live track'
                : 'Track'}
          </span>
          <span className="text-cream/55">{seenAgo || 'STANDING BY'}</span>
        </div>
        {showMap ? (
          <PortalAircraftMap
            aircraft={a}
            className="h-56 w-full border-y border-cream/10 bg-[#141414] sm:h-72"
          />
        ) : (
          <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-cream/50">
            {['booked', 'in_progress', 'delivered'].includes(view.state)
              ? 'Aircraft position appears when the trip is live.'
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
          <ol
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${opsRows.length}, minmax(0, 1fr))`,
            }}
          >
            {opsRows.map((row, i) => {
              const done = row.status === 'done'
              const active = row.status === 'active'
              const prevDone =
                i > 0 ? opsRows[i - 1]!.status === 'done' : false
              return (
                <li
                  key={row.key}
                  className="flex min-w-0 flex-col items-center text-center"
                >
                  <div className="relative flex h-8 w-full items-center justify-center">
                    {i > 0 ? (
                      <span
                        aria-hidden
                        className={[
                          'absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2',
                          prevDone || done ? 'bg-gold' : 'bg-border',
                        ].join(' ')}
                      />
                    ) : null}
                    {i < opsRows.length - 1 ? (
                      <span
                        aria-hidden
                        className={[
                          'absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2',
                          done ? 'bg-gold' : 'bg-border',
                        ].join(' ')}
                      />
                    ) : null}
                    <span
                      className={[
                        'relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold',
                        done
                          ? 'border-gold bg-gold text-ink'
                          : active
                            ? 'border-gold bg-[#F7F2E3] text-gold ring-4 ring-gold/25'
                            : 'border-border bg-white text-transparent',
                      ].join(' ')}
                    >
                      {done ? '✓' : ''}
                    </span>
                  </div>
                  <div
                    className={[
                      'mt-2 w-full px-1 text-[10px] font-semibold uppercase leading-snug tracking-wider',
                      active ? 'text-gold' : 'text-ink',
                    ].join(' ')}
                  >
                    {clientOpsStageLabel(row)}
                  </div>
                  <div
                    className={[
                      'mt-0.5 w-full px-1 text-[10px] uppercase tracking-wider',
                      done
                        ? 'text-[#2E7D32]'
                        : active
                          ? 'text-gold'
                          : 'text-muted',
                    ].join(' ')}
                  >
                    {stageStatusLabel(row.status)}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <InfoCard
          title="Route"
          body={`${originLabel} → ${destLabel}`}
          sub={view.lane}
        />
        <InfoCard
          title="Aircraft"
          body={`${tail}${view.aircraftType ? ` · ${view.aircraftType}` : ''}`}
          sub={`Operated by ${view.carrierLabel}.`}
        />
        <InfoCard title="Pickup" body={pickupTitle} sub={pickupSub} />
        <InfoCard title="Drop-off" body={dropoffTitle} sub={dropoffSub} />
      </section>

      {deskEdit && editingStops ? (
        <section className="mt-6 space-y-4 rounded-md border border-gold/40 bg-white p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
            OnFly desk · pickup & drop-off
          </div>
          <p className="text-xs text-muted">
            Client hangar, field FBO from the directory, or TBD (blank until
            filled). Name and street address show on the client tracker.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <PortalStopPicker
              label="Pickup"
              icao={pickupIcao}
              value={draftPickup}
              onChange={setDraftPickup}
              tone="cream"
            />
            <PortalStopPicker
              label="Drop-off"
              icao={dropoffIcao}
              value={draftDropoff}
              onChange={setDraftDropoff}
              tone="cream"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink"
              onClick={saveStops}
            >
              Save stops
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm text-muted"
              onClick={() => setEditingStops(false)}
            >
              Cancel
            </button>
          </div>
          {saveNote ? (
            <p className="text-xs text-muted">{saveNote}</p>
          ) : null}
        </section>
      ) : null}
      {deskEdit && !editingStops && saveNote ? (
        <p className="mt-3 text-xs text-muted">{saveNote}</p>
      ) : null}
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
