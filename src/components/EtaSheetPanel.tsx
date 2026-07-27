/**
 * Dispatcher ETA sheet — one chain, editable assumptions, Zulu + local.
 */

import { useMemo, useState } from 'react'
import type { ChainLeg, EtaSource, ServicePattern } from '@/domain/etaChain'
import {
  deliveryDeltaMin,
  mileageBlock,
  projectedDeliveryUtc,
} from '@/domain/etaChain'
import { formatDurationMin, formatZuluLocal, parseDurationInput } from '@/domain/timeFmt'
import {
  evaluateTripOpsFlags,
  tripOpsSheetNotes,
} from '@/lib/applyTripOpsFlags'
import {
  editTripEtaDuration,
  resetTripEtaDuration,
  type TripStoreRow,
} from '@/lib/tripStore'

const SOURCE_STYLE: Record<EtaSource, string> = {
  assumed: 'border-amber-600/50 bg-amber-500/15 text-amber-200',
  quoted: 'border-sky-600/50 bg-sky-500/15 text-sky-200',
  manual: 'border-border bg-surface-2 text-muted',
  actual: 'border-green-700/50 bg-green-700/20 text-green-300',
}

function SourceBadge({ source }: { source: EtaSource }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${SOURCE_STYLE[source]}`}
    >
      {source}
    </span>
  )
}

function EstCell({
  leg,
  tripId,
  refUtc,
}: {
  leg: ChainLeg
  tripId: string
  refUtc: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(formatDurationMin(leg.duration_min))
  const tz = leg.to.tz || leg.from.tz || 'UTC'
  const disp = formatZuluLocal(leg.est_end, tz, { refUtcIso: refUtc })
  const editable =
    leg.source === 'assumed' ||
    leg.source === 'quoted' ||
    leg.source === 'manual'

  if (!editable || leg.source === 'actual') {
    return (
      <span className="avionic text-sm text-cream">
        {disp.display}
        {disp.dayChip ? (
          <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] text-muted">
            {disp.dayChip}
          </span>
        ) : null}
      </span>
    )
  }

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          const min = parseDurationInput(draft)
          if (min == null) return
          editTripEtaDuration(tripId, leg.seq, min, 'manual')
          setEditing(false)
        }}
      >
        <input
          autoFocus
          className="avionic w-20 rounded border border-gold/50 bg-black/40 px-2 py-1 text-sm text-cream"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="0:30"
        />
        <button type="submit" className="text-xs text-gold">
          Set
        </button>
        <button
          type="button"
          className="text-xs text-muted"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </form>
    )
  }

  return (
    <div className="group relative">
      <button
        type="button"
        className="avionic flex items-center gap-1 rounded border border-amber-600/40 bg-amber-500/10 px-2 py-1 text-left text-sm text-cream hover:border-gold"
        onClick={() => {
          setDraft(formatDurationMin(leg.duration_min))
          setEditing(true)
        }}
        title="Edit assumption"
      >
        <span>{disp.display}</span>
        <span className="text-[10px] text-amber-300/80">
          {formatDurationMin(leg.duration_min)} ✎
        </span>
      </button>
      <button
        type="button"
        className="absolute -top-5 right-0 hidden text-[10px] text-muted group-hover:block hover:text-gold"
        onClick={() => resetTripEtaDuration(tripId, leg.seq)}
      >
        Reset to default
      </button>
    </div>
  )
}

export function EtaSheetPanel({ trip }: { trip: TripStoreRow }) {
  const chain = trip.eta_chain ?? []
  if (!chain.length) {
    return (
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">ETA sheet</h2>
        <p className="mt-3 text-sm text-muted">
          No trip chain yet — estimate or book to attach the ETA spine.
        </p>
      </section>
    )
  }

  const refUtc = chain[0]!.est_start
  const promised = trip.promised_delivery ?? chain[chain.length - 1]!.est_end
  const projected = projectedDeliveryUtc(chain)!
  const delta = deliveryDeltaMin(projected, promised)
  const lastTz = chain[chain.length - 1]!.to.tz || 'UTC'
  const promisedDisp = formatZuluLocal(promised, lastTz).display
  const projectedDisp = formatZuluLocal(projected, lastTz).display
  const miles = mileageBlock(chain)
  const selected =
    trip.offers.find((o) => o.state === 'selected') ??
    trip.offers.find((o) => o.state === 'quoted')
  const pattern: ServicePattern | null = trip.service_pattern
  const opsFlags = useMemo(() => evaluateTripOpsFlags(trip), [trip])
  const opsNotes = useMemo(
    () => tripOpsSheetNotes(trip, opsFlags),
    [trip, opsFlags],
  )

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-gold">ETA sheet</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {pattern && (
              <span className="rounded border border-gold/40 px-2 py-0.5 text-gold">
                {pattern}
              </span>
            )}
            {(selected?.tail || trip.quick?.tail) && (
              <span className="avionic text-muted">
                {selected?.tail || trip.quick?.tail}
                {selected?.operator_name || trip.quick?.operator_name
                  ? ` · ${selected?.operator_name || trip.quick?.operator_name}`
                  : ''}
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Promised
          </div>
          <div className="avionic text-cream">{promisedDisp}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-muted">
            Projected
          </div>
          <div className="avionic text-cream">{projectedDisp}</div>
          {delta != null && (
            <div
              className={`mt-1 avionic text-sm ${
                delta > 0 ? 'text-late' : delta < 0 ? 'text-green-400' : 'text-muted'
              }`}
            >
              {delta > 0 ? `+${delta}m late` : delta < 0 ? `${delta}m early` : 'on plan'}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
              <th className="py-2 pr-2 font-normal">Event</th>
              <th className="py-2 pr-2 font-normal">EST</th>
              <th className="py-2 pr-2 font-normal">Actual</th>
              <th className="py-2 pr-2 font-normal">Source</th>
              <th className="py-2 font-normal">Slack</th>
            </tr>
          </thead>
          <tbody>
            {chain.map((leg) => {
              const actTz = leg.to.tz || leg.from.tz || 'UTC'
              const actualIso = leg.actual_end ?? leg.actual_start
              const actualDisp = actualIso
                ? formatZuluLocal(actualIso, actTz, { refUtcIso: refUtc }).display
                : null
              return (
                <tr key={leg.seq} className="border-b border-border/40 align-top">
                  <td className="py-2 pr-2">
                    <div className="text-cream">{leg.event || leg.label}</div>
                    <div className="avionic text-[10px] text-muted">
                      {leg.from.icao || '—'}→{leg.to.icao || '—'}
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <EstCell leg={leg} tripId={trip.id} refUtc={refUtc} />
                  </td>
                  <td className="py-2 pr-2">
                    {actualDisp ? (
                      <span className="avionic text-green-300">{actualDisp}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <SourceBadge source={leg.source} />
                  </td>
                  <td className="avionic py-2 text-muted">
                    {leg.slack_min != null ? `${leg.slack_min}m` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 border-t border-border/50 pt-3">
        <h3 className="text-[11px] uppercase tracking-wider text-muted">
          Mileage + times
        </h3>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {miles.segments.map((s) => (
            <li key={`${s.seq}-${s.kind}`} className="flex justify-between gap-4">
              <span>{s.label}</span>
              <span className="avionic text-cream">
                {s.distance} {s.unit} · {formatDurationMin(s.duration_min)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-4 avionic text-xs text-cream">
          <span>Truck {miles.total_truck_mi} mi</span>
          <span>Air {miles.total_air_nm} NM</span>
          <span>Elapsed {formatDurationMin(miles.total_elapsed_min)}</span>
        </div>
      </div>

      {opsNotes.length > 0 ? (
        <div className="mt-4 border-t border-border/50 pt-3">
          <h3 className="text-[11px] uppercase tracking-wider text-gold">
            Ground · forklift · after-hours · wx
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs text-cream/90">
            {opsNotes.map((n) => (
              <li
                key={n.slice(0, 48)}
                className={
                  /IFR|LIFR|After-hours|Forklift required|capacity/i.test(n)
                    ? 'text-late'
                    : 'text-muted'
                }
              >
                {n}
              </li>
            ))}
          </ul>
          {opsFlags.length > 0 ? (
            <p className="mt-2 text-[11px] text-muted">
              Flagged for Board / NEEDS-INFO — confirm before booking.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
