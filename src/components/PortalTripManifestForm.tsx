/**
 * Client portal — passenger + cargo details capture (cream theme).
 * First / last / DOB / weight + grey cargo dims & total weight.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { NumericDraftInput } from '@/components/NumericDraftInput'
import {
  composePassengerName,
  emptyTripPassenger,
  emptyTripPortalCargoDetails,
  type TripPassenger,
  type TripPortalCargoDetails,
} from '@/domain/tripPassengers'
import {
  flushPersistTrip,
  getTrip,
  listTripsStable,
  setTripPassengers,
  setTripPortalCargo,
  subscribeTrips,
} from '@/lib/tripStore'

const inputCls =
  'mt-1 w-full rounded-md border border-[#D4CFC0] bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-[#C9A227]'
const labelCls = 'block text-xs font-medium text-[#6B6560]'

type Props = {
  tripId: string
}

export function PortalTripManifestForm({ tripId }: Props) {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = getTrip(tripId)

  const [paxRows, setPaxRows] = useState<TripPassenger[]>(() =>
    trip?.passengers?.length
      ? trip.passengers.map((p) => ({ ...p }))
      : [emptyTripPassenger()],
  )
  const [cargo, setCargo] = useState<TripPortalCargoDetails>(() =>
    trip?.portal_cargo
      ? { ...trip.portal_cargo }
      : emptyTripPortalCargoDetails(),
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const t = getTrip(tripId)
    setPaxRows(
      t?.passengers?.length
        ? t.passengers.map((p) => ({ ...p }))
        : [emptyTripPassenger()],
    )
    setCargo(
      t?.portal_cargo
        ? { ...t.portal_cargo }
        : emptyTripPortalCargoDetails(),
    )
  }, [tripId, trip?.passengers, trip?.portal_cargo])

  if (!trip) return null

  function updatePax(i: number, patch: Partial<TripPassenger>) {
    setPaxRows((rows) => {
      const next = [...rows]
      const cur = next[i]!
      const merged = { ...cur, ...patch }
      merged.name = composePassengerName(merged.first_name, merged.last_name)
      next[i] = merged
      return next
    })
  }

  async function save() {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      setTripPassengers(tripId, paxRows, 'client')
      setTripPortalCargo(tripId, cargo, 'client')
      await flushPersistTrip(tripId)
      setMsg('Sent — dispatch can see your updates')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-[#E5DFD0] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C9A227]">
            Passenger &amp; cargo details
          </h2>
          <p className="mt-1 text-xs text-[#6B6560]">
            Add anytime — often after booking. First and last name are enough to
            start; weight and DOB can follow.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-md bg-[#C9A227] px-3 py-2 text-xs font-semibold text-[#0C0C0E] disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send info to OnFly'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A8680]">
          Passengers
        </div>
        {paxRows.map((p, i) => (
          <div
            key={p.id}
            className="grid gap-2 border-t border-[#E5DFD0] pt-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_6rem_8rem_auto]"
          >
            <label className={labelCls}>
              First name
              <input
                value={p.first_name}
                onChange={(e) => updatePax(i, { first_name: e.target.value })}
                className={inputCls}
                placeholder="First"
                autoComplete="given-name"
              />
            </label>
            <label className={labelCls}>
              Last name
              <input
                value={p.last_name}
                onChange={(e) => updatePax(i, { last_name: e.target.value })}
                className={inputCls}
                placeholder="Last"
                autoComplete="family-name"
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
                onValueChange={(n) =>
                  updatePax(i, { weight_lbs: n == null ? '' : n })
                }
                placeholder="—"
              />
            </label>
            <label className={labelCls}>
              DOB
              <input
                type="date"
                value={p.dob}
                onChange={(e) => updatePax(i, { dob: e.target.value })}
                className={inputCls}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="mb-1 text-xs text-[#8A8680] hover:text-[#C0392B]"
                disabled={paxRows.length <= 1}
                onClick={() => setPaxRows((rows) => rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="text-xs font-medium text-[#C9A227] hover:text-[#E3B341]"
          onClick={() => setPaxRows((rows) => [...rows, emptyTripPassenger()])}
        >
          + Add passenger
        </button>
      </div>

      <div className="rounded-lg border border-[#E5DFD0] bg-[#F0EBE0] p-3.5 sm:p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B6560]">
          Cargo details
        </div>
        <p className="mt-1 text-[11px] text-[#8A8680]">
          Dims and total weight for this shipment.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem]">
          <label className={labelCls}>
            Dims
            <input
              value={cargo.dims}
              onChange={(e) =>
                setCargo((c) => ({ ...c, dims: e.target.value }))
              }
              className={inputCls}
              placeholder="e.g. 48 × 40 × 36 in · 2 pcs"
            />
          </label>
          <label className={labelCls}>
            Total weight (lb)
            <NumericDraftInput
              integer
              blankZero
              min={0}
              className={`${inputCls} avionic`}
              value={
                cargo.total_weight_lbs === ''
                  ? null
                  : Number(cargo.total_weight_lbs)
              }
              onValueChange={(n) =>
                setCargo((c) => ({
                  ...c,
                  total_weight_lbs: n == null ? '' : n,
                }))
              }
              placeholder="—"
            />
          </label>
        </div>
      </div>

      {err ? <p className="text-xs text-[#C0392B]">{err}</p> : null}
      {msg ? <p className="text-xs text-[#2E7D32]">{msg}</p> : null}
    </section>
  )
}
