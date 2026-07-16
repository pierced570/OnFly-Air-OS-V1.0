import { useMemo, useState } from 'react'
import {
  ASAP_MAX_HOURS,
  emptyTripRequestDraft,
  newLeg,
  validateTripRequest,
  type TripRequestDraft,
  type TripLegDraft,
  type PaxRow,
} from '@/domain/tripRequest'
import { DEMO_CLIENTS } from '@/lib/requestStore'

type Variant = 'portal' | 'dispatch'

type Props = {
  variant: Variant
  initial?: Partial<TripRequestDraft>
  submitLabel?: string
  onSubmit: (draft: TripRequestDraft) => void | Promise<void>
}

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-gold'
const labelCls = 'block text-xs font-medium text-muted'
const segBtn = (on: boolean) =>
  [
    'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    on ? 'bg-gold text-ink' : 'bg-surface-2 text-muted hover:text-[var(--text)]',
  ].join(' ')

function updateLeg(
  legs: TripLegDraft[],
  id: string,
  patch: Partial<TripLegDraft>,
): TripLegDraft[] {
  return legs.map((l) => (l.id === id ? { ...l, ...patch } : l))
}

export function TripRequestForm({
  variant,
  initial,
  submitLabel,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<TripRequestDraft>(() => ({
    ...emptyTripRequestDraft(),
    ...initial,
    legs: initial?.legs?.length ? initial.legs : emptyTripRequestDraft().legs,
  }))
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [busy, setBusy] = useState(false)
  const [issues, setIssues] = useState<string[]>([])

  const needsAddresses =
    draft.service_mode === 'd2d' || draft.service_mode === 'mixed'

  const paxCount = draft.pax.length

  const clientOptions = useMemo(() => DEMO_CLIENTS, [])

  function setPaxCount(n: number) {
    const count = Math.max(0, Math.min(20, n))
    setDraft((d) => {
      const next: PaxRow[] = []
      for (let i = 0; i < count; i++) {
        next.push(d.pax[i] ?? { name: '', weight_lbs: '', dob: '' })
      }
      return { ...d, cargo_only: count === 0 ? d.cargo_only : false, pax: next }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = { ...draft }
    if (variant === 'dispatch' && !next.email.trim() && next.client_id) {
      const hit = clientOptions.find((c) => c.id === next.client_id)
      if (hit) next.email = hit.email
    }
    const errs = validateTripRequest(next, {
      requireEmail: variant === 'portal',
      requireClient: variant === 'dispatch',
    })
    if (errs.length) {
      setIssues(errs.map((i) => i.message))
      return
    }
    setIssues([])
    setBusy(true)
    try {
      await onSubmit(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      {/* Client / email */}
      {variant === 'portal' ? (
        <section>
          <label className={labelCls}>
            Your email
            <input
              type="email"
              required
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="you@company.com"
              className={inputCls}
            />
          </label>
          <p className="mt-1 text-xs text-muted">
            We’ll send status updates and the estimate to this address.
          </p>
        </section>
      ) : (
        <section>
          <div className="flex items-end gap-2">
            <label className={`${labelCls} flex-1`}>
              Client
              <select
                value={draft.client_id ?? ''}
                onChange={(e) => {
                  const id = e.target.value
                  const hit = clientOptions.find((c) => c.id === id)
                  setDraft((d) => ({
                    ...d,
                    client_id: id || null,
                    client_name: hit?.name ?? d.client_name,
                    email: hit?.email ?? d.email,
                  }))
                  setShowNewClient(false)
                }}
                className={inputCls}
              >
                <option value="">Select a client…</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {draft.client_id?.startsWith('new-') && draft.client_name && (
                  <option value={draft.client_id}>{draft.client_name}</option>
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowNewClient((v) => !v)}
              className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-gold hover:border-gold"
            >
              + New
            </button>
          </div>
          {showNewClient && (
            <div className="mt-2 flex gap-2">
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="New client name"
                className={inputCls}
              />
              <button
                type="button"
                className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
                onClick={() => {
                  const name = newClientName.trim()
                  if (!name) return
                  const id = `new-${crypto.randomUUID().slice(0, 8)}`
                  setDraft((d) => ({
                    ...d,
                    client_id: id,
                    client_name: name,
                  }))
                  setShowNewClient(false)
                  setNewClientName('')
                }}
              >
                Add
              </button>
            </div>
          )}
          <label className={`${labelCls} mt-3`}>
            Requester email
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="requester@client.com"
              className={inputCls}
            />
          </label>
        </section>
      )}

      {/* Service mode */}
      <section>
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Service type
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(
            [
              ['a2a', 'Airport → Airport'],
              ['d2d', 'Door → Door'],
              ['mixed', 'Combination'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, service_mode: id }))}
              className={segBtn(draft.service_mode === id)}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.service_mode === 'a2a' && (
          <p className="mt-2 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-[var(--text)]">
            Airport-to-airport: FBO selection happens in step two with dispatch.
            Enter ICAO codes for each leg now.
          </p>
        )}
        {draft.service_mode === 'd2d' && (
          <p className="mt-2 text-xs text-muted">
            Door-to-door: include pickup and delivery addresses (or mark TBD).
          </p>
        )}
        {draft.service_mode === 'mixed' && (
          <p className="mt-2 text-xs text-muted">
            Combination: ICAOs plus door addresses where ground transfer applies.
            FBOs for pure air segments are sourced in step two.
          </p>
        )}
      </section>

      {/* Legs */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              className={segBtn(draft.timing === 'asap')}
              onClick={() => setDraft((d) => ({ ...d, timing: 'asap' }))}
            >
              ASAP
            </button>
            <button
              type="button"
              className={segBtn(draft.timing === 'scheduled')}
              onClick={() => setDraft((d) => ({ ...d, timing: 'scheduled' }))}
            >
              Scheduled
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                legs: [
                  ...d.legs,
                  newLeg({
                    origin_icao: d.legs[d.legs.length - 1]?.dest_icao ?? '',
                  }),
                ],
              }))
            }
            className="text-sm font-medium text-gold hover:text-gold-lt"
          >
            + Add Stop
          </button>
        </div>
        {draft.timing === 'asap' && (
          <p className="mb-3 text-xs text-muted">
            ASAP means ready within {ASAP_MAX_HOURS} hours. We’ll target the next
            available aircraft.
          </p>
        )}

        <div className="space-y-4">
          {draft.legs.map((leg, idx) => (
            <div
              key={leg.id}
              className="relative rounded-lg border border-border bg-surface-2 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-[var(--text)]">
                  Leg {idx + 1}
                </div>
                {draft.legs.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove leg ${idx + 1}`}
                    className="text-muted hover:text-late"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        legs: d.legs.filter((l) => l.id !== leg.id),
                      }))
                    }
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Origin (ICAO)
                  <input
                    value={leg.origin_icao}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        legs: updateLeg(d.legs, leg.id, {
                          origin_icao: e.target.value.toUpperCase(),
                        }),
                      }))
                    }
                    placeholder="KJFK"
                    className={`${inputCls} avionic uppercase`}
                  />
                </label>
                <label className={labelCls}>
                  Destination (ICAO)
                  <input
                    value={leg.dest_icao}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        legs: updateLeg(d.legs, leg.id, {
                          dest_icao: e.target.value.toUpperCase(),
                        }),
                      }))
                    }
                    placeholder="KLAX"
                    className={`${inputCls} avionic uppercase`}
                  />
                </label>
                {draft.timing === 'scheduled' && (
                  <>
                    <label className={labelCls}>
                      Date
                      <input
                        type="date"
                        value={leg.date}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            legs: updateLeg(d.legs, leg.id, {
                              date: e.target.value,
                            }),
                          }))
                        }
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      Pickup time
                      <input
                        type="time"
                        value={leg.pickup_time}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            legs: updateLeg(d.legs, leg.id, {
                              pickup_time: e.target.value,
                            }),
                          }))
                        }
                        className={inputCls}
                      />
                    </label>
                  </>
                )}
              </div>

              {needsAddresses && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>
                      Pickup address
                      <input
                        value={leg.pickup_address}
                        disabled={leg.pickup_tbd}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            legs: updateLeg(d.legs, leg.id, {
                              pickup_address: e.target.value,
                            }),
                          }))
                        }
                        placeholder="FBO or address…"
                        className={inputCls}
                      />
                    </label>
                    <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={leg.pickup_tbd}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            legs: updateLeg(d.legs, leg.id, {
                              pickup_tbd: e.target.checked,
                              pickup_address: e.target.checked
                                ? ''
                                : leg.pickup_address,
                            }),
                          }))
                        }
                      />
                      TBD
                    </label>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Dropoff address
                      <input
                        value={leg.dropoff_address}
                        disabled={leg.dropoff_tbd}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            legs: updateLeg(d.legs, leg.id, {
                              dropoff_address: e.target.value,
                            }),
                          }))
                        }
                        placeholder="FBO or address…"
                        className={inputCls}
                      />
                    </label>
                    <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={leg.dropoff_tbd}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            legs: updateLeg(d.legs, leg.id, {
                              dropoff_tbd: e.target.checked,
                              dropoff_address: e.target.checked
                                ? ''
                                : leg.dropoff_address,
                            }),
                          }))
                        }
                      />
                      TBD
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <span>Roundtrip</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.direction === 'round_trip'}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  direction:
                    d.direction === 'round_trip' ? 'one_way' : 'round_trip',
                }))
              }
              className={[
                'relative h-6 w-11 rounded-full transition-colors',
                draft.direction === 'round_trip' ? 'bg-gold' : 'bg-border',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-0.5 h-5 w-5 rounded-full bg-surface-2 shadow transition-transform',
                  draft.direction === 'round_trip'
                    ? 'translate-x-5'
                    : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </label>
          {draft.direction === 'round_trip' && (
            <label className={`${labelCls} w-40`}>
              Hours on ground
              <input
                type="number"
                min={1}
                step={0.5}
                value={draft.hours_on_ground}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    hours_on_ground:
                      e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
                className={inputCls}
              />
            </label>
          )}
        </div>
      </section>

      {/* Special flags */}
      <section>
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Special flags
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-[var(--text)]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.hazmat}
              onChange={(e) =>
                setDraft((d) => ({ ...d, hazmat: e.target.checked }))
              }
            />
            <span className="text-late">⚠</span> Hazmat
          </label>
        </div>
        {draft.hazmat && (
          <p className="mt-2 text-xs text-late">
            Hazmat flagged — dangerous-goods note will be attached for dispatch
            review.
          </p>
        )}
      </section>

      {/* Cargo / pax */}
      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            checked={draft.cargo_only}
            onChange={(e) => {
              const cargo_only = e.target.checked
              setDraft((d) => ({
                ...d,
                cargo_only,
                pax: cargo_only ? [] : d.pax.length ? d.pax : [{ name: '', weight_lbs: '', dob: '' }],
              }))
            }}
          />
          Cargo only (no passengers)
        </label>

        {!draft.cargo_only && (
          <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
            <label className={`${labelCls} max-w-[8rem]`}>
              Pax count
              <input
                type="number"
                min={1}
                max={20}
                value={paxCount || 1}
                onChange={(e) => setPaxCount(Number(e.target.value) || 1)}
                className={inputCls}
              />
            </label>
            {draft.pax.map((p, i) => (
              <div
                key={i}
                className="grid gap-2 border-t border-border pt-3 sm:grid-cols-3"
              >
                <label className={labelCls}>
                  Name
                  <input
                    value={p.name}
                    onChange={(e) =>
                      setDraft((d) => {
                        const pax = [...d.pax]
                        pax[i] = { ...pax[i]!, name: e.target.value }
                        return { ...d, pax }
                      })
                    }
                    className={inputCls}
                  />
                </label>
                <label className={labelCls}>
                  Est. weight (lb)
                  <input
                    type="number"
                    min={1}
                    value={p.weight_lbs}
                    onChange={(e) =>
                      setDraft((d) => {
                        const pax = [...d.pax]
                        pax[i] = {
                          ...pax[i]!,
                          weight_lbs:
                            e.target.value === '' ? '' : Number(e.target.value),
                        }
                        return { ...d, pax }
                      })
                    }
                    className={inputCls}
                  />
                </label>
                <label className={labelCls}>
                  DOB
                  <input
                    type="date"
                    value={p.dob}
                    onChange={(e) =>
                      setDraft((d) => {
                        const pax = [...d.pax]
                        pax[i] = { ...pax[i]!, dob: e.target.value }
                        return { ...d, pax }
                      })
                    }
                    className={inputCls}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        {draft.cargo_only && (
          <label className={labelCls}>
            Cargo description / dims
            <textarea
              value={draft.cargo_notes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, cargo_notes: e.target.value }))
              }
              rows={2}
              placeholder="e.g. 3 skids 48x40x60 @ 800ea"
              className={inputCls}
            />
          </label>
        )}
      </section>

      {/* Notes */}
      <section>
        <label className={labelCls}>
          Notes
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            rows={3}
            placeholder="Special handling, access notes, contacts on site…"
            className={inputCls}
          />
        </label>
      </section>

      {issues.length > 0 && (
        <ul className="rounded-md border border-late/40 bg-late/10 px-3 py-2 text-sm text-late">
          {issues.map((m) => (
            <li key={m}>· {m}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-gold px-4 py-3 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50"
      >
        {busy ? 'Submitting…' : (submitLabel ?? 'Submit trip request')}
      </button>
    </form>
  )
}
