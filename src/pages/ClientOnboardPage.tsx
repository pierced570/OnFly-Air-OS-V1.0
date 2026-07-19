/**
 * Public client page — shareable onboarding link (not inside the portal).
 * Creates a ClientProfile on submit and binds the portal session for later requests.
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { lookupAirport } from '@/domain/airports'
import {
  emptyClientOnboardDraft,
  type ClientOnboardDraft,
  type ClientOnboardPerson,
  type PayTermsRequest,
  type UpdateChannel,
} from '@/domain/clientOnboard'
import { submitClientOnboard } from '@/lib/clientOnboardStore'

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold'
const labelCls = 'block text-xs font-medium text-muted'
const sectionCls =
  'rounded-lg border border-border bg-surface-2/40 p-4 sm:p-5 space-y-3'

export default function ClientOnboardPage() {
  const [draft, setDraft] = useState<ClientOnboardDraft>(() =>
    emptyClientOnboardDraft(),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; name: string } | null>(null)

  function patch(p: Partial<ClientOnboardDraft>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function patchPerson(
    key: 'ops' | 'ap' | 'emergency',
    p: Partial<ClientOnboardPerson>,
  ) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...p } }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { client } = await submitClientOnboard(draft)
      setDone({ id: client.id, name: client.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-cream text-ink" data-theme="client">
        <header className="border-b border-border px-6 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            OnFly Air
          </div>
          <h1 className="text-xl font-semibold">You&apos;re set up</h1>
        </header>
        <main className="mx-auto max-w-lg space-y-4 p-6">
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">{done.name}</span> is in our
            client directory. Tracking, invoices, and escalations will use the
            contacts you provided. Our team may follow up on billing setup.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/portal/request"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
            >
              Request a trip
            </Link>
            <Link
              to="/portal"
              className="rounded-md border border-border px-4 py-2 text-sm text-ink"
            >
              Portal home
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <header className="border-b border-border px-6 py-4">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">
          OnFly Air
        </div>
        <h1 className="text-xl font-semibold">Client setup</h1>
        <p className="mt-1 text-sm text-muted">
          About 3 minutes. We never ask for card numbers here — billing setup is
          handled securely after. After this, you can request trips in the portal.
        </p>
      </header>

      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
          {/* 1 Company */}
          <section className={sectionCls}>
            <h2 className="text-sm font-semibold text-ink">1. Company</h2>
            <label className={labelCls}>
              Legal name *
              <input
                className={inputCls}
                value={draft.legal_name}
                onChange={(e) => patch({ legal_name: e.target.value })}
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                DBA (if different)
                <input
                  className={inputCls}
                  value={draft.dba}
                  onChange={(e) => patch({ dba: e.target.value })}
                />
              </label>
              <label className={labelCls}>
                Website
                <input
                  className={inputCls}
                  value={draft.website}
                  onChange={(e) => patch({ website: e.target.value })}
                  placeholder="https://"
                />
              </label>
            </div>
            <label className={labelCls}>
              Street address *
              <input
                className={inputCls}
                value={draft.address.street}
                onChange={(e) =>
                  patch({
                    address: { ...draft.address, street: e.target.value },
                  })
                }
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>
                City *
                <input
                  className={inputCls}
                  value={draft.address.city}
                  onChange={(e) =>
                    patch({
                      address: { ...draft.address, city: e.target.value },
                    })
                  }
                  required
                />
              </label>
              <label className={labelCls}>
                State *
                <input
                  className={inputCls}
                  value={draft.address.state}
                  onChange={(e) =>
                    patch({
                      address: { ...draft.address, state: e.target.value },
                    })
                  }
                  required
                />
              </label>
              <label className={labelCls}>
                ZIP *
                <input
                  className={inputCls}
                  value={draft.address.zip}
                  onChange={(e) =>
                    patch({
                      address: { ...draft.address, zip: e.target.value },
                    })
                  }
                  required
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.billing_same_as_address}
                onChange={(e) =>
                  patch({ billing_same_as_address: e.target.checked })
                }
              />
              Billing address same as company address
            </label>
          </section>

          {/* 2 People */}
          <section className={sectionCls}>
            <h2 className="text-sm font-semibold text-ink">2. People</h2>
            <p className="text-xs text-muted">
              Ops gets tracking updates · AP gets invoices · Supervisors get
              escalations · Emergency is 24/7.
            </p>
            <PersonFields
              title="Ops contact (aircraft & logistics tracking) *"
              person={draft.ops}
              onChange={(p) => patchPerson('ops', p)}
            />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.ap_same_as_ops}
                onChange={(e) => patch({ ap_same_as_ops: e.target.checked })}
              />
              AP same as ops
            </label>
            {!draft.ap_same_as_ops && (
              <PersonFields
                title="Accounts Payable *"
                person={draft.ap}
                onChange={(p) => patchPerson('ap', p)}
                emailRequired
              />
            )}
            <label className={labelCls}>
              Ops front desk phone *
              <input
                className={`${inputCls} font-mono`}
                value={draft.front_desk_phone}
                onChange={(e) => patch({ front_desk_phone: e.target.value })}
                required
                inputMode="tel"
              />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">
                  Supervisor emails (escalations)
                </span>
                <button
                  type="button"
                  className="text-xs text-gold"
                  onClick={() =>
                    patch({
                      supervisors: [
                        ...draft.supervisors,
                        { name: '', email: '', phone: '' },
                      ],
                    })
                  }
                >
                  + Add
                </button>
              </div>
              {draft.supervisors.map((s, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <input
                    className={inputCls}
                    placeholder="Name"
                    value={s.name}
                    onChange={(e) => {
                      const supervisors = [...draft.supervisors]
                      supervisors[i] = { ...s, name: e.target.value }
                      patch({ supervisors })
                    }}
                  />
                  <input
                    className={inputCls}
                    placeholder="Email"
                    value={s.email}
                    onChange={(e) => {
                      const supervisors = [...draft.supervisors]
                      supervisors[i] = { ...s, email: e.target.value }
                      patch({ supervisors })
                    }}
                  />
                  <input
                    className={`${inputCls} font-mono`}
                    placeholder="Phone"
                    value={s.phone}
                    onChange={(e) => {
                      const supervisors = [...draft.supervisors]
                      supervisors[i] = { ...s, phone: e.target.value }
                      patch({ supervisors })
                    }}
                  />
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.emergency_same_as_ops}
                onChange={(e) =>
                  patch({ emergency_same_as_ops: e.target.checked })
                }
              />
              Emergency contact same as ops
            </label>
            {!draft.emergency_same_as_ops && (
              <PersonFields
                title="Emergency / head supervisor *"
                person={draft.emergency}
                onChange={(p) => patchPerson('emergency', p)}
                phoneRequired
              />
            )}
          </section>

          {/* 3 Billing */}
          <section className={sectionCls}>
            <h2 className="text-sm font-semibold text-ink">3. Billing</h2>
            <label className={labelCls}>
              Terms requested
              <select
                className={inputCls}
                value={draft.pay_terms}
                onChange={(e) =>
                  patch({ pay_terms: e.target.value as PayTermsRequest })
                }
              >
                <option value="prepay">Prepay / credit card</option>
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
                <option value="other">Other (we&apos;ll confirm)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.requires_po}
                onChange={(e) => patch({ requires_po: e.target.checked })}
              />
              Invoices require a PO number
            </label>
            <fieldset>
              <legend className="text-xs font-medium text-muted">
                Card on file?
              </legend>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {(
                  [
                    [true, 'Yes — send secure link'],
                    [false, 'No'],
                    [null, 'Not sure'],
                  ] as const
                ).map(([val, label]) => (
                  <label key={String(val)} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="card"
                      checked={draft.card_on_file === val}
                      onChange={() => patch({ card_on_file: val })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                We never collect card numbers on this form.
              </p>
            </fieldset>
            <label className={labelCls}>
              Vendor registration / where to send our W-9 + banking packet
              <input
                className={inputCls}
                value={draft.vendor_packet_to}
                onChange={(e) => patch({ vendor_packet_to: e.target.value })}
                placeholder="Email, portal URL, or AP contact"
              />
            </label>
          </section>

          {/* 4 Shipping */}
          <section className={sectionCls}>
            <h2 className="text-sm font-semibold text-ink">
              4. Shipping profile
            </h2>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.no_frequent_lanes}
                onChange={(e) =>
                  patch({ no_frequent_lanes: e.target.checked })
                }
              />
              No frequent locations / varies
            </label>
            {!draft.no_frequent_lanes && (
              <div className="space-y-3">
                {draft.lanes.map((lane, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
                  >
                    <label className={labelCls}>
                      Origin airport
                      <AirportSelect
                        value={lane.origin}
                        onChange={(icao) => {
                          const ap = lookupAirport(icao)
                          const lanes = [...draft.lanes]
                          lanes[i] = {
                            ...lane,
                            origin: icao,
                            origin_city: ap
                              ? `${ap.city}, ${ap.state}`
                              : lane.origin_city,
                          }
                          patch({ lanes })
                        }}
                      />
                    </label>
                    <label className={labelCls}>
                      Destination airport
                      <AirportSelect
                        value={lane.destination}
                        onChange={(icao) => {
                          const ap = lookupAirport(icao)
                          const lanes = [...draft.lanes]
                          lanes[i] = {
                            ...lane,
                            destination: icao,
                            destination_city: ap
                              ? `${ap.city}, ${ap.state}`
                              : lane.destination_city,
                          }
                          patch({ lanes })
                        }}
                      />
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs text-gold"
                  onClick={() =>
                    patch({
                      lanes: [
                        ...draft.lanes,
                        { origin: '', destination: '' },
                      ],
                    })
                  }
                >
                  + Add route
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-sm text-ink">
              {(
                [
                  ['hazmat_sometimes', 'Hazmat sometimes'],
                  ['temp_control', 'Temp control'],
                  ['oversized', 'Oversized'],
                  ['high_declared_value', 'High declared value'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    onChange={(e) => patch({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* 5 Preferences */}
          <section className={sectionCls}>
            <h2 className="text-sm font-semibold text-ink">5. Preferences</h2>
            <label className={labelCls}>
              Trip updates by
              <select
                className={inputCls}
                value={draft.update_channel}
                onChange={(e) =>
                  patch({ update_channel: e.target.value as UpdateChannel })
                }
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="both">Email + SMS</option>
              </select>
            </label>
            <label className={labelCls}>
              Anything else we should know?
              <textarea
                className={inputCls}
                rows={3}
                value={draft.anything_else}
                onChange={(e) => patch({ anything_else: e.target.value })}
              />
            </label>
          </section>

          {error && <p className="text-sm text-late">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-gold px-5 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Complete onboarding'}
            </button>
            <Link to="/portal" className="text-sm text-muted hover:text-ink">
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

function PersonFields({
  title,
  person,
  onChange,
  emailRequired,
  phoneRequired,
}: {
  title: string
  person: ClientOnboardPerson
  onChange: (p: Partial<ClientOnboardPerson>) => void
  emailRequired?: boolean
  phoneRequired?: boolean
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="text-xs font-medium text-muted">{title}</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          className={inputCls}
          placeholder="Name"
          value={person.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="Email"
          value={person.email}
          onChange={(e) => onChange({ email: e.target.value })}
          required={emailRequired}
        />
        <input
          className={`${inputCls} font-mono`}
          placeholder="Phone"
          value={person.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          required={phoneRequired}
          inputMode="tel"
        />
      </div>
    </div>
  )
}
