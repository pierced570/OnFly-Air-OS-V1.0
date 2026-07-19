import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { FlightCatBadge } from '@/components/FlightCatBadge'
import {
  REST_IDLE_HOURS,
  formatIdleLabel,
  type FlyingTripRow,
  type IdleOperatorRow,
  type NationalWxSummary,
} from '@/domain/fleetBriefing'
import { FLIGHT_CATEGORY_LABELS } from '@/domain/flightCategory'
import { loadFleetBriefing } from '@/lib/fleetBriefingData'
import { listTripsStable, subscribeTrips } from '@/lib/tripStore'
import { getOnShift, updateShiftNotes } from '@/lib/shiftStore'

export default function BriefingPage() {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const pendingQuotes = trips.filter((t) =>
    ['quoted_estimated', 'offers_out'].includes(t.state),
  )
  const onShift = getOnShift()
  const [notes, setNotes] = useState(onShift?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [idleOperators, setIdleOperators] = useState<IdleOperatorRow[]>([])
  const [nationalWx, setNationalWx] = useState<NationalWxSummary | null>(null)
  const [flyingTrips, setFlyingTrips] = useState<FlyingTripRow[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [adsbPending, setAdsbPending] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setBusy(true)
    setError(null)
    try {
      const b = await loadFleetBriefing()
      setIdleOperators(b.idleOperators)
      setNationalWx(b.nationalWx)
      setFlyingTrips(b.flyingTrips)
      setFetchedAt(b.fetchedAt)
      setAdsbPending(b.adsbPending)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [trips.length])

  const zulu = useMemo(() => {
    if (!fetchedAt) return '—'
    try {
      return new Date(fetchedAt).toISOString().slice(11, 16) + 'Z'
    } catch {
      return '—'
    }
  }, [fetchedAt])

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            Fleet ops
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            Fleet briefing
          </h1>
          <p className="mt-1 text-sm text-muted">
            Idle top operators (≥{REST_IDLE_HOURS}h), national WX glance, trips
            out flying.
            {onShift && (
              <span className="ml-2 text-gold">
                On shift: {onShift.person_name}
              </span>
            )}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            As of <span className="avionic text-cream">{zulu}</span>
            {adsbPending
              ? ' · ADS-B pending — idle uses trip history when available'
              : ' · ADS-B + trip history'}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-gold/40 px-3 py-1.5 text-sm text-gold hover:bg-gold/10 disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? 'Refreshing…' : 'Refresh brief'}
        </button>
      </header>

      {error && (
        <p className="rounded-md border border-late/40 bg-late/10 px-3 py-2 text-sm text-late">
          {error}
        </p>
      )}

      {/* Primary three-panel brief */}
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            Top operators idle ≥{REST_IDLE_HOURS}h
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Largest fleets with no flight in the last {REST_IDLE_HOURS} hours
            (advisory — operator confirms legality).
          </p>
          {idleOperators.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              {busy
                ? 'Loading…'
                : 'No idle top operators right now — everyone recent or still loading.'}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {idleOperators.map((op) => (
                <li
                  key={op.operator_id}
                  className="rounded border border-border/60 bg-ink px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-cream">
                      {op.operator_name}
                    </span>
                    <span className="avionic text-[11px] text-gold">
                      {formatIdleLabel(op)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
                    <span className="avionic text-cream">
                      {op.base_icao ?? '—'}
                    </span>
                    <span className="avionic">{op.aircraft_count} ac</span>
                    <span>
                      {op.evidence === 'adsb'
                        ? 'from ADS-B'
                        : op.evidence === 'trip'
                          ? 'from trips'
                          : 'no signal'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/network" className="mt-3 inline-block text-xs text-gold">
            Open Network →
          </Link>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            National weather
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Sample hubs CONUS ·{' '}
            <span className="text-vfr">VFR</span>
            {' · '}
            <span className="text-mvfr">MVFR</span>
            {' · '}
            <span className="text-ifr">IFR</span>
            {' · '}
            <span className="text-lifr">LIFR</span>
          </p>
          {!nationalWx ? (
            <p className="mt-3 text-sm text-muted">Loading WX…</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-cream">{nationalWx.headline}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
                {(
                  ['VFR', 'MVFR', 'IFR', 'LIFR'] as const
                ).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1">
                    <FlightCatBadge cat={c} size="sm" />
                    <span className="avionic">{nationalWx.counts[c]}</span>
                  </span>
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {nationalWx.stations.map((s) => (
                  <li
                    key={s.icao}
                    className="flex items-center justify-between gap-1 rounded border border-border/50 bg-ink px-2 py-1.5"
                    title={
                      s.flightCat
                        ? `${s.region} · ${FLIGHT_CATEGORY_LABELS[s.flightCat]}`
                        : s.region
                    }
                  >
                    <span className="avionic text-xs text-cream">{s.icao}</span>
                    <FlightCatBadge cat={s.flightCat} size="sm" />
                  </li>
                ))}
              </ul>
              {nationalWx.worst.length > 0 && (
                <p className="mt-2 text-[11px] text-muted">
                  Watch:{' '}
                  {nationalWx.worst
                    .map((w) => `${w.icao} ${w.cat}`)
                    .join(' · ')}
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            Trips out flying
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            In progress, or booked with an open/active leg.
          </p>
          {flyingTrips.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              None out right now — quiet sky for OnFly trips.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {flyingTrips.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/trips/${t.id}`}
                    className="block rounded border border-onplan/30 bg-onplan/10 px-3 py-2 hover:border-gold/40"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="avionic text-sm text-gold">T-{t.ref}</span>
                      <span className="avionic text-[11px] text-onplan">
                        {t.state}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-cream">{t.lane}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {t.operator_name ?? 'Operator TBD'}
                      {t.active_leg_label ? ` · ${t.active_leg_label}` : ''}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/" className="mt-3 inline-block text-xs text-gold">
            Open Board →
          </Link>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Pending offers / quotes
          </h2>
          <p className="mt-2 avionic text-cream">{pendingQuotes.length}</p>
          {pendingQuotes.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Clear</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {pendingQuotes.map((t) => (
                <li key={t.id}>
                  <Link to={`/trips/${t.id}`} className="hover:text-gold">
                    T-{t.ref} · {t.state}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Handoff notes
          </h2>
          <textarea
            className="mt-2 w-full rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
            rows={3}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              updateShiftNotes(e.target.value)
            }}
            placeholder="What the next dispatcher needs to know…"
          />
        </section>
      </div>
    </div>
  )
}
