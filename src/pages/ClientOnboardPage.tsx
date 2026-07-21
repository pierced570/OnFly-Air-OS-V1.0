/**
 * Public client page — shareable onboarding link (not inside the portal).
 * Subjects match Admin "Add client" rules interview + Clients directory fields.
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { lookupAirport } from '@/domain/airports'
import {
  emptyAddress,
  emptyClientOnboardDraft,
  type ClientAddress,
  type ClientOnboardDraft,
  type ClientOnboardPerson,
  type MissionAircraftPolicy,
  type PayTermsRequest,
  type UpdateChannel,
} from '@/domain/clientOnboard'
import { submitClientOnboard } from '@/lib/clientOnboardStore'
import { BrandLockup } from '@/components/BrandLockup'

const inputCls =
  'mt-1.5 w-full rounded-md border border-[#d4cfc0] bg-white px-3 py-3 text-base text-[#0c0c0e] placeholder:text-[#8a8680] outline-none transition-colors focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25'
const labelCls = 'block text-sm font-semibold text-[#2a2a2e]'
const hintCls = 'text-sm leading-relaxed text-[#5c574c]'
const sectionCls =
  'space-y-4 rounded-xl border border-[#e5dfd0] bg-white p-5 shadow-sm sm:p-6'
const checkCls =
  'flex items-start gap-3 text-sm leading-snug text-[#0c0c0e] [&_input]:mt-0.5 [&_input]:h-4 [&_input]:w-4 [&_input]:shrink-0'
const airportInputCls =
  'mt-1.5 w-full rounded-md border border-[#d4cfc0] bg-white px-3 py-3 text-base text-[#0c0c0e] outline-none focus:border-[#c9a227]'
const sectionTitleCls = 'text-lg font-semibold tracking-tight text-[#0c0c0e]'

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
      <div className="min-h-screen bg-[#f7f2e3] text-[#0c0c0e]" data-theme="client">
        <header className="border-b border-[#e5dfd0] bg-white px-6 py-5">
          <div className="mx-auto max-w-lg">
            <BrandLockup showTagline={false} />
            <h1 className="mt-3 text-2xl font-semibold text-[#0c0c0e]">
              You&apos;re set up
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-lg space-y-4 p-6">
          <p className={hintCls}>
            <span className="font-semibold text-[#0c0c0e]">{done.name}</span> is
            in our client directory. Tracking, invoices, and escalations will
            use the contacts you provided. Our team may follow up on billing
            setup.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/portal/request"
              className="rounded-md bg-[#c9a227] px-4 py-2.5 text-sm font-semibold text-[#0c0c0e] hover:bg-[#e3b341]"
            >
              Request a trip
            </Link>
            <Link
              to="/portal"
              className="rounded-md border border-[#d4cfc0] bg-white px-4 py-2.5 text-sm font-medium text-[#0c0c0e]"
            >
              Portal home
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f2e3] text-[#0c0c0e]" data-theme="client">
      <header className="border-b border-[#e5dfd0] bg-white px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <BrandLockup showTagline={false} />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#0c0c0e] sm:text-3xl">
            Client setup
          </h1>
          <p className={`mt-2 max-w-xl ${hintCls}`}>
            Thank you for choosing OnFly Air. This form puts your contacts,
            billing, and routing preferences on file — so when you need us, we
            quote first and ask questions never.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 pb-16 sm:p-6">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
          {/* 1 Company */}
          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>1. Company</h2>
            <label className={labelCls}>
              Legal name *
              <input
                className={inputCls}
                value={draft.legal_name}
                onChange={(e) => patch({ legal_name: e.target.value })}
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
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
            <AddressFields
              title="Company address *"
              address={draft.address}
              onChange={(address) => patch({ address })}
            />
            <label className={checkCls}>
              <input
                type="checkbox"
                checked={draft.billing_same_as_address}
                onChange={(e) =>
                  patch({
                    billing_same_as_address: e.target.checked,
                    ...(e.target.checked
                      ? {}
                      : {
                          billing_address: draft.billing_address.street
                            ? draft.billing_address
                            : emptyAddress(),
                        }),
                  })
                }
              />
              Billing address same as company address
            </label>
            {!draft.billing_same_as_address && (
              <AddressFields
                title="Billing address *"
                address={draft.billing_address}
                onChange={(billing_address) => patch({ billing_address })}
              />
            )}
          </section>

          {/* 2 People */}
          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>2. People</h2>
            <p className={hintCls}>
              Ops / requesters get tracking. AP gets invoices. Supply-chain
              supervisors get trackers. Emergency is 24/7.
            </p>
            <PersonFields
              title="Ops / requester (aircraft & logistics) *"
              person={draft.ops}
              onChange={(p) => patchPerson('ops', p)}
            />
            <label className={checkCls}>
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
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className={labelCls}>
                  Supply-chain / supervisor emails (trackers)
                </span>
                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-[#c9a227] hover:text-[#e3b341]"
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
                <div key={i} className="grid gap-3 sm:grid-cols-3">
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
            <label className={checkCls}>
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
            <h2 className={sectionTitleCls}>3. Billing</h2>
            <label className={labelCls}>
              Pay terms
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
                <option value="net_60">Net 60</option>
                <option value="other">Other (we&apos;ll confirm)</option>
              </select>
            </label>

            <fieldset>
              <legend className={labelCls}>Who assigns PO numbers?</legend>
              <p className={`mt-1 ${hintCls}`}>
                Every company is different — tell us who issues the PO.
              </p>
              <div className="mt-3 flex flex-col gap-3 text-sm text-[#0c0c0e]">
                <label className={checkCls}>
                  <input
                    type="radio"
                    name="po_by"
                    checked={draft.po_assigned_by === 'client'}
                    onChange={() => patch({ po_assigned_by: 'client' })}
                  />
                  <span>
                    <span className="font-medium">Our company</span>
                    <span className="mt-0.5 block text-[#5c574c]">
                      We provide the PO — put it on the invoice when we send it
                    </span>
                  </span>
                </label>
                <label className={checkCls}>
                  <input
                    type="radio"
                    name="po_by"
                    checked={draft.po_assigned_by === 'onfly'}
                    onChange={() => patch({ po_assigned_by: 'onfly' })}
                  />
                  <span>
                    <span className="font-medium">OnFly</span>
                    <span className="mt-0.5 block text-[#5c574c]">
                      You assign / generate PO numbers for us
                    </span>
                  </span>
                </label>
              </div>
              {draft.po_assigned_by === 'onfly' && (
                <label className={`${labelCls} mt-3`}>
                  Preferred PO prefix (optional)
                  <input
                    className={`${inputCls} font-mono uppercase`}
                    value={draft.po_prefix}
                    onChange={(e) => patch({ po_prefix: e.target.value })}
                    placeholder="e.g. PSA"
                    maxLength={8}
                  />
                </label>
              )}
            </fieldset>

            <fieldset>
              <legend className={labelCls}>
                Vendor number in your system?
              </legend>
              <p className={`mt-1 ${hintCls}`}>
                Do you need OnFly registered as a vendor / a vendor number in
                your AP or procurement system before invoices can be paid?
              </p>
              <div className="mt-3 flex flex-col gap-3 text-sm text-[#0c0c0e] sm:flex-row sm:flex-wrap sm:gap-4">
                <label className={checkCls}>
                  <input
                    type="radio"
                    name="vendor_num"
                    checked={draft.needs_vendor_number === true}
                    onChange={() => patch({ needs_vendor_number: true })}
                  />
                  Yes — we need a vendor number / registration
                </label>
                <label className={checkCls}>
                  <input
                    type="radio"
                    name="vendor_num"
                    checked={draft.needs_vendor_number === false}
                    onChange={() => patch({ needs_vendor_number: false })}
                  />
                  No
                </label>
              </div>
              {draft.needs_vendor_number === true && (
                <label className={`${labelCls} mt-3`}>
                  How do we register / where do we get the vendor #?
                  <input
                    className={inputCls}
                    value={draft.vendor_number_notes}
                    onChange={(e) =>
                      patch({ vendor_number_notes: e.target.value })
                    }
                    placeholder="Portal URL, AP contact, or instructions"
                  />
                </label>
              )}
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

          {/* 4 Aircraft & cargo rules — freight vs passenger columns */}
          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>4. Aircraft & cargo rules</h2>
            <p className={hintCls}>
              Split by mission type — freight rules and passenger rules can
              differ. Applied to every future quote.
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Freight column */}
              <div className="space-y-3 rounded-lg border border-[#e5dfd0] bg-[#faf8f2] p-4">
                <div className="text-sm font-semibold text-[#0c0c0e]">
                  Freight rules
                </div>
                <PolicyChecks
                  policy={draft.freight_policy}
                  onChange={(freight_policy) => patch({ freight_policy })}
                  checkCls={checkCls}
                />
                <div className="space-y-3 border-t border-[#e5dfd0] pt-3">
                  <label className={checkCls}>
                    <input
                      type="checkbox"
                      checked={draft.hazmat_allowed}
                      onChange={(e) =>
                        patch({ hazmat_allowed: e.target.checked })
                      }
                    />
                    Hazmat allowed
                  </label>
                  {draft.hazmat_allowed && (
                    <label className={labelCls}>
                      Hazmat notes
                      <input
                        className={inputCls}
                        value={draft.hazmat_notes}
                        onChange={(e) =>
                          patch({ hazmat_notes: e.target.value })
                        }
                        placeholder="e.g. Sometimes — confirm per trip"
                      />
                    </label>
                  )}
                  <label className={checkCls}>
                    <input
                      type="checkbox"
                      checked={draft.oversized}
                      onChange={(e) =>
                        patch({ oversized: e.target.checked })
                      }
                    />
                    Oversized freight (often)
                  </label>
                  <label className={labelCls}>
                    Typical declared value
                    <input
                      className={inputCls}
                      value={draft.declared_value_norm}
                      onChange={(e) =>
                        patch({ declared_value_norm: e.target.value })
                      }
                      placeholder="e.g. under $50k / $100–250k"
                    />
                  </label>
                </div>
              </div>

              {/* Passenger column */}
              <div className="space-y-3 rounded-lg border border-[#e5dfd0] bg-[#faf8f2] p-4">
                <div className="text-sm font-semibold text-[#0c0c0e]">
                  Passenger rules
                </div>
                <label className={checkCls}>
                  <input
                    type="checkbox"
                    checked={draft.freight_only}
                    onChange={(e) =>
                      patch({ freight_only: e.target.checked })
                    }
                  />
                  <span>
                    <span className="font-medium">Freight only</span>
                    <span className="mt-0.5 block text-[#5c574c]">
                      We do not fly passengers — ignore passenger rules below.
                    </span>
                  </span>
                </label>
                <div
                  className={
                    draft.freight_only ? 'pointer-events-none opacity-40' : ''
                  }
                >
                  <PolicyChecks
                    policy={draft.passenger_policy}
                    onChange={(passenger_policy) =>
                      patch({ passenger_policy })
                    }
                    checkCls={checkCls}
                  />
                </div>
              </div>
            </div>

            <label className={labelCls}>
              Other notes
              <textarea
                className={inputCls}
                rows={3}
                value={draft.aircraft_other_notes}
                onChange={(e) =>
                  patch({ aircraft_other_notes: e.target.value })
                }
                placeholder="Anything else about aircraft, doors, airports, or cargo we should know…"
              />
            </label>
          </section>

          {/* 5 Shipping lanes */}
          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>5. Frequent routes</h2>
            <label className={checkCls}>
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
                    className="grid gap-3 rounded-lg border border-[#e5dfd0] bg-[#f7f2e3]/50 p-4 sm:grid-cols-2"
                  >
                    <label className={labelCls}>
                      Origin airport
                      <AirportSelect
                        value={lane.origin}
                        inputClassName={airportInputCls}
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
                        inputClassName={airportInputCls}
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
                  className="text-sm font-semibold text-[#c9a227] hover:text-[#e3b341]"
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
          </section>

          {/* 6 Preferences */}
          <section className={sectionCls}>
            <h2 className={sectionTitleCls}>6. Preferences</h2>
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

          {error && (
            <p className="rounded-md border border-[#c0392b]/30 bg-[#c0392b]/10 px-3 py-2 text-sm text-[#c0392b]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-md bg-[#c9a227] px-6 py-3 text-sm font-semibold text-[#0c0c0e] hover:bg-[#e3b341] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Complete onboarding'}
            </button>
            <Link
              to="/portal"
              className="text-sm font-medium text-[#5c574c] hover:text-[#0c0c0e]"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

function AddressFields({
  title,
  address,
  onChange,
}: {
  title: string
  address: ClientAddress
  onChange: (a: ClientAddress) => void
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-[#2a2a2e]">{title}</div>
      <label className={labelCls}>
        Street
        <input
          className={inputCls}
          value={address.street}
          onChange={(e) => onChange({ ...address, street: e.target.value })}
          required
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelCls}>
          City
          <input
            className={inputCls}
            value={address.city}
            onChange={(e) => onChange({ ...address, city: e.target.value })}
            required
          />
        </label>
        <label className={labelCls}>
          State
          <input
            className={inputCls}
            value={address.state}
            onChange={(e) => onChange({ ...address, state: e.target.value })}
            required
          />
        </label>
        <label className={labelCls}>
          ZIP
          <input
            className={inputCls}
            value={address.zip}
            onChange={(e) => onChange({ ...address, zip: e.target.value })}
            required
          />
        </label>
      </div>
    </div>
  )
}

function PolicyChecks({
  policy,
  onChange,
  checkCls,
}: {
  policy: MissionAircraftPolicy
  onChange: (next: MissionAircraftPolicy) => void
  checkCls: string
}) {
  function set(partial: Partial<MissionAircraftPolicy>) {
    const next = { ...policy, ...partial }
    // Multi-engine only clears single-engine options.
    if (partial.multi_engine_only === true) {
      next.single_engine_ok = false
      next.single_engine_turboprop_ok = false
    }
    // Broader SE OK makes turboprop-only redundant as a hard filter, but both
    // can stay checked as preferences — if SE OK turns on, leave turboprop as-is.
    if (partial.single_engine_ok === true || partial.single_engine_turboprop_ok === true) {
      next.multi_engine_only = false
    }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <label className={checkCls}>
        <input
          type="checkbox"
          checked={policy.dual_pilot_only}
          onChange={(e) => set({ dual_pilot_only: e.target.checked })}
        />
        Dual pilot only
      </label>
      <label className={checkCls}>
        <input
          type="checkbox"
          checked={policy.multi_engine_only}
          onChange={(e) => set({ multi_engine_only: e.target.checked })}
        />
        Multi-engine only
      </label>
      <label className={checkCls}>
        <input
          type="checkbox"
          checked={policy.single_engine_ok}
          disabled={policy.multi_engine_only}
          onChange={(e) => set({ single_engine_ok: e.target.checked })}
        />
        Single-engine OK
      </label>
      <label className={checkCls}>
        <input
          type="checkbox"
          checked={policy.single_engine_turboprop_ok}
          disabled={policy.multi_engine_only}
          onChange={(e) =>
            set({ single_engine_turboprop_ok: e.target.checked })
          }
        />
        Single-engine turboprop OK
      </label>
      <label className={checkCls}>
        <input
          type="checkbox"
          checked={policy.exceptions_with_permission}
          onChange={(e) =>
            set({ exceptions_with_permission: e.target.checked })
          }
        />
        <span>
          Exceptions with specific permission
          <span className="mt-0.5 block text-[#5c574c]">
            Dispatch may deviate only when we confirm with you first.
          </span>
        </span>
      </label>
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
    <div className="space-y-3 rounded-lg border border-[#e5dfd0] bg-[#f7f2e3]/40 p-4">
      <div className="text-sm font-semibold text-[#2a2a2e]">{title}</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelCls}>
          Name
          <input
            className={inputCls}
            value={person.name}
            onChange={(e) => onChange({ name: e.target.value })}
            autoComplete="name"
          />
        </label>
        <label className={labelCls}>
          Email
          <input
            className={inputCls}
            type="email"
            value={person.email}
            onChange={(e) => onChange({ email: e.target.value })}
            required={emailRequired}
            autoComplete="email"
          />
        </label>
        <label className={labelCls}>
          Phone
          <input
            className={`${inputCls} font-mono`}
            value={person.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            required={phoneRequired}
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
      </div>
    </div>
  )
}
