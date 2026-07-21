import { useMemo, useState, useSyncExternalStore } from 'react'
import { AirportSelect } from '@/components/AirportSelect'
import { DimUnitToggle } from '@/components/DimUnitToggle'
import { DimsTripleInput } from '@/components/DimsTripleInput'
import {
  ASAP_MAX_HOURS,
  cargoPiecesFromDraft,
  emptyTripRequestDraft,
  forkliftFromDraft,
  newLeg,
  syncReturnLegs,
  validateTripRequest,
  type TripRequestDraft,
  type TripLegDraft,
  type PaxRow,
} from '@/domain/tripRequest'
import {
  addSessionClient,
  listSessionClients,
  subscribeClients,
} from '@/lib/requestStore'

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

/** Patch outbound legs and keep return routes mirrored when round trip. */
function withOutboundLegs(
  d: TripRequestDraft,
  legs: TripLegDraft[],
): TripRequestDraft {
  const next = { ...d, legs }
  if (d.direction === 'round_trip') {
    next.return_legs = syncReturnLegs(legs, d.return_legs)
  }
  return next
}

export function TripRequestForm({
  variant,
  initial,
  submitLabel,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<TripRequestDraft>(() => {
    const base = emptyTripRequestDraft()
    const merged: TripRequestDraft = {
      ...base,
      ...initial,
      legs: initial?.legs?.length ? initial.legs : base.legs,
      return_legs: initial?.return_legs ?? base.return_legs,
    }
    if (
      merged.direction === 'round_trip' &&
      merged.return_legs.length === 0 &&
      merged.legs.length > 0
    ) {
      merged.return_legs = syncReturnLegs(merged.legs, [])
    }
    return merged
  })
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [issues, setIssues] = useState<string[]>([])

  const needsAddresses =
    draft.service_mode === 'd2d' || draft.service_mode === 'mixed'

  const paxCount = draft.pax.length

  const forkliftPreview = useMemo(() => forkliftFromDraft(draft), [draft])

  const clientOptions = useSyncExternalStore(
    subscribeClients,
    listSessionClients,
    listSessionClients,
  )

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
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Client name"
                className={inputCls}
              />
              <input
                type="email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                placeholder="Requester email (optional)"
                className={inputCls}
              />
              <button
                type="button"
                className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
                onClick={() => {
                  const name = newClientName.trim()
                  if (!name) return
                  const row = addSessionClient(name, newClientEmail)
                  setDraft((d) => ({
                    ...d,
                    client_id: row.id,
                    client_name: row.name,
                    email: row.email || d.email,
                  }))
                  setShowNewClient(false)
                  setNewClientName('')
                  setNewClientEmail('')
                }}
              >
                Add
              </button>
            </div>
          )}
          {clientOptions.length === 0 && !showNewClient && (
            <p className="mt-2 text-xs text-muted">
              No clients yet — use + New to add one.
            </p>
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
            Airport-to-airport: pick by ICAO or city/state. FBO selection
            happens in step two with dispatch.
          </p>
        )}
        {draft.service_mode === 'd2d' && (
          <p className="mt-2 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-[var(--text)]">
            Door-to-door: enter full pickup and delivery addresses. Dispatch
            assigns the nearest suitable airports from those locations.
          </p>
        )}
        {draft.service_mode === 'mixed' && (
          <p className="mt-2 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-[var(--text)]">
            Combination: provide ICAOs for the air segment plus pickup and
            delivery addresses for ground legs so we can assign airports and
            routing.
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
              setDraft((d) =>
                withOutboundLegs(d, [
                  ...d.legs,
                  newLeg({
                    origin_icao: d.legs[d.legs.length - 1]?.dest_icao ?? '',
                  }),
                ]),
              )
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

        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
          Outbound
        </div>
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
                      setDraft((d) =>
                        withOutboundLegs(
                          d,
                          d.legs.filter((l) => l.id !== leg.id),
                        ),
                      )
                    }
                  >
                    ✕
                  </button>
                )}
              </div>
              {needsAddresses && (
                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <label className={labelCls}>
                    Pickup address
                    <input
                      value={leg.pickup_address}
                      onChange={(e) =>
                        setDraft((d) =>
                          withOutboundLegs(
                            d,
                            updateLeg(d.legs, leg.id, {
                              pickup_address: e.target.value,
                              pickup_tbd: false,
                            }),
                          ),
                        )
                      }
                      placeholder="Street, city, state, ZIP"
                      required
                      className={inputCls}
                    />
                    <span className="mt-1 block text-[11px] text-muted">
                      Used to assign origin airport
                    </span>
                  </label>
                  <label className={labelCls}>
                    Delivery address
                    <input
                      value={leg.dropoff_address}
                      onChange={(e) =>
                        setDraft((d) =>
                          withOutboundLegs(
                            d,
                            updateLeg(d.legs, leg.id, {
                              dropoff_address: e.target.value,
                              dropoff_tbd: false,
                            }),
                          ),
                        )
                      }
                      placeholder="Street, city, state, ZIP"
                      required
                      className={inputCls}
                    />
                    <span className="mt-1 block text-[11px] text-muted">
                      Used to assign destination airport
                    </span>
                  </label>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {(draft.service_mode === 'a2a' ||
                  draft.service_mode === 'mixed') && (
                  <>
                    <AirportSelect
                      label="Origin"
                      value={leg.origin_icao}
                      required
                      inputClassName="bg-surface-2 text-[var(--text)]"
                      onChange={(icao) =>
                        setDraft((d) =>
                          withOutboundLegs(
                            d,
                            updateLeg(d.legs, leg.id, { origin_icao: icao }),
                          ),
                        )
                      }
                    />
                    <AirportSelect
                      label="Destination"
                      value={leg.dest_icao}
                      required
                      inputClassName="bg-surface-2 text-[var(--text)]"
                      onChange={(icao) =>
                        setDraft((d) =>
                          withOutboundLegs(
                            d,
                            updateLeg(d.legs, leg.id, { dest_icao: icao }),
                          ),
                        )
                      }
                    />
                  </>
                )}
                {draft.service_mode === 'd2d' && (
                  <>
                    <AirportSelect
                      label="Preferred origin airport"
                      optional
                      value={leg.origin_icao}
                      inputClassName="bg-surface-2 text-[var(--text)]"
                      onChange={(icao) =>
                        setDraft((d) =>
                          withOutboundLegs(
                            d,
                            updateLeg(d.legs, leg.id, { origin_icao: icao }),
                          ),
                        )
                      }
                    />
                    <AirportSelect
                      label="Preferred dest airport"
                      optional
                      value={leg.dest_icao}
                      inputClassName="bg-surface-2 text-[var(--text)]"
                      onChange={(icao) =>
                        setDraft((d) =>
                          withOutboundLegs(
                            d,
                            updateLeg(d.legs, leg.id, { dest_icao: icao }),
                          ),
                        )
                      }
                    />
                  </>
                )}
                {draft.timing === 'scheduled' && (
                  <>
                    <label className={labelCls}>
                      Date
                      <input
                        type="date"
                        value={leg.date}
                        onChange={(e) =>
                          setDraft((d) =>
                            withOutboundLegs(
                              d,
                              updateLeg(d.legs, leg.id, {
                                date: e.target.value,
                              }),
                            ),
                          )
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
                          setDraft((d) =>
                            withOutboundLegs(
                              d,
                              updateLeg(d.legs, leg.id, {
                                pickup_time: e.target.value,
                              }),
                            ),
                          )
                        }
                        className={inputCls}
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <label className="flex h-11 items-center gap-3 text-sm leading-none text-[var(--text)]">
            <span className="leading-none">Roundtrip</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.direction === 'round_trip'}
              onClick={() =>
                setDraft((d) => {
                  const on = d.direction !== 'round_trip'
                  return {
                    ...d,
                    direction: on ? 'round_trip' : 'one_way',
                    return_legs: on ? syncReturnLegs(d.legs, d.return_legs) : [],
                    hours_on_ground: on ? d.hours_on_ground : '',
                  }
                })
              }
              className={[
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-0 p-0 transition-colors',
                draft.direction === 'round_trip' ? 'bg-gold' : 'bg-border',
              ].join(' ')}
            >
              <span
                className={[
                  'pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface-2 shadow transition-transform',
                  draft.direction === 'round_trip'
                    ? 'translate-x-5'
                    : 'translate-x-0',
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

        {draft.direction === 'round_trip' && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted">
                Return
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Mirrors outbound in reverse (A→B becomes B→A). Routes update
                when you edit outbound
                {draft.timing === 'scheduled'
                  ? '; set return date and pickup time below.'
                  : '.'}
              </p>
            </div>
            {draft.return_legs.map((leg, idx) => {
              const o =
                leg.origin_icao.trim().toUpperCase() ||
                (leg.pickup_address.trim()
                  ? leg.pickup_address.trim()
                  : '—')
              const dest =
                leg.dest_icao.trim().toUpperCase() ||
                (leg.dropoff_address.trim()
                  ? leg.dropoff_address.trim()
                  : '—')
              return (
                <div
                  key={leg.id}
                  className="rounded-lg border border-border/80 border-dashed bg-ink/30 p-4"
                >
                  <div className="mb-3 text-sm font-semibold text-[var(--text)]">
                    Return leg {idx + 1}
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 avionic text-sm text-cream">
                    <span>{o}</span>
                    <span className="text-gold" aria-hidden>
                      →
                    </span>
                    <span>{dest}</span>
                  </div>
                  {needsAddresses &&
                    (leg.pickup_address.trim() ||
                      leg.dropoff_address.trim()) && (
                      <div className="mb-3 grid gap-2 text-[11px] text-muted sm:grid-cols-2">
                        <div>
                          <span className="uppercase tracking-wider">
                            Pickup
                          </span>
                          <div className="text-[var(--text)]">
                            {leg.pickup_address.trim() || '—'}
                          </div>
                        </div>
                        <div>
                          <span className="uppercase tracking-wider">
                            Delivery
                          </span>
                          <div className="text-[var(--text)]">
                            {leg.dropoff_address.trim() || '—'}
                          </div>
                        </div>
                      </div>
                    )}
                  {draft.timing === 'scheduled' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Date
                        <input
                          type="date"
                          value={leg.date}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              return_legs: updateLeg(d.return_legs, leg.id, {
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
                              return_legs: updateLeg(d.return_legs, leg.id, {
                                pickup_time: e.target.value,
                              }),
                            }))
                          }
                          className={inputCls}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.forklift_recommended}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  forklift_recommended: e.target.checked,
                  forklift_required: e.target.checked
                    ? d.forklift_required
                    : false,
                }))
              }
            />
            Forklift recommended
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.forklift_required}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  forklift_required: e.target.checked,
                  forklift_recommended: e.target.checked
                    ? true
                    : d.forklift_recommended,
                }))
              }
            />
            Forklift required
          </label>
        </div>
        {draft.hazmat && (
          <p className="mt-2 text-xs text-late">
            Hazmat flagged — dangerous-goods note will be attached for dispatch
            review.
          </p>
        )}
        {forkliftPreview.level !== 'none' && forkliftPreview.label && (
          <p
            className={[
              'mt-2 text-xs',
              forkliftPreview.level === 'required' ? 'text-late' : 'text-gold',
            ].join(' ')}
          >
            {forkliftPreview.label}
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            PO number
            <input
              value={draft.po_number}
              onChange={(e) =>
                setDraft((d) => ({ ...d, po_number: e.target.value }))
              }
              className={inputCls}
              placeholder="Optional"
            />
          </label>
          <label className={labelCls}>
            Declared value (USD)
            <input
              type="number"
              min={0}
              value={draft.declared_value_usd}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  declared_value_usd:
                    e.target.value === '' ? '' : Number(e.target.value),
                }))
              }
              className={`${inputCls} avionic`}
              placeholder="Optional"
            />
          </label>
          <label className={labelCls}>
            Hard deadline
            <input
              type="datetime-local"
              value={draft.hard_deadline_at}
              onChange={(e) =>
                setDraft((d) => ({ ...d, hard_deadline_at: e.target.value }))
              }
              className={`${inputCls} avionic`}
            />
          </label>
        </div>
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
          <div className="space-y-2">
            <DimUnitToggle
              value={draft.dim_unit ?? 'in'}
              onChange={(dim_unit) => setDraft((d) => ({ ...d, dim_unit }))}
            />
            <DimsTripleInput
              value={draft.cargo_notes}
              unit={draft.dim_unit ?? 'in'}
              onChange={(cargo_notes) =>
                setDraft((d) => {
                  const pieces = cargoPiecesFromDraft({
                    ...d,
                    cargo_notes,
                  })
                  const weighted = pieces.filter((p) => p.weight_lbs > 0)
                  // Keep legacy cargo_weight_lbs in sync when every skid has Lb ea
                  // (validation accepts either field or per-piece weights).
                  const cargo_weight_lbs =
                    weighted.length === pieces.length && weighted.length > 0
                      ? weighted[0]!.weight_lbs
                      : d.cargo_weight_lbs
                  return { ...d, cargo_notes, cargo_weight_lbs }
                })
              }
            />
            <p className="text-[11px] text-muted">
              Weight (Lb ea) is required on every skid. Pieces 100–200 lb →
              forklift recommended; over 200 lb → forklift required for
              dispatch.
            </p>
          </div>
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
