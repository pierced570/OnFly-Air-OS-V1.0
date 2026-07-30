/**
 * Client live-tracking body — map hero, ops timeline, Actual vs Forecast, cards.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalAircraftMap } from '@/components/PortalAircraftMap'
import { PortalDeltaPill, PortalShell } from '@/components/PortalShell'
import {
  portalAircraftMapVisible,
  type OpsForecastRow,
  type PortalTrackingView,
} from '@/domain/portalTracking'
import { listFbos, subscribeFbos } from '@/lib/fboStore'
import { enrichTrackingStops } from '@/lib/portalTrackingEnrich'
import { setPortalStopAddresses } from '@/lib/tripStore'

export function PortalTrackingBody({
  view,
  backHref = '/portal',
  tripId,
}: {
  view: PortalTrackingView
  backHref?: string
  /** When set, pickup/drop-off street fields can be saved on the trip. */
  tripId?: string | null
}) {
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

  const [pickupStreet, setPickupStreet] = useState(view.pickupStreet ?? '')
  const [dropoffStreet, setDropoffStreet] = useState(view.dropoffStreet ?? '')
  const [addrSaved, setAddrSaved] = useState(false)

  useEffect(() => {
    const active = document.activeElement?.getAttribute('data-portal-addr')
    if (active !== 'pickup') setPickupStreet(view.pickupStreet ?? '')
    if (active !== 'dropoff') setDropoffStreet(view.dropoffStreet ?? '')
  }, [view.pickupStreet, view.dropoffStreet])

  const shareUrl =
    typeof window !== 'undefined' ? window.location.href : backHref

  function shareTracking() {
    void navigator.clipboard?.writeText(shareUrl).catch(() => undefined)
    window.alert('Tracking link copied')
  }

  function smsUpdates() {
    window.alert(
      'Ask your OnFly dispatcher to add your cell for SMS updates — or reply to your ETA sheet email.',
    )
  }

  function saveAddresses() {
    if (!tripId) {
      window.alert('Open this trip from your portal home to save addresses.')
      return
    }
    setPortalStopAddresses(tripId, {
      pickup: pickupStreet,
      dropoff: dropoffStreet,
    })
    setAddrSaved(true)
    window.setTimeout(() => setAddrSaved(false), 2500)
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

  // Prefer ops rows (pickup / loading / live). Never fall back to raw ETA
  // event labels — those made the stepper look broken and inconsistent.
  const opsRows: OpsForecastRow[] = view.opsForecastRows

  const cargo = view.cargo

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
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={shareTracking}
            className="rounded-md border border-gold/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold hover:bg-gold/10"
          >
            Share tracking
          </button>
          <button
            type="button"
            onClick={smsUpdates}
            className="rounded-md bg-gold px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink hover:bg-gold-lt"
          >
            Get SMS updates
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
                ? 'Live ETA track'
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
          <div className="flex h-40 items-center justify-center text-sm text-cream/50">
            Route map appears once the trip is booked with an ETA chain.
          </div>
        )}
        <div className="grid gap-3 px-4 py-3 font-mono text-[11px] text-gold sm:grid-cols-5 sm:text-xs">
          <div>
            {(a.tail !== '—' ? a.tail : view.tail) || 'TBD'}
            {view.aircraftType ? ` · ${view.aircraftType.toUpperCase()}` : ''}
          </div>
          <div>GS {a.gsKts != null ? `${a.gsKts} KT` : '—'}</div>
          <div>
            ALT {a.altFt != null ? `${a.altFt.toLocaleString()} FT` : '—'}
          </div>
          <div>ETE REMAINING {view.eteLabel ? view.eteLabel : '—'}</div>
          <div className="sm:text-right">
            ETA{' '}
            {view.flightFacts.nextArriveDisplay ||
              view.projectedDisplay ||
              '—'}
          </div>
        </div>
      </section>

      <section className="mt-6">
        {opsRows.length === 0 ? (
          <p className="text-sm text-muted">
            Milestone timeline appears once the trip is booked.
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
                        'relative z-[1] box-border h-6 w-6 shrink-0 rounded-full border-2',
                        done
                          ? 'border-gold bg-gold'
                          : active
                            ? 'border-gold bg-[#F7F2E3] ring-4 ring-gold/25'
                            : 'border-border bg-white',
                      ].join(' ')}
                    />
                  </div>
                  <div className="mt-2 w-full px-1 text-[10px] font-semibold uppercase leading-snug tracking-wider text-ink">
                    {row.label}
                  </div>
                  <div className="avionic mt-0.5 w-full px-1 text-[10px] text-muted">
                    {active && row.isForecast
                      ? row.actualOrForecastLocal || 'LIVE'
                      : row.estimatedLocal || '—'}
                  </div>
                  <div className="mt-1 flex justify-center">
                    <PortalDeltaPill
                      deltaMin={row.deltaMin}
                      live={active && row.isForecast}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="mt-6 overflow-x-auto rounded-md border border-border bg-white">
        <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Actual vs forecast
        </div>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted">
              <th className="px-3 py-3 font-semibold">Milestone</th>
              <th className="px-3 py-3 font-semibold">Estimated</th>
              <th className="px-3 py-3 font-semibold">Actual / Forecast</th>
              <th className="px-3 py-3 font-semibold">Difference</th>
            </tr>
          </thead>
          <tbody>
            {opsRows.map((row) => (
              <tr
                key={`ops-${row.key}`}
                className={[
                  'border-b border-border/50 last:border-0',
                  row.status === 'active' ? 'bg-gold/5' : '',
                ].join(' ')}
              >
                <td
                  className={[
                    'px-3 py-3 font-medium',
                    row.status === 'active' ? 'text-gold' : 'text-ink',
                  ].join(' ')}
                >
                  {row.label}
                </td>
                <td className="avionic px-3 py-3 text-xs text-muted">
                  <div>{row.estimatedLocal || '—'}</div>
                  {row.estimatedZulu ? (
                    <div className="text-[10px]">{row.estimatedZulu}</div>
                  ) : null}
                </td>
                <td
                  className={[
                    'avionic px-3 py-3 text-xs',
                    row.status === 'active'
                      ? 'font-semibold text-gold'
                      : row.isForecast
                        ? 'text-[#C0392B]'
                        : 'text-ink',
                  ].join(' ')}
                >
                  {row.actualOrForecastLocal || '—'}
                  {row.isForecast && row.status !== 'active' ? (
                    <span className="ml-1 text-[10px]">forecast</span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <PortalDeltaPill
                    deltaMin={row.deltaMin}
                    live={row.status === 'active' && row.isForecast}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <AddressCard
          title="Pickup location"
          place={
            pickup?.displayAddress ||
            depFbo?.displayAddress ||
            depFbo?.fboName ||
            view.flightFacts.originIcao ||
            '—'
          }
          sub={
            pickup?.fboName ||
            depFbo?.airportCityState ||
            depFbo?.icao ||
            undefined
          }
          street={pickupStreet}
          onStreetChange={setPickupStreet}
          fieldKey="pickup"
          editable={Boolean(tripId)}
        />
        <AddressCard
          title="Drop-off location"
          place={
            drop?.displayAddress ||
            arrFbo?.displayAddress ||
            arrFbo?.fboName ||
            view.flightFacts.destIcao ||
            '—'
          }
          sub={
            drop?.fboName ||
            arrFbo?.airportCityState ||
            arrFbo?.icao ||
            undefined
          }
          street={dropoffStreet}
          onStreetChange={setDropoffStreet}
          fieldKey="dropoff"
          editable={Boolean(tripId)}
        />
        <InfoCard
          title="Aircraft"
          body={`${view.tail || 'TBD'}${view.aircraftType ? ` · ${view.aircraftType}` : ''}`}
          sub={`Operated by ${view.carrierLabel}.`}
        />
        <div className="rounded-md border border-border bg-white p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Cargo
          </div>
          {cargo.paxCount > 0 ? (
            <div className="mt-2 text-sm font-medium text-ink">
              {cargo.paxCount} pax
              {cargo.paxNames.length ? (
                <ul className="mt-1 list-inside list-disc text-xs font-normal text-ink/90">
                  {cargo.paxNames.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs font-normal text-muted">
                  Passenger names appear when booked on the request form.
                </p>
              )}
            </div>
          ) : null}
          {cargo.cargoLines.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {cargo.cargoLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : cargo.paxCount === 0 ? (
            <div className="mt-2 text-sm font-medium text-ink">
              {cargo.summaryLine || '—'}
            </div>
          ) : null}
          {cargo.readyLabel ? (
            <p className="mt-2 text-xs text-muted">Ready {cargo.readyLabel}</p>
          ) : null}
        </div>
      </section>

      {tripId ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveAddresses}
            className="rounded-md bg-ink px-4 py-2 text-xs font-semibold text-gold hover:bg-[#1a1a1a]"
          >
            Save street addresses
          </button>
          {addrSaved ? (
            <span className="text-xs text-[#2E7D32]">Addresses saved</span>
          ) : (
            <span className="text-xs text-muted">
              Add a specific street address for pickup and drop-off when needed.
            </span>
          )}
        </div>
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

function AddressCard(props: {
  title: string
  place: string
  sub?: string
  street: string
  onStreetChange: (v: string) => void
  fieldKey: 'pickup' | 'dropoff'
  editable: boolean
}) {
  return (
    <div className="rounded-md border border-border bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {props.title}
      </div>
      <div className="mt-2 text-sm font-medium text-ink">{props.place}</div>
      {props.sub ? <p className="mt-1 text-xs text-muted">{props.sub}</p> : null}
      <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        Street address
        {props.editable ? (
          <textarea
            data-portal-addr={props.fieldKey}
            value={props.street}
            onChange={(e) => props.onStreetChange(e.target.value)}
            rows={2}
            placeholder="Building, street, city, ZIP…"
            className="mt-1 w-full rounded-md border border-border bg-[#F7F2E3]/60 px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-gold"
          />
        ) : (
          <div className="mt-1 text-sm font-normal normal-case tracking-normal text-ink">
            {props.street.trim() || '—'}
          </div>
        )}
      </label>
    </div>
  )
}
