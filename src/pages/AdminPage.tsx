import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import {
  WizardShell,
  wizardInput,
  wizardLabel,
} from '@/components/wizard/WizardShell'
import { addClient, type ContactRole } from '@/lib/clientStore'
import { addFbo } from '@/lib/fboStore'
import { addNeedsInfoTask } from '@/lib/needsInfoStore'
import { saveOperatorDraft } from '@/lib/operatorDraftStore'
import {
  parseD085File,
  type D085ParseResult,
} from '@/lib/parseD085File'
import {
  ensureOperatorCompliance,
  setOperatorDocExpiry,
  setOperatorDocFile,
  type OperatorDocKind,
} from '@/lib/operatorComplianceStore'
import { watchTailsFromD085 } from '@/lib/watchedTailsStore'
import { createAccountingAdapter } from '@/adapters/accounting'
import { OperatorInvitePanel } from '@/components/OperatorInvitePanel'
import { listAdapterDoorStatus } from '@/lib/adapterStatus'
import type { D085AircraftRow } from '@/domain/d085Parse'
import {
  ETA_DEFAULT_LABELS,
  getEtaDefaults,
  resetEtaDefaults,
  setEtaDefault,
  subscribeEtaDefaults,
} from '@/lib/etaDefaultsStore'
import { formatDurationMin, parseDurationInput } from '@/domain/timeFmt'
import type { EtaDefaults } from '@/domain/etaChain'

type WizardKind = 'invite' | 'operator' | 'client' | 'fbo'

function EtaDefaultsPanel() {
  useSyncExternalStore(subscribeEtaDefaults, getEtaDefaults, getEtaDefaults)
  const defaults = getEtaDefaults()
  const keys = Object.keys(ETA_DEFAULT_LABELS) as (keyof EtaDefaults)[]

  return (
    <section className="rounded-lg border border-gold/30 bg-gold/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-cream">ETA defaults</h2>
          <p className="mt-0.5 text-xs text-muted">
            Per-leg overridable on the dispatcher sheet. Source tags:
            assumed → quoted → manual → actual.
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-gold underline"
          onClick={() => resetEtaDefaults()}
        >
          Reset all
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {keys.map((key) => (
          <label key={key} className="block text-xs text-muted">
            {ETA_DEFAULT_LABELS[key]}
            <input
              className="avionic mt-1 w-full rounded border border-border bg-black/30 px-2 py-1.5 text-sm text-cream"
              defaultValue={formatDurationMin(defaults[key])}
              key={`${key}-${defaults[key]}`}
              onBlur={(e) => {
                const min = parseDurationInput(e.target.value)
                if (min == null) return
                setEtaDefault(key, min)
              }}
            />
          </label>
        ))}
      </div>
    </section>
  )
}

const OP_STEPS = [
  'Identity',
  'Contacts',
  'Capabilities',
  'Crew',
  'D085',
  'Documents',
  'Rates',
  'Summary',
]
const CLIENT_STEPS = [
  'Company',
  'Crew rule',
  'Payload',
  'Aircraft',
  'Hazmat',
  'People',
  'Summary',
]
const FBO_STEPS = ['Airport', 'Hours', 'Forklift', 'Fees', 'Summary']

export default function AdminPage() {
  const [kind, setKind] = useState<WizardKind>('invite')
  const doors = useMemo(() => listAdapterDoorStatus(), [])

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Admin wizards</h1>
        <p className="mt-1 text-sm text-muted">
          Invite operators by email, or run guided interviews — skip writes
          NEEDS-INFO, never blank tables.
        </p>
        <p className="mt-2 text-sm text-muted">
          Day-to-day contact flags:{' '}
          <Link to="/clients" className="text-gold hover:text-gold-lt">
            Clients
          </Link>
          {' · '}
          <Link to="/fbos" className="text-gold hover:text-gold-lt">
            FBOs
          </Link>
          {' · '}
          <Link to="/admin/tasks" className="text-gold hover:text-gold-lt">
            NEEDS-INFO tasks
          </Link>
          {' · '}
          <Link to="/admin/staff" className="text-gold hover:text-gold-lt">
            Staff access
          </Link>
          {' · '}
          <Link to="/admin/keys" className="text-gold hover:text-gold-lt">
            Logins &amp; keys
          </Link>
          {' · '}
          <Link to="/onboard" className="text-gold hover:text-gold-lt">
            Operator onboard
          </Link>
          {' · '}
          <Link to="/client" className="text-gold hover:text-gold-lt">
            Client page (send link)
          </Link>
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {doors.map((d) => (
            <li
              key={d.id}
              title={d.detail}
              className={[
                'rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide',
                d.state === 'live'
                  ? 'border-onplan/40 text-onplan'
                  : d.state === 'blocked'
                    ? 'border-late/40 text-late'
                    : 'border-border text-muted',
              ].join(' ')}
            >
              {d.label}
              <span className="ml-1 opacity-70">
                {d.state === 'live' ? 'live' : d.state === 'blocked' ? 'wire' : 'mock'}
              </span>
            </li>
          ))}
        </ul>
      </header>

      <EtaDefaultsPanel />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['invite', 'Invite email'],
            ['operator', 'Add operator'],
            ['client', 'Add client'],
            ['fbo', 'Add FBO'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={[
              'rounded-md px-3 py-1.5 text-sm',
              kind === k ? 'bg-gold text-ink' : 'bg-surface text-muted',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === 'invite' && <OperatorInvitePanel key="inv" />}
      {kind === 'operator' && <OperatorWizard key="op" />}
      {kind === 'client' && <ClientWizard key="cl" />}
      {kind === 'fbo' && <FboWizard key="fbo" />}
    </div>
  )
}

function OperatorWizard() {
  const [step, setStep] = useState(0)
  const [skipped, setSkipped] = useState<string[]>([])
  const [name, setName] = useState('')
  const [dba, setDba] = useState('')
  const [cert, setCert] = useState('')
  const [base, setBase] = useState('')
  const [region, setRegion] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactCell, setContactCell] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [consentSms, setConsentSms] = useState(true)
  const [consentCall, setConsentCall] = useState(false)
  const [cargo, setCargo] = useState(true)
  const [pax, setPax] = useState(false)
  const [hazmat, setHazmat] = useState(false)
  const [ops24, setOps24] = useState(false)
  const [singleOk, setSingleOk] = useState(true)
  const [dual, setDual] = useState(false)
  const [night, setNight] = useState('Case-by-case')
  const [d085Name, setD085Name] = useState('')
  const [parsed, setParsed] = useState<D085AircraftRow[]>([])
  const [d085Meta, setD085Meta] = useState<Pick<D085ParseResult, 'source' | 'note'> | null>(
    null,
  )
  const [d085Busy, setD085Busy] = useState(false)
  const [selectedTails, setSelectedTails] = useState<string[]>([])
  const [rates, setRates] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)

  async function runD085Parse(file: File) {
    setD085Busy(true)
    setD085Name(file.name)
    try {
      const result = await parseD085File(file)
      setParsed(result.rows)
      setD085Meta({ source: result.source, note: result.note })
      setSelectedTails(result.rows.filter((r) => r.matched).map((r) => r.tail))
    } finally {
      setD085Busy(false)
    }
  }
  const [docFiles, setDocFiles] = useState<
    Partial<Record<OperatorDocKind, File | null>>
  >({})
  const [docExpiry, setDocExpiry] = useState<
    Partial<Record<OperatorDocKind, string>>
  >({})

  const completeness = useMemo(() => {
    const checks = [
      name.trim().length >= 2,
      base.trim().length >= 3,
      contactName.trim() || contactCell.trim(),
      cargo || pax,
      parsed.length > 0 || skipped.includes('d085'),
      Boolean(docFiles.charter_cert || docFiles.d085 || docFiles.coi) ||
        skipped.includes('documents') ||
        skipped.includes('insurance'),
      rates.trim() || skipped.includes('rates'),
    ]
    const filled = checks.filter(Boolean).length
    const penalty = skipped.length * 0.04
    return Math.max(
      0,
      Math.min(100, Math.round((filled / checks.length) * 100 - penalty * 100)),
    )
  }, [
    name,
    base,
    contactName,
    contactCell,
    cargo,
    pax,
    parsed,
    rates,
    skipped,
    docFiles,
  ])

  function skip() {
    const field = OP_STEPS[step]!.toLowerCase()
    setSkipped((s) => [...s, field])
    setStep((x) => Math.min(x + 1, OP_STEPS.length - 1))
  }

  async function save() {
    if (!name.trim()) return
    const aircraft = parsed
      .filter((p) => selectedTails.includes(p.tail))
      .map((p) => ({
        tail: p.tail,
        type_name: p.type_name,
        liability_limit: '',
        hull_value: '',
        insurance_expiry: '',
      }))
    const draft = saveOperatorDraft({
      name: name.trim(),
      dba,
      certificate: cert,
      base_icao: base.trim().toUpperCase(),
      region,
      contacts: [
        {
          name: contactName || 'Ops',
          role: 'ops',
          cell: contactCell,
          email: contactEmail,
          consent_sms: consentSms,
          consent_call: consentCall,
        },
      ],
      capabilities: {
        cargo,
        pax,
        hazmat,
        medivac: false,
        ops_24hr: ops24,
        callout_min: 60,
      },
      crew: {
        single_pilot_ok: singleOk,
        dual_available: dual,
        night_policy: night,
      },
      aircraft,
      rates_note: rates,
      completeness,
    })

    // Compliance docs — charter cert / D085 / COI (+ expiry for COI reminders)
    const compliance = ensureOperatorCompliance({
      operator_id: draft.id,
      operator_name: draft.name,
      contact_email: contactEmail,
    })
    for (const kind of ['charter_cert', 'd085', 'coi'] as OperatorDocKind[]) {
      const file = docFiles[kind]
      if (file) await setOperatorDocFile(compliance.operator_id, kind, file)
      const exp = docExpiry[kind]
      if (exp) setOperatorDocExpiry(compliance.operator_id, kind, exp)
    }
    for (const kind of ['charter_cert', 'd085', 'coi'] as OperatorDocKind[]) {
      if (!docFiles[kind]) {
        addNeedsInfoTask({
          entity_type: 'operator',
          entity_id: draft.id,
          entity_label: draft.name,
          field: kind,
          note: `Upload ${kind.replace('_', ' ')}`,
          wizard: 'operator',
        })
      }
    }
    if (docFiles.coi && !docExpiry.coi) {
      addNeedsInfoTask({
        entity_type: 'operator',
        entity_id: draft.id,
        entity_label: draft.name,
        field: 'coi_expiry',
        note: 'Set COI expiration date',
        wizard: 'operator',
      })
    }

    for (const field of skipped) {
      addNeedsInfoTask({
        entity_type: 'operator',
        entity_id: draft.id,
        entity_label: draft.name,
        field,
        note: `Skipped in wizard: ${field}`,
        wizard: 'operator',
      })
    }
    if (!rates.trim()) {
      addNeedsInfoTask({
        entity_type: 'operator',
        entity_id: draft.id,
        entity_label: draft.name,
        field: 'block_rates',
        note: 'Collect block rates',
        wizard: 'operator',
      })
    }
    for (const a of aircraft) {
      if (cargo && /king air|caravan|metro|navajo/i.test(a.type_name)) {
        addNeedsInfoTask({
          entity_type: 'aircraft',
          entity_id: `${draft.id}:${a.tail}`,
          entity_label: `${a.tail} · ${draft.name}`,
          field: 'cargo_door',
          note: 'Verify cargo door dims + floor config (conversion candidate)',
          wizard: 'operator',
        })
      }
    }
    // Every confirmed D085 tail enters ADS-B watch (takeoff / landing log)
    if (aircraft.length) {
      watchTailsFromD085({
        operator_id: draft.id,
        operator_name: draft.name,
        base_icao: draft.base_icao,
        aircraft: aircraft.map((a) => ({
          tail: a.tail,
          type_name: a.type_name,
        })),
      })
    }
    setSavedId(draft.id)
    setStep(OP_STEPS.length - 1)
  }

  return (
    <WizardShell
      title="Add operator"
      steps={OP_STEPS}
      step={step}
      completeness={completeness}
      onBack={() => setStep((x) => Math.max(0, x - 1))}
      onSkip={step < OP_STEPS.length - 1 ? skip : undefined}
      onNext={() => {
        if (step === OP_STEPS.length - 1) {
          if (!savedId) void save()
          return
        }
        if (step === 0 && name.trim().length < 2) return
        setStep((x) => x + 1)
      }}
      isLast={step === OP_STEPS.length - 1}
      nextLabel={savedId ? 'Saved' : 'Save operator'}
      aside={
        <Link to="/admin/tasks" className="mt-4 block text-xs text-gold">
          Open NEEDS-INFO tasks →
        </Link>
      }
    >
      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={wizardLabel}>
            Legal name
            <input className={wizardInput} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={wizardLabel}>
            DBA
            <input className={wizardInput} value={dba} onChange={(e) => setDba(e.target.value)} />
          </label>
          <label className={wizardLabel}>
            Certificate #
            <input className={wizardInput} value={cert} onChange={(e) => setCert(e.target.value)} />
          </label>
          <AirportSelect
            label="Base airport"
            value={base}
            required
            onChange={setBase}
          />
          <label className={`${wizardLabel} sm:col-span-2`}>
            Region
            <input className={wizardInput} value={region} onChange={(e) => setRegion(e.target.value)} />
          </label>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <label className={wizardLabel}>
            Ops contact name
            <input
              className={wizardInput}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={wizardLabel}>
              Cell
              <input
                className={wizardInput}
                value={contactCell}
                onChange={(e) => setContactCell(e.target.value)}
              />
            </label>
            <label className={wizardLabel}>
              Email
              <input
                className={wizardInput}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={consentSms}
              onChange={(e) => setConsentSms(e.target.checked)}
            />
            OK to text trip offers (TCPA)
          </label>
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={consentCall}
              onChange={(e) => setConsentCall(e.target.checked)}
            />
            OK to auto-call
          </label>
        </div>
      )}
      {step === 2 && (
        <div className="flex flex-wrap gap-4 text-sm text-cream">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cargo} onChange={(e) => setCargo(e.target.checked)} />
            Cargo
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pax} onChange={(e) => setPax(e.target.checked)} />
            Pax
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hazmat} onChange={(e) => setHazmat(e.target.checked)} />
            Hazmat willing
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ops24} onChange={(e) => setOps24(e.target.checked)} />
            24hr ops
          </label>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3 text-sm text-cream">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={singleOk}
              onChange={(e) => setSingleOk(e.target.checked)}
            />
            Single-pilot OK
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={dual} onChange={(e) => setDual(e.target.checked)} />
            Dual crews available
          </label>
          <label className={wizardLabel}>
            Night policy
            <input className={wizardInput} value={night} onChange={(e) => setNight(e.target.value)} />
          </label>
        </div>
      )}
      {step === 4 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Upload D085 → Claude extract (verify every tail before save). Prefer a
            text export when the PDF is a scan. File is also kept on Documents.
          </p>
          <input
            type="file"
            accept=".pdf,.txt,.csv"
            className="text-sm text-muted"
            disabled={d085Busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setDocFiles((d) => ({ ...d, d085: f }))
              void runD085Parse(f)
            }}
          />
          {d085Busy && (
            <p className="text-xs text-gold">Extracting aircraft…</p>
          )}
          {d085Name && !d085Busy && (
            <p className="text-xs text-gold">
              Parsed: {d085Name}
              {d085Meta ? ` · ${d085Meta.source}` : ''}
            </p>
          )}
          {d085Meta?.note && (
            <p className="text-xs text-muted">{d085Meta.note}</p>
          )}
          {parsed.length > 0 && (
            <>
              <ul className="space-y-2 sm:hidden">
                {parsed.map((r) => (
                  <li
                    key={r.tail}
                    className="flex items-start gap-3 rounded-md border border-border/60 bg-ink px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0"
                      checked={selectedTails.includes(r.tail)}
                      onChange={(e) => {
                        setSelectedTails((prev) =>
                          e.target.checked
                            ? [...prev, r.tail]
                            : prev.filter((t) => t !== r.tail),
                        )
                      }}
                      aria-label={`Use ${r.tail}`}
                    />
                    <div className="min-w-0">
                      <div className="avionic text-gold">{r.tail}</div>
                      <div className="text-sm text-cream">{r.type_name}</div>
                      {r.conflict && (
                        <div className="mt-0.5 text-xs text-late">{r.conflict}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="board-rail hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-2">Use</th>
                      <th className="py-2 pr-2">Tail</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r) => (
                      <tr
                        key={r.tail}
                        className="border-t border-border/50 text-cream"
                      >
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selectedTails.includes(r.tail)}
                            onChange={(e) => {
                              setSelectedTails((prev) =>
                                e.target.checked
                                  ? [...prev, r.tail]
                                  : prev.filter((t) => t !== r.tail),
                              )
                            }}
                          />
                        </td>
                        <td className="avionic py-2 pr-2">{r.tail}</td>
                        <td className="py-2 pr-2">{r.type_name}</td>
                        <td className="py-2 text-xs text-late">
                          {r.conflict ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
      {step === 5 && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Upload charter certificate, D085, and certificate of insurance.
            Track expiry on each — expired COIs trigger an email for an updated copy.
          </p>
          {(
            [
              ['charter_cert', 'Charter certificate'],
              ['d085', 'D085'],
              ['coi', 'Certificate of insurance'],
            ] as const
          ).map(([kind, label]) => (
            <div
              key={kind}
              className="rounded-md border border-border bg-surface-2/40 p-3"
            >
              <div className="text-sm font-medium text-cream">{label}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-muted">
                  File
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.txt"
                    className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-gold/20 file:px-2 file:py-1 file:text-gold"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setDocFiles((d) => ({ ...d, [kind]: f }))
                      if (kind === 'd085' && f && !parsed.length) {
                        void runD085Parse(f)
                      }
                    }}
                  />
                  {docFiles[kind] && (
                    <span className="mt-1 block text-xs text-cream">
                      {docFiles[kind]!.name}
                    </span>
                  )}
                </label>
                <label className="block text-xs text-muted">
                  Expires
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-border bg-ink px-2 py-1.5 text-sm text-cream"
                    value={docExpiry[kind] ?? ''}
                    onChange={(e) =>
                      setDocExpiry((d) => ({ ...d, [kind]: e.target.value }))
                    }
                  />
                </label>
              </div>
              {kind === 'coi' && (
                <p className="mt-2 text-[11px] text-muted">
                  On expiry we email {contactEmail || 'the ops contact'} for an
                  updated COI.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {step === 6 && (
        <label className={wizardLabel}>
          Block rates (per type)
          <textarea
            className={wizardInput}
            rows={3}
            value={rates}
            onChange={(e) => setRates(e.target.value)}
            placeholder="KA200 $1850/hr · Caravan $…"
          />
        </label>
      )}
      {step === 7 && (
        <div className="space-y-2 text-sm">
          <p className="text-cream">Completeness {completeness}%</p>
          {savedId ? (
            <p className="text-onplan">Saved operator draft. Tasks queued for gaps.</p>
          ) : (
            <p className="text-muted">Review and Save — skipped steps become tasks.</p>
          )}
          <ul className="text-gold">
            {skipped.map((s) => (
              <li key={s}>NEEDS-INFO: {s}</li>
            ))}
          </ul>
        </div>
      )}
    </WizardShell>
  )
}

function ClientWizard() {
  const [step, setStep] = useState(0)
  const [skipped, setSkipped] = useState<string[]>([])
  const [name, setName] = useState('')
  const [pay, setPay] = useState('Net 30')
  const [poPrefix, setPoPrefix] = useState('')
  const [requiresPo, setRequiresPo] = useState(false)
  const [dual, setDual] = useState(false)
  const [freight, setFreight] = useState(false)
  const [multi, setMulti] = useState(false)
  const [seTurboprop, setSeTurboprop] = useState(false)
  const [noSeNight, setNoSeNight] = useState(false)
  const [hazmatOk, setHazmatOk] = useState(true)
  const [hazmatNotes, setHazmatNotes] = useState('')
  const [declared, setDeclared] = useState('')
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [personRole, setPersonRole] = useState<ContactRole>('requester')
  const [apEmail, setApEmail] = useState('')
  const [apName, setApName] = useState('')
  const [saved, setSaved] = useState(false)

  const completeness = useMemo(() => {
    const checks = [
      !!name.trim(),
      !!pay.trim(),
      !!personEmail.trim() || skipped.includes('people'),
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [name, pay, personEmail, skipped])

  async function save() {
    if (!name.trim()) return
    const acct = createAccountingAdapter()
    const qb = await acct.ensureCustomer(name.trim())
    const contacts: Array<{
      name: string
      email: string
      role: ContactRole
    }> = []
    if (personEmail.trim()) {
      contacts.push({
        name: personName || personEmail.split('@')[0] || 'Contact',
        email: personEmail.trim(),
        role: personRole,
      })
    }
    const inv = apEmail.trim() || (personRole === 'ap' ? personEmail.trim() : '')
    if (inv && !contacts.some((c) => c.email.toLowerCase() === inv.toLowerCase())) {
      contacts.push({
        name: apName.trim() || inv.split('@')[0] || 'AP',
        email: inv,
        role: 'ap',
      })
    }
    const other: string[] = []
    if (requiresPo) other.push('PO required on invoices')
    const client = addClient({
      name,
      pay_terms: pay,
      po_prefix: poPrefix.trim().toUpperCase() || null,
      invoice_email: inv || undefined,
      qb_customer_id: qb,
      rules: {
        dual_pilot_required: dual,
        freight_only: freight,
        multi_engine_only: multi,
        single_engine_turboprop_only: seTurboprop,
        no_single_engine_night: noSeNight,
        hazmat_allowed: hazmatOk,
        hazmat_notes: hazmatNotes,
        declared_value_norm: declared,
        other_rules: other,
      },
      contacts,
      profile: {
        source: 'admin',
        requires_po: requiresPo,
      },
    })
    for (const field of skipped) {
      addNeedsInfoTask({
        entity_type: 'client',
        entity_id: client.id,
        entity_label: client.name,
        field,
        note: `Skipped in client wizard: ${field}`,
        wizard: 'client',
      })
    }
    setSaved(true)
    setStep(CLIENT_STEPS.length - 1)
  }

  return (
    <WizardShell
      title="Add client — rules interview"
      steps={CLIENT_STEPS}
      step={step}
      completeness={completeness}
      onBack={() => setStep((x) => Math.max(0, x - 1))}
      onSkip={
        step < CLIENT_STEPS.length - 1
          ? () => {
              setSkipped((s) => [...s, CLIENT_STEPS[step]!.toLowerCase()])
              setStep((x) => x + 1)
            }
          : undefined
      }
      onNext={() => {
        if (step === CLIENT_STEPS.length - 1) {
          if (!saved) void save()
          return
        }
        if (step === 0 && name.trim().length < 2) return
        setStep((x) => x + 1)
      }}
      isLast={step === CLIENT_STEPS.length - 1}
      nextLabel={saved ? 'Saved' : 'Save client'}
      aside={
        <Link to="/clients" className="mt-4 block text-xs text-gold">
          Open Clients directory →
        </Link>
      }
    >
      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={wizardLabel}>
            Company
            <input className={wizardInput} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={wizardLabel}>
            Pay terms
            <select
              className={wizardInput}
              value={pay}
              onChange={(e) => setPay(e.target.value)}
            >
              <option>Prepay / CC</option>
              <option>Net 15</option>
              <option>Net 30</option>
              <option>Net 60</option>
              <option>Other</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-cream sm:col-span-2">
            <input
              type="checkbox"
              checked={requiresPo}
              onChange={(e) => setRequiresPo(e.target.checked)}
            />
            Invoices require a PO number
          </label>
          {requiresPo && (
            <label className={wizardLabel}>
              PO prefix
              <input
                className={`${wizardInput} uppercase`}
                value={poPrefix}
                onChange={(e) => setPoPrefix(e.target.value)}
                placeholder="PSA"
              />
            </label>
          )}
          <p className="sm:col-span-2 text-xs text-muted">
            Same subjects as public{' '}
            <Link to="/client" className="text-gold">
              /client
            </Link>{' '}
            setup. For full address + emergency, send customers that link.
          </p>
        </div>
      )}
      {step === 1 && (
        <label className="flex items-center gap-2 text-sm text-cream">
          <input type="checkbox" checked={dual} onChange={(e) => setDual(e.target.checked)} />
          Two pilots required (dual_pilot_required)
        </label>
      )}
      {step === 2 && (
        <label className="flex items-center gap-2 text-sm text-cream">
          <input
            type="checkbox"
            checked={freight}
            onChange={(e) => setFreight(e.target.checked)}
          />
          Freight only — no passengers
        </label>
      )}
      {step === 3 && (
        <div className="space-y-2 text-sm text-cream">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
            Multi-engine only
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={seTurboprop}
              onChange={(e) => setSeTurboprop(e.target.checked)}
            />
            Single-engine OK only if turboprop
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={noSeNight}
              onChange={(e) => setNoSeNight(e.target.checked)}
            />
            No single-engine at night
          </label>
          <p className="text-xs text-muted">
            Soft prefs (jet OK, cargo door, etc.) live on the public /client
            form Other notes + preference checkboxes.
          </p>
        </div>
      )}
      {step === 4 && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={hazmatOk}
              onChange={(e) => setHazmatOk(e.target.checked)}
            />
            Hazmat allowed
          </label>
          <label className={wizardLabel}>
            Hazmat notes
            <input
              className={wizardInput}
              value={hazmatNotes}
              onChange={(e) => setHazmatNotes(e.target.value)}
            />
          </label>
          <label className={wizardLabel}>
            Declared value norms
            <input
              className={wizardInput}
              value={declared}
              onChange={(e) => setDeclared(e.target.value)}
            />
          </label>
        </div>
      )}
      {step === 5 && (
        <div className="space-y-3">
          <p className="text-xs text-late">
            Requester emails arm the intake phone ring — choose carefully. AP
            gets invoices only (matches /client people section).
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              className={wizardInput}
              placeholder="Primary name"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
            />
            <input
              className={wizardInput}
              placeholder="Primary email"
              value={personEmail}
              onChange={(e) => setPersonEmail(e.target.value)}
            />
            <select
              className={wizardInput}
              value={personRole}
              onChange={(e) => setPersonRole(e.target.value as ContactRole)}
            >
              <option value="requester">Requester (rings phone)</option>
              <option value="ap">AP (invoices)</option>
              <option value="supply_chain">Supply chain</option>
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={wizardInput}
              placeholder="AP name (optional)"
              value={apName}
              onChange={(e) => setApName(e.target.value)}
            />
            <input
              className={wizardInput}
              placeholder="AP invoice email"
              value={apEmail}
              onChange={(e) => setApEmail(e.target.value)}
            />
          </div>
        </div>
      )}
      {step === 6 && (
        <div className="text-sm text-cream">
          {saved ? (
            <p className="text-onplan">
              Client saved with rules chips. Manage contacts anytime on Clients.
            </p>
          ) : (
            <p className="text-muted">
              Save writes company, pay terms, routing rules, requester + AP —
              same fields as /client onboarding.
            </p>
          )}
        </div>
      )}
    </WizardShell>
  )
}

function FboWizard() {
  const [step, setStep] = useState(0)
  const [icao, setIcao] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [ahPhone, setAhPhone] = useState('')
  const [is24, setIs24] = useState(false)
  const [forklift, setForklift] = useState(false)
  const [capacity, setCapacity] = useState('')
  const [insured, setInsured] = useState(false)
  const [handling, setHandling] = useState('')
  const [waive, setWaive] = useState(false)
  const [notes, setNotes] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [saved, setSaved] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([])

  const completeness = useMemo(() => {
    const checks = [
      icao.length >= 3,
      !!name.trim(),
      !!phone.trim(),
      !!street.trim() || skipped.includes('airport'),
      forklift || skipped.includes('forklift'),
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [icao, name, phone, street, forklift, skipped])

  function save() {
    if (!icao.trim() || !name.trim()) return
    const needs: string[] = [...skipped]
    if (!ahPhone.trim() && !is24) needs.push('after_hours_phone')
    if (!street.trim()) needs.push('street')
    const row = addFbo({
      name: name.trim(),
      airport_icao: icao.trim().toUpperCase(),
      phone,
      after_hours_phone: ahPhone,
      is_24hr: is24,
      forklift,
      forklift_capacity_lbs: capacity ? Number(capacity) : null,
      gl_insurance: insured,
      gl_coverage: null,
      fee_handling: handling ? Number(handling) : null,
      fee_ramp: null,
      fee_overnight: null,
      fee_callout: null,
      fees_waived_with_fuel: waive,
      street,
      city,
      state,
      zip,
      lat: null,
      lon: null,
      notes,
      needs_info: needs,
    })
    for (const field of needs) {
      addNeedsInfoTask({
        entity_type: 'fbo',
        entity_id: row.id,
        entity_label: `${row.name} @ ${row.airport_icao}`,
        field,
        note: `FBO gap: ${field}`,
        wizard: 'fbo',
      })
    }
    setSaved(true)
    setStep(FBO_STEPS.length - 1)
  }

  return (
    <WizardShell
      title="Add FBO"
      steps={FBO_STEPS}
      step={step}
      completeness={completeness}
      onBack={() => setStep((x) => Math.max(0, x - 1))}
      onSkip={
        step < FBO_STEPS.length - 1
          ? () => {
              setSkipped((s) => [...s, FBO_STEPS[step]!.toLowerCase()])
              setStep((x) => x + 1)
            }
          : undefined
      }
      onNext={() => {
        if (step === FBO_STEPS.length - 1) {
          if (!saved) save()
          return
        }
        if (step === 0 && (icao.trim().length < 3 || !name.trim())) return
        setStep((x) => x + 1)
      }}
      isLast={step === FBO_STEPS.length - 1}
      nextLabel={saved ? 'Saved' : 'Save FBO'}
      aside={
        <Link to="/fbos" className="mt-4 block text-xs text-gold">
          Open FBO directory →
        </Link>
      }
    >
      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <AirportSelect
            label="Airport"
            value={icao}
            required
            onChange={setIcao}
          />
          <label className={wizardLabel}>
            FBO name
            <input className={wizardInput} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={wizardLabel}>
            Phone
            <input className={wizardInput} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className={wizardLabel}>
            After-hours phone
            <input
              className={wizardInput}
              value={ahPhone}
              onChange={(e) => setAhPhone(e.target.value)}
            />
          </label>
          <label className={`${wizardLabel} sm:col-span-2`}>
            Street address
            <input
              className={wizardInput}
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Ramp / FBO street"
            />
          </label>
          <label className={wizardLabel}>
            City
            <input className={wizardInput} value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className={wizardLabel}>
            State
            <input
              className={wizardInput}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              placeholder="OH"
            />
          </label>
          <label className={wizardLabel}>
            ZIP
            <input className={wizardInput} value={zip} onChange={(e) => setZip(e.target.value)} />
          </label>
        </div>
      )}
      {step === 1 && (
        <label className="flex items-center gap-2 text-sm text-cream">
          <input type="checkbox" checked={is24} onChange={(e) => setIs24(e.target.checked)} />
          24-hour operations
        </label>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={forklift}
              onChange={(e) => setForklift(e.target.checked)}
            />
            Forklift available
          </label>
          <label className={wizardLabel}>
            Capacity (lbs)
            <input
              className={wizardInput}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={insured}
              onChange={(e) => setInsured(e.target.checked)}
            />
            GL insurance on file
          </label>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <label className={wizardLabel}>
            Handling fee $
            <input
              className={wizardInput}
              value={handling}
              onChange={(e) => setHandling(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-cream">
            <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
            Fees waived with fuel
          </label>
          <label className={wizardLabel}>
            Notes
            <textarea
              className={wizardInput}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
      )}
      {step === 4 && (
        <p className="text-sm text-cream">
          {saved
            ? 'FBO saved — ranked for cargo when 24hr + forklift + insured.'
            : 'Save to add to FBO directory.'}
        </p>
      )}
    </WizardShell>
  )
}
