/**
 * Client live-tracking body — mockup layout: map hero, timeline, table, cards.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { PortalAircraftMap } from '@/components/PortalAircraftMap'
import { PortalDeltaPill, PortalShell } from '@/components/PortalShell'
import {
  portalAircraftMapVisible,
  type PortalTrackingView,
} from '@/domain/portalTracking'
import { listFbos, subscribeFbos } from '@/lib/fboStore'
import { enrichTrackingStops } from '@/lib/portalTrackingEnrich'

export function PortalTrackingBody({
  view,
  backHref = '/portal',
}: {
  view: PortalTrackingView
  backHref?: string
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

  const seenAgo = (() => {
    if (!a.seenAt) return null
    const sec = Math.max(
      0,
      Math.round((Date.now() - Date.parse(a.seenAt)) / 1000),
    )
    if (sec < 60) return `UPDATED ${sec} SEC AGO`
    return `UPDATED ${Math.round(sec / 60)} MIN AGO`
  })()

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

      <section className="mt-6 overflow-x-auto">
        <ol className="flex min-w-[640px] items-start gap-0">
          {view.etaRows.map((row, i) => {
            const done = row.status === 'done'
            const active = row.status === 'active'
            return (
              <li key={row.seq} className="relative flex-1 px-1 text-center">
                {i < view.etaRows.length - 1 ? (
                  <div
                    className={[
                      'absolute left-1/2 right-0 top-3 h-0.5',
                      done ? 'bg-gold' : 'bg-border',
                    ].join(' ')}
                  />
                ) : null}
                <div
                  className={[
                    'relative z-[1] mx-auto h-6 w-6 rounded-full border-2',
                    done
                      ? 'border-gold bg-gold'
                      : active
                        ? 'border-gold bg-[#F7F2E3] shadow-[0_0_0_4px_rgba(201,162,39,0.25)]'
                        : 'border-border bg-white',
                  ].join(' ')}
                />
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-ink">
                  {row.event}
                </div>
                <div className="avionic mt-0.5 text-[10px] text-muted">
                  {active && row.isForecast
                    ? `LIVE · ${view.eteLabel ? `${view.eteLabel} TO GO` : 'IN FLIGHT'}`
                    : row.actualOrForecastLocal || '—'}
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
        {view.etaRows.length === 0 ? (
          <p className="text-sm text-muted">
            Milestone timeline appears once the trip is booked.
          </p>
        ) : null}
      </section>

      <section className="mt-6 overflow-x-auto rounded-md border border-border bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted">
              <th className="px-3 py-3 font-semibold">Milestone</th>
              <th className="px-3 py-3 font-semibold">Scheduled</th>
              <th className="px-3 py-3 font-semibold">Actual / Forecast</th>
              <th className="px-3 py-3 font-semibold">Δ vs plan</th>
            </tr>
          </thead>
          <tbody>
            {view.etaRows.map((row) => (
              <tr
                key={`row-${row.seq}`}
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
                  {row.event}
                  <div className="avionic text-[10px] font-normal text-muted">
                    {row.fromLabel} → {row.toLabel}
                  </div>
                </td>
                <td className="avionic px-3 py-3 text-xs text-muted">
                  <div>{row.scheduledLocal || '—'}</div>
                  <div className="text-[10px]">{row.scheduledZulu || ''}</div>
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
                  {row.status === 'active' && row.isForecast
                    ? `IN FLIGHT · ${view.eteLabel ? `${view.eteLabel} TO GO` : 'LIVE'}`
                    : row.actualOrForecastLocal || '—'}
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
        <InfoCard
          title="Pickup location"
          body={
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
        />
        <InfoCard
          title="Drop-off location"
          body={
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
        />
        <InfoCard
          title="Aircraft"
          body={`${view.tail || 'TBD'}${view.aircraftType ? ` · ${view.aircraftType}` : ''}`}
          sub={`Operated by ${view.carrierLabel}.`}
        />
        <InfoCard
          title="Cargo"
          body={view.payloadSummary || view.flightFacts.cargo || '—'}
          sub={view.readyLabel ? `Ready ${view.readyLabel}` : undefined}
        />
      </section>

      <section className="mt-3 rounded-md border border-border bg-white p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Documents
        </div>
        {view.documents.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Airway bill and proof of delivery appear here when available.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {view.documents.map((d) => (
              <li key={d.id}>
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gold hover:text-gold-lt"
                  >
                    {d.title}
                  </a>
                ) : (
                  <span>{d.title}</span>
                )}
                {d.kind === 'pod' ? (
                  <span className="ml-2 text-[10px] uppercase text-[#2E7D32]">
                    POD
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
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
