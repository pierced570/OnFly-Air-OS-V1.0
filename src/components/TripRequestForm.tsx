import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react'
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
  type CargoDimsStatus,
  type TripRequestDraft,
  type TripLegDraft,
  type PaxRow,
} from '@/domain/tripRequest'
import {
  STANDARD_TOOLING,
  composeStandardCargoDims,
  STANDARD_CARGO_DEFAULTS,
} from '@/domain/standardTooling'
import {
  addSessionClient,
  listSessionClients,
  subscribeClients,
} from '@/lib/requestStore'

export type PortalSubmitIntent = 'estimate' | 'hard_quote'

type Variant = 'portal' | 'dispatch'

type Props = {
  variant: Variant
  initial?: Partial<TripRequestDraft>
  /** Dispatch / legacy single submit label. Ignored when portalDualActions. */
  submitLabel?: string
  /** Portal: ballpark vs quote-now dual CTAs. */
  portalDualActions?: boolean
  /**
   * Portal three-step wizard (Contact & service → Route & timing → Cargo & notes).
   * Implies portalDualActions on the last step.
   */
  portalWizard?: boolean
  onSubmit: (
    draft: TripRequestDraft,
    intent?: PortalSubmitIntent,
  ) => void | Promise<void>
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
  portalDualActions = false,
  portalWizard = false,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<TripRequestDraft>(() => {
    const base = emptyTripRequestDraft()
    const merged: TripRequestDraft = {
      ...base,
      ...initial,
      legs: initial?.legs?.length ? initial.legs : base.legs,
      return_legs: initial?.return_legs ?? base.return_legs,
      cargo_dims_status: initial?.cargo_dims_status ?? base.cargo_dims_status,
      urgent_phone: initial?.urgent_phone ?? base.urgent_phone,
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
  const [pendingIntent, setPendingIntent] = useState<PortalSubmitIntent | null>(
    null,
  )
  const wizard = portalWizard && variant === 'portal'
  const dualActions = portalDualActions || wizard
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const showStep = (s: 1 | 2 | 3) => !wizard || wizardStep === s

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

  function applyCargoDimsStatus(status: CargoDimsStatus) {
    setDraft((d) => {
      if (status === 'standard') {
        return {
          ...d,
          cargo_dims_status: status,
          cargo_only: true,
          cargo_notes: composeStandardCargoDims(STANDARD_CARGO_DEFAULTS),
          cargo_weight_lbs: Number(STANDARD_CARGO_DEFAULTS.weight),
          dim_unit: 'in',
        }
      }
      if (status === 'not_yet') {
        return {
          ...d,
          cargo_dims_status: status,
          cargo_notes: '',
          cargo_weight_lbs: '',
        }
      }
      return { ...d, cargo_dims_status: status }
    })
  }

  async function handleSubmit(
    e: FormEvent,
    intent: PortalSubmitIntent = 'estimate',
  ) {
    e.preventDefault()
    const next = { ...draft }
    if (variant === 'dispatch' && !next.email.trim() && next.client_id) {
      const hit = clientOptions.find((c) => c.id === next.client_id)
      if (hit) next.email = hit.email
    }
    if (next.cargo_dims_status === 'standard' && !next.cargo_notes.trim()) {
      next.cargo_notes = composeStandardCargoDims(STANDARD_CARGO_DEFAULTS)
      next.cargo_weight_lbs = Number(STANDARD_CARGO_DEFAULTS.weight)
    }
    const errs = validateTripRequest(next, {
      requireEmail: variant === 'portal',
      requireClient: variant === 'dispatch',
    })
    if (variant === 'portal' && !next.client_name?.trim()) {
      errs.push({ field: 'client_name', message: 'Enter your company name' })
    }
    if (errs.length) {
      setIssues(errs.map((i) => i.message))
      return
    }
    setIssues([])
    setBusy(true)
    setPendingIntent(intent)
    try {
      await onSubmit(next, intent)
    } finally {
      setBusy(false)
      setPendingIntent(null)
    }
  }

  function goNextWizard() {
    setIssues([])
    if (wizardStep === 1) {
      if (!draft.email.trim().includes('@')) {
        setIssues(['Enter a work email'])
        return
      }
      if (!draft.client_name?.trim()) {
        setIssues(['Enter your company name'])
        return
      }
      setWizardStep(2)
      return
    }
    if (wizardStep === 2) {
      const hasRoute = draft.legs.some(
        (l) =>
          l.origin_icao.trim() ||
          l.dest_icao.trim() ||
          l.pickup_address.trim() ||
          l.dropoff_address.trim(),
      )
      if (!hasRoute) {
        setIssues(['Add at least an origin / destination or addresses'])
        return
      }
      setWizardStep(3)
    }
  }

  return (
    <form
      onSubmit={(e) =>
        void handleSubmit(e, dualActions ? 'estimate' : 'estimate')
      }
      className="space-y-6"
    >
      {wizard ? (
        <nav className="flex flex-wrap gap-0 border-b border-border pb-3">
          {(
            [
              [1, 'Contact & service'],
              [2, 'Route & timing'],
              [3, 'Cargo & notes'],
            ] as const
          ).map(([n, label]) => {
            const on = wizardStep === n
            const done = wizardStep > n
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  if (done || on) setWizardStep(n)
                }}
                className={[
                  'flex flex-1 items-center gap-2 border-b-2 px-1 pb-2 text-left text-sm',
                  on
                    ? 'border-gold font-semibold text-ink'
                    : done
                      ? 'border-transparent text-ink/70'
                      : 'border-transparent text-muted',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    on
                      ? 'bg-ink text-cream'
                      : done
                        ? 'bg-gold/30 text-ink'
                        : 'bg-[#efe9d8] text-muted',
                  ].join(' ')}
                >
                  {n}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            )
          })}
        </nav>
      ) : null}

      {/* Client / email */}
      {variant === 'portal' && showStep(1) ? (
        <section className="space-y-3">
          {wizard ? (
            <h2 className="text-base font-semibold text-ink">
              Who should we talk to?
            </h2>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Your email
              <input
                type="email"
                required={!wizard}
                value={draft.email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, email: e.target.value }))
                }
                placeholder="you@company.com"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Company
              <input
                type="text"
                required={!wizard}
                value={draft.client_name ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, client_name: e.target.value }))
                }
                placeholder="Your company name"
                className={inputCls}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Best number for urgent matters
              <input
                type="tel"
                value={draft.urgent_phone}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, urgent_phone: e.target.value }))
                }
                placeholder="(555) 555-5555"
                className={inputCls}
                autoComplete="tel"
              />
            </label>
            <div className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-2 text-xs text-ink/80 sm:mt-5">
              Status updates go to your email. We use the phone only for
              time-critical reach-backs.
            </div>
          </div>
        </section>
      ) : null}
      {variant === 'dispatch' ? (
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
      ) : null}

      {/* Service mode — step 1 */}
      {showStep(1) ? (
      <section>
        {wizard ? (
          <h2 className="mb-2 text-base font-semibold text-ink">
            What kind of move is it?
          </h2>
        ) : (
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Service type
          </div>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(
            [
              [
                'a2a',
                'Airport → Airport',
                'You handle both ends. Pick by ICAO or city/state; FBO selection happens with dispatch.',
              ],
              [
                'd2d',
                'Door → Door',
                'Give us two addresses. We arrange ground pickup and final delivery.',
              ],
              [
                'mixed',
                'Combination',
                'Ground on one end, your team or an FBO handoff on the other.',
              ],
            ] as const
          ).map(([id, label, blurb]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, service_mode: id }))}
              className={[
                'rounded-xl border px-3 py-3 text-left transition-colors',
                draft.service_mode === id
                  ? 'border-gold bg-gold/15 text-ink'
                  : 'border-border bg-white text-ink hover:border-gold/50',
              ].join(' ')}
            >
              <div className="text-sm font-semibold">{label}</div>
              {wizard ? (
                <p className="mt-1 text-xs text-muted">{blurb}</p>
              ) : null}
            </button>
          ))}
        </div>
        {!wizard && draft.service_mode === 'a2a' ? (
          <p className="mt-2 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-[var(--text)]">
            Airport-to-airport: pick by ICAO or city/state. FBO selection
            happens in step two with dispatch.
          </p>
        ) : null}
        {!wizard && draft.service_mode === 'd2d' ? (
          <p className="mt-2 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-[var(--text)]">
            Door-to-door: pickup address → optional departure airport → optional
            destination airport → delivery address. Airports are preferred only —
            dispatch can assign nearer fields from the addresses.
          </p>
        ) : null}
        {draft.service_mode === 'mixed' && !wizard && (
          <p className="mt-2 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-[var(--text)]">
            Combination: provide ICAOs for the air segment plus pickup and
            delivery addresses for ground legs so we can assign airports and
            routing.
          </p>
        )}
      </section>
      ) : null}

      {/* Legs — step 2 */}
      {showStep(2) ? (
      <>
      {wizard ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-ink">
            How long until it&apos;s ready?
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={[
                'rounded-full border px-5 py-2.5 text-sm font-semibold',
                draft.timing === 'asap'
                  ? 'border-gold bg-gold/15 text-ink'
                  : 'border-border bg-white text-ink',
              ].join(' ')}
              onClick={() => setDraft((d) => ({ ...d, timing: 'asap' }))}
            >
              Within 4 hours
            </button>
            <button
              type="button"
              className={[
                'rounded-full border px-5 py-2.5 text-sm font-semibold',
                draft.timing === 'scheduled'
                  ? 'border-gold bg-gold/15 text-ink'
                  : 'border-border bg-white text-ink',
              ].join(' ')}
              onClick={() => setDraft((d) => ({ ...d, timing: 'scheduled' }))}
            >
              Pick date &amp; time
            </button>
            {draft.timing === 'asap' ? (
              <p className="text-xs text-muted sm:max-w-xs">
                ASAP means ready within {ASAP_MAX_HOURS} hours — we target the
                next available aircraft.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {variant !== 'portal' ? (
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
                  onClick={() =>
                    setDraft((d) => ({ ...d, timing: 'scheduled' }))
                  }
                >
                  Scheduled
                </button>
              </div>
            ) : wizard ? (
              <h2 className="text-base font-semibold text-ink">
                Outbound route
              </h2>
            ) : null}
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
            className={
              wizard
                ? 'rounded-md bg-gold/15 px-2.5 py-1 text-sm font-semibold text-gold hover:bg-gold/25'
                : 'text-sm font-medium text-gold hover:text-gold-lt'
            }
          >
            {wizard ? '+ Add stop' : '+ Add Stop'}
          </button>
        </div>

        {!wizard ? (
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            Outbound
          </div>
        ) : null}
        <div className="space-y-4">
          {draft.legs.map((leg, idx) => (
            <div
              key={leg.id}
              className={[
                'relative rounded-xl border p-4',
                wizard
                  ? 'border-[#e5dfd0] bg-white'
                  : 'border-border bg-surface-2',
              ].join(' ')}
            >
              <div className="mb-3 flex items-center justify-between">
                <div
                  className={
                    wizard
                      ? 'text-[11px] font-semibold uppercase tracking-[0.14em] text-gold'
                      : 'text-sm font-semibold text-[var(--text)]'
                  }
                >
                  {wizard ? `LEG ${idx + 1}` : `Leg ${idx + 1}`}
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
              {needsAddresses && draft.service_mode === 'd2d' ? (
                <div className="mb-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border bg-cream/40 px-3 py-2 text-[10px] uppercase tracking-wider text-muted">
                    <span className="text-[var(--text)]">Pickup</span>
                    <span className="text-gold" aria-hidden>
                      →
                    </span>
                    <span>Optional departure airport</span>
                    <span className="text-gold" aria-hidden>
                      →
                    </span>
                    <span>Optional destination airport</span>
                    <span className="text-gold" aria-hidden>
                      →
                    </span>
                    <span className="text-[var(--text)]">Delivery</span>
                  </div>
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
                  </label>
                  <div className="flex justify-center text-gold" aria-hidden>
                    ↓
                  </div>
                  <div className="rounded-lg border border-border bg-ink/5 p-3">
                    <AirportSelect
                      label="Preferred departure airport (optional)"
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
                  </div>
                  <div className="flex justify-center text-gold" aria-hidden>
                    ↓
                  </div>
                  <div className="rounded-lg border border-border bg-ink/5 p-3">
                    <AirportSelect
                      label="Preferred destination airport (optional)"
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
                  </div>
                  <div className="flex justify-center text-gold" aria-hidden>
                    ↓
                  </div>
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
                  </label>
                </div>
              ) : needsAddresses ? (
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
              ) : null}

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
        {wizard ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted">
                Special flags
              </div>
              <div className="mt-2 flex flex-col gap-3 text-sm text-[var(--text)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.hazmat}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, hazmat: e.target.checked }))
                    }
                  />
                  Hazmat
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.forklift_required}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        forklift_required: e.target.checked,
                        forklift_recommended: e.target.checked,
                      }))
                    }
                  />
                  Forklift required
                </label>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted">
                Hard deadline{' '}
                <span className="normal-case tracking-normal text-muted/80">
                  (optional)
                </span>
              </div>
              <label className={`${labelCls} mt-2`}>
                <span className="sr-only">Hard deadline (optional)</span>
                <input
                  type="datetime-local"
                  value={draft.hard_deadline_at}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      hard_deadline_at: e.target.value,
                    }))
                  }
                  className={`${inputCls} avionic`}
                />
              </label>
              <label
                className={[
                  'mt-3 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm',
                  draft.cargo_only
                    ? 'border-gold bg-gold/15 text-ink'
                    : 'border-border bg-white text-[var(--text)]',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={draft.cargo_only}
                  onChange={(e) => {
                    const cargo_only = e.target.checked
                    setDraft((d) => ({
                      ...d,
                      cargo_only,
                      pax: cargo_only
                        ? []
                        : d.pax.length
                          ? d.pax
                          : [{ name: '', weight_lbs: '', dob: '' }],
                    }))
                  }}
                />
                Cargo only (no passengers)
              </label>
            </div>
          </div>
        ) : (
          <>
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
                Hazmat
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.forklift_required}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      forklift_required: e.target.checked,
                      forklift_recommended: e.target.checked,
                    }))
                  }
                />
                Forklift required
              </label>
            </div>
            <div
              className={[
                'mt-3 grid gap-3',
                variant === 'portal' ? 'sm:grid-cols-1' : 'sm:grid-cols-3',
              ].join(' ')}
            >
              {variant !== 'portal' && (
                <>
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
                            e.target.value === ''
                              ? ''
                              : Number(e.target.value),
                        }))
                      }
                      className={`${inputCls} avionic`}
                      placeholder="Optional"
                    />
                  </label>
                </>
              )}
              <label className={labelCls}>
                Hard deadline{' '}
                <span className="font-normal normal-case text-muted">
                  (optional)
                </span>
                <input
                  type="datetime-local"
                  value={draft.hard_deadline_at}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      hard_deadline_at: e.target.value,
                    }))
                  }
                  className={`${inputCls} avionic`}
                />
              </label>
            </div>
          </>
        )}
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
      </section>
      </>
      ) : null}

      {/* Cargo / pax — step 3 */}
      {showStep(3) ? (
      <>
      <section className="space-y-3">
        {!wizard ? (
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
        ) : null}

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
          <div className="space-y-3">
            {variant === 'portal' && (
              <div>
                <h2
                  className={
                    wizard
                      ? 'text-base font-semibold text-ink'
                      : 'text-xs font-medium uppercase tracking-wider text-muted'
                  }
                >
                  Cargo dims &amp; weight
                </h2>
                <div
                  className={[
                    'mt-2 grid gap-1 p-1 sm:grid-cols-3',
                    wizard
                      ? 'rounded-xl bg-[#F3EEE4]'
                      : 'gap-2 rounded-lg border border-border bg-surface-2',
                  ].join(' ')}
                >
                  {(
                    [
                      ['known', 'I have dims'],
                      ['not_yet', 'Not yet'],
                      ['standard', 'Autofill standard cargo'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyCargoDimsStatus(id)}
                      className={
                        wizard
                          ? [
                              'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                              draft.cargo_dims_status === id
                                ? 'bg-white font-semibold text-ink shadow-sm'
                                : 'text-muted hover:text-ink',
                            ].join(' ')
                          : segBtn(draft.cargo_dims_status === id)
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {draft.cargo_dims_status === 'standard' && (
                  <p className="mt-2 text-xs text-muted">
                    Using {STANDARD_TOOLING.ui_label}:{' '}
                    <span className="avionic text-[var(--text)]">
                      {STANDARD_TOOLING.summary}
                    </span>
                    . Change to “I have dims” to enter custom sizes.
                  </p>
                )}
                {draft.cargo_dims_status === 'not_yet' && (
                  <p className="mt-2 text-xs text-muted">
                    Soft estimate runs now assuming the cargo is small enough to
                    fit every aircraft class. Send real dims later and we&apos;ll
                    refine.
                  </p>
                )}
              </div>
            )}
            {(variant === 'dispatch' ||
              draft.cargo_dims_status === 'known' ||
              draft.cargo_dims_status === 'standard') && (
              <>
                <div
                  className={
                    wizard
                      ? 'space-y-3 rounded-xl border border-[#e5dfd0] bg-white p-4'
                      : 'space-y-3'
                  }
                >
                  <DimUnitToggle
                    value={draft.dim_unit ?? 'in'}
                    onChange={(dim_unit) =>
                      setDraft((d) => ({ ...d, dim_unit }))
                    }
                    hideLabel={wizard}
                    light={wizard}
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
                        const cargo_weight_lbs =
                          weighted.length === pieces.length &&
                          weighted.length > 0
                            ? weighted[0]!.weight_lbs
                            : d.cargo_weight_lbs
                        return {
                          ...d,
                          cargo_notes,
                          cargo_weight_lbs,
                          cargo_dims_status:
                            d.cargo_dims_status === 'not_yet'
                              ? 'known'
                              : d.cargo_dims_status,
                        }
                      })
                    }
                  />
                  {wizard ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-gold/25 bg-gold/10 px-3 py-2.5 text-xs text-ink/80">
                        Enter L × W × H per piece. Use{' '}
                        <span className="font-semibold">+ Add cargo</span> when
                        sizes differ.
                      </div>
                      <div className="rounded-lg border border-gold/25 bg-gold/10 px-3 py-2.5 text-xs text-ink/80">
                        Weight (Lb ea) is required. Pieces 100–200 lb → forklift
                        recommended; over 200 lb → forklift required for
                        dispatch.
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted">
                      Weight (Lb ea) is required on every cargo piece. Pieces
                      100–200 lb → forklift recommended; over 200 lb → forklift
                      required for dispatch.
                    </p>
                  )}
                </div>
              </>
            )}
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

      {dualActions ? (
        <div className="space-y-5">
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => void handleSubmit(e, 'estimate')}
              className="w-full rounded-xl border-2 border-gold bg-white px-4 py-4 text-sm font-semibold text-ink hover:bg-gold/10 disabled:opacity-50"
            >
              {busy && pendingIntent === 'estimate'
                ? 'Estimating…'
                : 'What could this possibly cost?'}
            </button>
            <p className="mt-2 text-xs text-muted">
              A ballpark from our historical pricing. Real prices vary with ASAP
              availability, repositioning time and aircraft type required.
            </p>
          </div>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => void handleSubmit(e, 'hard_quote')}
              className="w-full rounded-xl bg-ink px-4 py-4 text-sm font-semibold text-gold hover:bg-[#1a1a1a] disabled:opacity-50"
            >
              {busy && pendingIntent === 'hard_quote'
                ? 'Submitting…'
                : 'Have OnFly quote this NOW'}
            </button>
            <p className="mt-2 text-xs text-muted">
              Our team starts on this immediately. Typical quote time 10–15
              minutes — watch your email for questions and next steps.
            </p>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-gold px-4 py-3 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-50"
        >
          {busy ? 'Submitting…' : (submitLabel ?? 'Submit trip request')}
        </button>
      )}
      </>
      ) : null}

      {issues.length > 0 ? (
        <ul className="rounded-md border border-late/40 bg-late/10 px-3 py-2 text-sm text-late">
          {issues.map((m) => (
            <li key={m}>· {m}</li>
          ))}
        </ul>
      ) : null}

      {wizard && wizardStep < 3 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <button
            type="button"
            className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm disabled:opacity-40"
            disabled={wizardStep === 1}
            onClick={() =>
              setWizardStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3)
            }
          >
            Back
          </button>
          <button
            type="button"
            className="rounded-full bg-ink px-8 py-2.5 text-sm font-semibold text-gold hover:bg-[#1a1a1a]"
            onClick={goNextWizard}
          >
            Continue
          </button>
        </div>
      ) : null}

      {wizard && wizardStep === 3 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2">
          <button
            type="button"
            className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm"
            onClick={() => setWizardStep(2)}
          >
            Back
          </button>
          <span className="text-xs text-muted">
            Review above, then send it to dispatch.
          </span>
        </div>
      ) : null}
    </form>
  )
}
