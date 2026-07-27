/**
 * Live client tracking — ETA chain, quote milestones, aircraft position.
 * Cream client theme. Never shows cost, margin, or operator identity.
 */

import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'
import {
  getPortalTrackRow,
  resolvePortalTrackTripId,
} from '@/lib/portalTrackStore'
import { canPersist, db, safeQuery } from '@/lib/db/client'
import { createAdsbAdapter, type AdsbPosition } from '@/adapters/adsb'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
  type PortalTrackingView,
} from '@/domain/portalTracking'
import { formatClientLocal } from '@/domain/timeFmt'
import { BrandLockup } from '@/components/BrandLockup'

const REFRESH_MS = 30_000

function statusChipClass(state: string): string {
  if (state === 'delivered' || state === 'invoiced' || state === 'closed') {
    return 'border-[#2E7D32]/40 bg-[#2E7D32]/10 text-[#2E7D32]'
  }
  if (state === 'in_progress' || state === 'booked') {
    return 'border-gold/50 bg-gold/10 text-[#8a7010]'
  }
  if (state === 'cancelled' || state === 'lost') {
    return 'border-[#C0392B]/40 bg-[#C0392B]/10 text-[#C0392B]'
  }
  return 'border-border bg-white text-muted'
}

function AircraftCard({ view }: { view: PortalTrackingView }) {
  const a = view.aircraft
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="border-b border-border/60 px-5 py-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Aircraft position
        </h2>
      </div>
      <div className="relative min-h-[140px] bg-gradient-to-br from-[#1a1a1c] via-[#0C0C0E] to-[#2a2418] px-5 py-6 text-[#F7F2E3]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, #C9A227 0%, transparent 45%), radial-gradient(circle at 80% 70%, #C9A227 0%, transparent 40%)',
          }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="avionic text-lg tracking-wide">
                {a.tail !== '—' ? a.tail : 'Tail TBD'}
                {view.aircraftType ? (
                  <span className="ml-2 text-sm text-[#F7F2E3]/70">
                    {view.aircraftType}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-[#F7F2E3]/85">{a.summary}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-[#C9A227]/80">
                {a.source === 'adsb'
                  ? 'Live ADS-B'
                  : a.source === 'eta'
                    ? 'From live ETA chain'
                    : 'Awaiting position'}
                {a.seenAt
                  ? ` · ${formatClientLocal(a.seenAt, 'UTC').zulu}`
                  : ''}
              </p>
            </div>
            <div className="text-right avionic text-xs text-[#F7F2E3]/70">
              {a.fromIcao && a.toIcao ? (
                <div>
                  {a.fromIcao} → {a.toIcao}
                </div>
              ) : null}
              {a.altFt != null ? <div>{a.altFt} ft</div> : null}
              {a.gsKts != null ? <div>{a.gsKts} kts</div> : null}
              {a.lat != null && a.lon != null ? (
                <div>
                  {a.lat.toFixed(2)}° / {a.lon.toFixed(2)}°
                </div>
              ) : null}
            </div>
          </div>
          {a.progressPct != null && (
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-[11px] text-[#F7F2E3]/60">
                <span>{a.fromIcao || 'Origin'}</span>
                <span>
                  {a.progressPct}%
                  {a.nmRemaining != null ? ` · ${a.nmRemaining} NM left` : ''}
                </span>
                <span>{a.toIcao || 'Dest'}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#C9A227] transition-[width] duration-700"
                  style={{ width: `${a.progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="px-5 py-2 text-[11px] text-muted">
        Operated by {view.carrierLabel}. Carrier name withheld on this link.
      </p>
    </section>
  )
}

function MilestoneStrip({ view }: { view: PortalTrackingView }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Trip progress
        </h2>
        <span className="text-xs text-gold">Next · {view.nextMilestoneLabel}</span>
      </div>
      <ol className="mt-4 flex gap-1 overflow-x-auto pb-1">
        {view.milestones.map((m) => (
          <li
            key={m.kind}
            className={[
              'min-w-[5.5rem] flex-1 rounded-md border px-2 py-2 text-center',
              m.done
                ? 'border-[#2E7D32]/35 bg-[#2E7D32]/8'
                : m.current
                  ? 'border-gold/50 bg-gold/10'
                  : 'border-border/70 bg-[#F7F2E3]/40',
            ].join(' ')}
          >
            <div
              className={[
                'text-[10px] font-medium leading-tight',
                m.done ? 'text-[#2E7D32]' : m.current ? 'text-[#8a7010]' : 'text-muted',
              ].join(' ')}
            >
              {m.label}
            </div>
            <div className="avionic mt-1 text-[10px] text-muted">
              {m.at
                ? formatClientLocal(m.at, 'UTC').local.replace(/\s.*/, '')
                : '—'}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function TrackingBody({ view }: { view: PortalTrackingView }) {
  const delta = view.deltaMin
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <div className="flex items-center gap-3">
          <BrandLockup showTagline={false} />
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            Live tracking
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              T-{view.ref}
            </h1>
            <p className="mt-1 avionic text-sm text-muted">{view.lane}</p>
            <p className="mt-0.5 text-sm text-muted">
              {view.payloadSummary}
              {view.pattern ? ` · ${view.pattern}` : ''}
              {view.readyLabel ? ` · ready ${view.readyLabel}` : ''}
            </p>
          </div>
          <div
            className={`rounded-md border px-3 py-1.5 text-xs uppercase tracking-wider ${statusChipClass(view.state)}`}
          >
            {view.state.replace(/_/g, ' ')}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Promised delivery
          </div>
          <div className="avionic mt-1 text-lg text-ink">
            {view.promisedDisplay ?? '—'}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Current ETA
          </div>
          <div className="avionic mt-1 text-lg text-ink">
            {view.projectedDisplay ?? '—'}
          </div>
          {delta != null && delta !== 0 && (
            <div
              className={`mt-0.5 text-xs ${
                delta > 0 ? 'text-[#C0392B]' : 'text-[#2E7D32]'
              }`}
            >
              {delta > 0 ? `+${delta}m vs promised` : `${delta}m early`}
            </div>
          )}
        </div>
      </section>

      <MilestoneStrip view={view} />
      <AircraftCard view={view} />

      <section className="rounded-lg border border-border bg-white p-5">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Live ETA sheet
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          Stop-local times with zone · same chain dispatch uses
        </p>
        {view.etaRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Timeline appears once the trip is quoted / booked.
          </p>
        ) : (
          <ol className="mt-4 space-y-0">
            {view.etaRows.map((row) => (
              <li
                key={row.seq}
                className="flex gap-3 border-b border-border/50 py-3 last:border-0"
              >
                <div
                  className={[
                    'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                    row.status === 'done'
                      ? 'bg-[#2E7D32]'
                      : row.status === 'active'
                        ? 'bg-gold'
                        : 'bg-border',
                  ].join(' ')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium text-ink">{row.event}</div>
                    <span className="text-[10px] uppercase tracking-wide text-muted">
                      {row.status}
                    </span>
                  </div>
                  <div className="avionic text-xs text-muted">
                    {row.fromLabel} → {row.toLabel}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span>
                      <span className="text-[10px] uppercase text-muted">Est </span>
                      <span className="avionic">{row.estDisplay}</span>
                    </span>
                    {row.actualDisplay ? (
                      <span className="text-[#2E7D32]">
                        <span className="text-[10px] uppercase">Act </span>
                        <span className="avionic">{row.actualDisplay}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-lg border border-border bg-white p-5">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Activity
        </h2>
        {view.timeline.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Quote approval, booking, and flight updates appear here live.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {view.timeline.map((u, i) => (
              <li
                key={`${u.at}-${u.label}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-2 text-sm last:border-0"
              >
                <div>
                  <div className="font-medium">{u.label}</div>
                  {u.detail ? (
                    <div className="text-xs text-muted">{u.detail}</div>
                  ) : null}
                </div>
                <div className="avionic text-xs text-muted">
                  {formatClientLocal(u.at, 'UTC').display}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.documents.length > 0 && (
        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Documents
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {view.documents.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-baseline justify-between gap-2"
              >
                <span>{d.title}</span>
                <span className="text-xs uppercase text-muted">{d.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-[11px] text-muted">
        Auto-refreshes every 30s · times shown stop-local with zone
      </p>
    </div>
  )
}

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

function useClock(ms = REFRESH_MS): string {
  const [now, setNow] = useState(() => new Date().toISOString())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date().toISOString()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

function viewFromTrip(
  trip: TripStoreRow,
  adsb: AdsbPosition | null,
  nowIso: string,
): PortalTrackingView {
  return buildPortalTrackingView(tripToTrackingInput(trip), { adsb, nowIso })
}

/** Magic-link tracker `/portal/track/:token` */
export default function PortalTrackPage() {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const nowIso = useClock()
  const { token } = useParams()
  const [tripId, setTripId] = useState<string | null>(() =>
    token ? getPortalTrackRow(token)?.tripId ?? null : null,
  )
  const [resolving, setResolving] = useState(Boolean(token && !tripId))
  const [remoteTrip, setRemoteTrip] = useState<TripStoreRow | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setResolving(true)
    void (async () => {
      const id = await resolvePortalTrackTripId(token)
      if (cancelled) return
      setTripId(id)
      if (id && !getTrip(id) && canPersist()) {
        const [tripRows, legRows] = await Promise.all([
          safeQuery<Record<string, unknown>[]>('portal_trip_by_token', () =>
            db().rpc('portal_trip_by_token', { p_token: token }),
          ),
          safeQuery<Record<string, unknown>[]>('portal_legs_by_token', () =>
            db().rpc('portal_legs_by_token', { p_token: token }),
          ),
        ])
        const tripRow = Array.isArray(tripRows) ? tripRows[0] : null
        if (cancelled || !tripRow) {
          setResolving(false)
          return
        }
        const legs = Array.isArray(legRows)
          ? legRows.map((l, i) => ({
              id: String(l.id),
              seq: Number(l.seq ?? i + 1),
              label: String(l.label || l.type || `Leg ${i + 1}`),
              status: String(l.status || 'pending') as TripStoreRow['legs'][0]['status'],
              origin: (l.from_ref as { icao?: string } | null)?.icao,
              dest: (l.to_ref as { icao?: string } | null)?.icao,
              est_start: l.est_start ? String(l.est_start) : null,
              est_end: l.est_end ? String(l.est_end) : null,
              actual_start: l.actual_start ? String(l.actual_start) : null,
              actual_end: l.actual_end ? String(l.actual_end) : null,
              party: 'dispatcher',
              type: String(l.type || ''),
              one_tap_token: '',
            }))
          : []
        setRemoteTrip({
          id: String(tripRow.id),
          ref: Number(tripRow.ref ?? 0),
          code: '',
          state: tripRow.state as TripStoreRow['state'],
          lane: String(tripRow.lane_label || ''),
          payload_summary: String(tripRow.payload_summary || ''),
          ready_label: String(tripRow.ready_label || ''),
          candidates: [],
          offers: [],
          events: [],
          eta_chain: [],
          service_pattern: null,
          promised_delivery: null,
          eta_defaults_snapshot: null,
          thread_number: null,
          thread_disbanded_at: null,
          legs,
          participants: [],
          thread: [],
          documents: [],
          invoice: null,
        })
      }
      setResolving(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const trip = useMemo(() => {
    if (tripId) {
      const local = getTrip(tripId)
      if (local) return local
    }
    return remoteTrip
  }, [tripId, remoteTrip, nowIso])

  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail)
  const view = useMemo(() => {
    if (!trip) return null
    return viewFromTrip(trip, adsb, nowIso)
  }, [trip, adsb, nowIso])

  if (resolving) {
    return (
      <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
        <p className="text-sm text-muted">Loading live tracking…</p>
      </div>
    )
  }

  if (!view) {
    return (
      <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
        <div className="mx-auto max-w-xl space-y-3">
          <h1 className="text-2xl font-semibold">Tracking link expired</h1>
          <p className="text-sm text-muted">
            This magic link isn’t recognized. Ask dispatch for a fresh link.
          </p>
          <Link
            to="/portal"
            className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
          >
            Back to portal
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream px-4 py-8 text-ink sm:px-6" data-theme="client">
      <TrackingBody view={view} />
      <div className="mx-auto mt-8 max-w-3xl">
        <Link
          to="/portal"
          className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
        >
          Back to portal
        </Link>
      </div>
    </div>
  )
}

/** Session tracker `/portal/trips/:id` — same live view for signed-in clients. */
export function PortalTripTrackPage() {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const nowIso = useClock()
  const { id } = useParams()
  const [remoteTrip, setRemoteTrip] = useState<TripStoreRow | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    if (getTrip(id)) {
      setRemoteTrip(null)
      return
    }
    if (!canPersist()) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const [tripRows, legRows] = await Promise.all([
        safeQuery<Record<string, unknown>[]>('portal_trips.by_id', () =>
          db()
            .from('portal_trips')
            .select(
              'id,ref,state,lane_label,payload_summary,ready_label,promised_delivery,service_pattern',
            )
            .eq('id', id)
            .limit(1),
        ),
        safeQuery<Record<string, unknown>[]>('portal_legs.by_trip', () =>
          db().from('portal_legs').select('*').eq('trip_id', id).order('seq'),
        ),
      ])
      if (cancelled) return
      const tripRow = Array.isArray(tripRows) ? tripRows[0] : null
      if (!tripRow) {
        setLoading(false)
        return
      }
      const legs = Array.isArray(legRows)
        ? legRows.map((l, i) => ({
            id: String(l.id),
            seq: Number(l.seq ?? i + 1),
            label: String(l.label || l.type || `Leg ${i + 1}`),
            status: String(l.status || 'pending') as TripStoreRow['legs'][0]['status'],
            origin: (l.from_ref as { icao?: string } | null)?.icao,
            dest: (l.to_ref as { icao?: string } | null)?.icao,
            est_start: l.est_start ? String(l.est_start) : null,
            est_end: l.est_end ? String(l.est_end) : null,
            actual_start: l.actual_start ? String(l.actual_start) : null,
            actual_end: l.actual_end ? String(l.actual_end) : null,
            party: 'dispatcher',
            type: String(l.type || ''),
            one_tap_token: '',
          }))
        : []
      setRemoteTrip({
        id: String(tripRow.id),
        ref: Number(tripRow.ref ?? 0),
        code: '',
        state: tripRow.state as TripStoreRow['state'],
        lane: String(tripRow.lane_label || ''),
        payload_summary: String(tripRow.payload_summary || ''),
        ready_label: String(tripRow.ready_label || ''),
        candidates: [],
        offers: [],
        events: [],
        eta_chain: [],
        service_pattern: (tripRow.service_pattern as TripStoreRow['service_pattern']) ?? null,
        promised_delivery: tripRow.promised_delivery
          ? String(tripRow.promised_delivery)
          : null,
        eta_defaults_snapshot: null,
        thread_number: null,
        thread_disbanded_at: null,
        legs,
        participants: [],
        thread: [],
        documents: [],
        invoice: null,
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const trip = (id ? getTrip(id) : null) ?? remoteTrip
  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail)
  const view = trip ? viewFromTrip(trip, adsb, nowIso) : null

  if (loading) {
    return (
      <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
        <p className="text-sm text-muted">Loading live tracking…</p>
      </div>
    )
  }

  if (!view) {
    return (
      <div className="min-h-screen bg-cream p-6 text-ink" data-theme="client">
        <h1 className="text-xl font-semibold">Trip not found</h1>
        <p className="mt-2 text-sm text-muted">
          Open a trip from your portal home, or use the magic tracking link from
          email.
        </p>
        <Link to="/portal" className="mt-4 inline-block text-gold">
          ← Portal
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream px-4 py-8 text-ink sm:px-6" data-theme="client">
      <TrackingBody view={view} />
      <div className="mx-auto mt-8 max-w-3xl">
        <Link
          to="/portal"
          className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
        >
          Back to portal
        </Link>
      </div>
    </div>
  )
}
