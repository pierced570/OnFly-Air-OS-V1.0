/**
 * Public operator onboarding form.
 * Mirrors operations.onflyair.com/onboard — without "Amount Insured Up To"
 * (insured amount comes from the uploaded COI).
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BrandLockup } from '@/components/BrandLockup'
import { AirportSelect } from '@/components/AirportSelect'
import { submitOperatorOnboard } from '@/lib/operatorOnboardStore'
import {
  ensureOperatorCompliance,
  setOperatorDocFile,
} from '@/lib/operatorComplianceStore'
import { saveOperatorDraft } from '@/lib/operatorDraftStore'
import { addNeedsInfoTask } from '@/lib/needsInfoStore'

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold'
const labelCls = 'block text-xs font-medium text-muted'

export default function OnboardPage() {
  const [doneId, setDoneId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [company, setCompany] = useState('')
  const [base, setBase] = useState('')
  const [phone, setPhone] = useState('')
  const [afterHours, setAfterHours] = useState('')
  const [email, setEmail] = useState('')
  const [callout, setCallout] = useState('')
  const [pName, setPName] = useState('')
  const [pEmail, setPEmail] = useState('')
  const [pPhone, setPPhone] = useState('')
  const [bName, setBName] = useState('')
  const [bEmail, setBEmail] = useState('')
  const [bPhone, setBPhone] = useState('')
  const [pax, setPax] = useState(false)
  const [cargo, setCargo] = useState(true)
  const [hazmat, setHazmat] = useState(false)
  const [medivac, setMedivac] = useState(false)
  const [ops24, setOps24] = useState(false)
  const [sameDay, setSameDay] = useState(true)
  const [argus, setArgus] = useState('')
  const [wyvern, setWyvern] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [routing, setRouting] = useState('')
  const [account, setAccount] = useState('')
  const [notes, setNotes] = useState('')
  const [d085, setD085] = useState<File | null>(null)
  const [coi, setCoi] = useState<File | null>(null)
  const [charter, setCharter] = useState<File | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!company.trim() || !phone.trim() || !email.trim() || !email.includes('@')) {
      setError('Company name, phone, and email are required.')
      return
    }
    setBusy(true)
    try {
      const row = submitOperatorOnboard({
        company_name: company.trim(),
        base_icao: base.trim().toUpperCase(),
        company_phone: phone.trim(),
        after_hours_phone: afterHours.trim(),
        email: email.trim().toLowerCase(),
        callout_min: callout.trim() ? Number(callout) : null,
        primary_contact: {
          name: pName.trim(),
          email: pEmail.trim(),
          phone: pPhone.trim(),
        },
        billing_contact: {
          name: bName.trim(),
          email: bEmail.trim(),
          phone: bPhone.trim(),
        },
        capabilities: {
          pax,
          cargo,
          hazmat,
          medivac,
          ops_24hr: ops24,
          same_day: sameDay,
        },
        argus: argus.trim(),
        wyvern: wyvern.trim(),
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        bank_routing: routing.trim(),
        bank_account: account.trim(),
        notes: notes.trim(),
        docs: {
          d085: d085?.name ?? null,
          coi: coi?.name ?? null,
          charter_cert: charter?.name ?? null,
        },
      })

      // Seed operator draft + compliance for dispatcher review
      const draft = saveOperatorDraft({
        name: row.company_name,
        dba: '',
        certificate: '',
        base_icao: row.base_icao,
        region: '',
        contacts: [
          {
            name: row.primary_contact.name || 'Ops',
            role: 'ops',
            cell: row.primary_contact.phone || row.company_phone,
            email: row.primary_contact.email || row.email,
            consent_sms: true,
            consent_call: true,
          },
        ],
        capabilities: {
          cargo: row.capabilities.cargo,
          pax: row.capabilities.pax,
          hazmat: row.capabilities.hazmat,
          medivac: row.capabilities.medivac,
          ops_24hr: row.capabilities.ops_24hr,
          callout_min: row.callout_min ?? 60,
        },
        crew: {
          single_pilot_ok: true,
          dual_available: false,
          night_policy: 'Case-by-case',
        },
        aircraft: [],
        rates_note: '',
        completeness: 55,
      })
      const compliance = ensureOperatorCompliance({
        operator_id: draft.id,
        operator_name: draft.name,
        contact_email: row.email,
      })
      if (d085) await setOperatorDocFile(compliance.operator_id, 'd085', d085)
      if (coi) await setOperatorDocFile(compliance.operator_id, 'coi', coi)
      if (charter)
        await setOperatorDocFile(compliance.operator_id, 'charter_cert', charter)
      for (const [kind, file] of [
        ['d085', d085],
        ['coi', coi],
        ['charter_cert', charter],
      ] as const) {
        if (!file) {
          addNeedsInfoTask({
            entity_type: 'operator',
            entity_id: draft.id,
            entity_label: draft.name,
            field: kind,
            note: `Missing ${kind} on public onboarding`,
            wizard: 'operator',
          })
        }
      }
      addNeedsInfoTask({
        entity_type: 'operator',
        entity_id: draft.id,
        entity_label: draft.name,
        field: 'onboard_review',
        note: `Public onboarding submitted ${row.id.slice(0, 8)} — review contacts, docs, capabilities`,
        wizard: 'operator',
      })

      setDoneId(row.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (doneId) {
    return (
      <div className="min-h-screen bg-cream px-4 py-10 text-ink" data-theme="client">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <div className="flex justify-center"><BrandLockup showTagline={false} /></div>
          <h1 className="text-2xl font-semibold">Thanks — you’re in review</h1>
          <p className="text-sm text-muted">
            We received your onboarding packet. Dispatch will follow up once docs
            and contacts are verified. Ref{' '}
            <span className="avionic">{doneId.slice(0, 8)}</span>
          </p>
          <Link to="/portal" className="inline-block text-sm text-gold">
            Client portal →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <header className="border-b border-border bg-ink px-4 py-6 text-center text-cream">
        <BrandLockup variant="bar" className="!bg-transparent !px-0 !py-0" />
        <div className="mt-2 text-xs tracking-wide text-cream/80">
          Operator Network
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 p-4 pb-16 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold">Operator Onboarding</h1>
          <p className="mt-2 text-sm text-muted">
            Join the OnFly Air operator network. Upload D085, COI, and charter
            certificate — insured limits are read from the COI (no separate
            amount field).
          </p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Company information
            </h2>
            <label className={labelCls}>
              Company name *
              <input
                className={inputCls}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
              />
            </label>
            <div>
              <span className={labelCls}>Primary airport (ICAO)</span>
              <AirportSelect
                value={base}
                onChange={setBase}
                allowUnknown
                inputClassName="!bg-surface-2 !text-ink"
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Required documents
            </h2>
            <p className="text-xs text-muted">PDF, JPEG, or PNG.</p>
            {(
              [
                ['D085 (FAA Ops Specs)', d085, setD085],
                ['Insurance certificate (COI)', coi, setCoi],
                ['Charter certificate (Part 135)', charter, setCharter],
              ] as const
            ).map(([label, file, setFile]) => (
              <label key={label} className={labelCls}>
                {label}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <span className="mt-1 block text-xs text-ink">{file.name}</span>
                )}
              </label>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Contact information
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Company phone *
                <input
                  className={inputCls}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </label>
              <label className={labelCls}>
                24-hour contact
                <input
                  className={inputCls}
                  value={afterHours}
                  onChange={(e) => setAfterHours(e.target.value)}
                />
              </label>
              <label className={`${labelCls} sm:col-span-2`}>
                Best email *
                <input
                  type="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className={labelCls}>
                Typical pilot call-out (min)
                <input
                  className={inputCls}
                  value={callout}
                  onChange={(e) => setCallout(e.target.value)}
                  inputMode="numeric"
                />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Designated contacts
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2 rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-medium">Primary</legend>
                <input
                  className={inputCls}
                  placeholder="Name"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Email"
                  value={pEmail}
                  onChange={(e) => setPEmail(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Phone"
                  value={pPhone}
                  onChange={(e) => setPPhone(e.target.value)}
                />
              </fieldset>
              <fieldset className="space-y-2 rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-medium">Billing</legend>
                <input
                  className={inputCls}
                  placeholder="Name"
                  value={bName}
                  onChange={(e) => setBName(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Email"
                  value={bEmail}
                  onChange={(e) => setBEmail(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Phone"
                  value={bPhone}
                  onChange={(e) => setBPhone(e.target.value)}
                />
              </fieldset>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Capabilities
            </h2>
            <div className="flex flex-wrap gap-3 text-sm">
              {(
                [
                  ['Passenger', pax, setPax],
                  ['Cargo', cargo, setCargo],
                  ['Hazmat', hazmat, setHazmat],
                  ['Medevac', medivac, setMedivac],
                  ['24-hour ops', ops24, setOps24],
                  ['Same-day capable', sameDay, setSameDay],
                ] as const
              ).map(([label, val, set]) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Safety ratings
            </h2>
            <p className="text-xs text-muted">
              Insured amount is taken from your COI upload — not entered here.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                ARGUS rating
                <input
                  className={inputCls}
                  value={argus}
                  onChange={(e) => setArgus(e.target.value)}
                />
              </label>
              <label className={labelCls}>
                Wyvern rating
                <input
                  className={inputCls}
                  value={wyvern}
                  onChange={(e) => setWyvern(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Banking & payment
            </h2>
            <p className="text-xs text-muted">
              We prioritize same-day or next-business-day payments. For the full
              W-9 + ACH packet (TIN, certification), use{' '}
              <Link to="/vendor" className="text-gold hover:underline">
                /vendor
              </Link>
              .
            </p>
            <label className={labelCls}>
              Street
              <input
                className={inputCls}
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>
                City
                <input
                  className={inputCls}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>
              <label className={labelCls}>
                State
                <input
                  className={inputCls}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </label>
              <label className={labelCls}>
                ZIP
                <input
                  className={inputCls}
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Bank routing
                <input
                  className={inputCls}
                  value={routing}
                  onChange={(e) => setRouting(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className={labelCls}>
                Account number
                <input
                  className={inputCls}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>
          </section>

          <label className={labelCls}>
            Additional notes
            <textarea
              className={inputCls}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-late">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-gold py-3.5 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-60"
          >
            {busy ? 'Submitting…' : 'Submit onboarding form'}
          </button>
          <p className="text-center text-[11px] text-muted">
            Secure — used only for charter operations.
          </p>
        </form>
      </main>
    </div>
  )
}
