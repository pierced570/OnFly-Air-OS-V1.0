/**
 * Post-book passenger capture — name / weight / DOB can arrive after booking.
 */

import { useEffect, useState } from 'react'
import { NumericDraftInput } from '@/components/NumericDraftInput'
import {
  emptyTripPassenger,
  type TripPassenger,
} from '@/domain/tripPassengers'
import {
  setTripPassengers,
  type TripStoreRow,
} from '@/lib/tripStore'

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const labelCls = 'block text-xs font-medium text-muted'

type Props = {
  trip: TripStoreRow
  /** Compact for waterfall drawer. */
  compact?: boolean
}

export function TripPassengersPanel({ trip, compact = false }: Props) {
  const [rows, setRows] = useState<TripPassenger[]>(() =>
    trip.passengers?.length
      ? trip.passengers.map((p) => ({ ...p }))
      : [emptyTripPassenger()],
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setRows(
      trip.passengers?.length
        ? trip.passengers.map((p) => ({ ...p }))
        : [emptyTripPassenger()],
    )
  }, [trip.id, trip.passengers])

  function save() {
    setBusy(true)
    setMsg(null)
    try {
      setTripPassengers(trip.id, rows, 'dispatcher')
      setMsg('Passenger info saved')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={
        compact
          ? 'space-y-3 rounded-lg border border-border/60 bg-surface-2/40 p-3'
          : 'rounded-lg border border-border bg-surface p-4'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            className={
              compact
                ? 'text-[11px] uppercase tracking-wider text-gold'
                : 'text-xs uppercase tracking-wider text-muted'
            }
          >
            Passenger info
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Capture anytime — often arrives post booking. Name is enough to
            start; weight and DOB can follow.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save passengers'}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {rows.map((p, i) => (
          <div
            key={p.id}
            className="grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-[1fr_6rem_8rem_auto]"
          >
            <label className={labelCls}>
              Name
              <input
                value={p.name}
                onChange={(e) => {
                  const next = [...rows]
                  next[i] = { ...p, name: e.target.value }
                  setRows(next)
                }}
                className={inputCls}
                placeholder="Passenger name"
              />
            </label>
            <label className={labelCls}>
              Weight (lb)
              <NumericDraftInput
                integer
                blankZero
                min={0}
                className={`${inputCls} avionic`}
                value={p.weight_lbs === '' ? null : Number(p.weight_lbs)}
                onValueChange={(n) => {
                  const next = [...rows]
                  next[i] = {
                    ...p,
                    weight_lbs: n == null ? '' : n,
                  }
                  setRows(next)
                }}
                placeholder="—"
              />
            </label>
            <label className={labelCls}>
              DOB
              <input
                type="date"
                value={p.dob}
                onChange={(e) => {
                  const next = [...rows]
                  next[i] = { ...p, dob: e.target.value }
                  setRows(next)
                }}
                className={inputCls}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="mb-1 text-xs text-muted hover:text-late"
                disabled={rows.length <= 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="text-xs font-medium text-gold hover:text-gold-lt"
          onClick={() => setRows([...rows, emptyTripPassenger()])}
        >
          + Add passenger
        </button>
        {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      </div>
    </section>
  )
}
