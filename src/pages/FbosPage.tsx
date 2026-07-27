/**
 * FBO directory — add / edit / delete inline on Network → FBOs.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AirportSelect } from '@/components/AirportSelect'
import { lookupAirport } from '@/domain/airports'
import {
  addFbo,
  deleteFbo,
  fboNeedsInfoFrom,
  listFbos,
  rankFbosForCargo,
  subscribeFbos,
  updateFbo,
  type FboRow,
} from '@/lib/fboStore'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold placeholder:text-muted'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'

type FboFormState = {
  airport_icao: string
  name: string
  phone: string
  after_hours_phone: string
  street: string
  city: string
  state: string
  zip: string
  is_24hr: boolean
  forklift: boolean
  forklift_capacity_lbs: string
  gl_insurance: boolean
  gl_coverage: string
  fee_handling: string
  fee_ramp: string
  fee_overnight: string
  fee_callout: string
  fees_waived_with_fuel: boolean
  notes: string
}

function emptyForm(icao = ''): FboFormState {
  return {
    airport_icao: icao,
    name: '',
    phone: '',
    after_hours_phone: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    is_24hr: false,
    forklift: false,
    forklift_capacity_lbs: '',
    gl_insurance: false,
    gl_coverage: '',
    fee_handling: '',
    fee_ramp: '',
    fee_overnight: '',
    fee_callout: '',
    fees_waived_with_fuel: false,
    notes: '',
  }
}

function formFromRow(f: FboRow): FboFormState {
  return {
    airport_icao: f.airport_icao,
    name: f.name,
    phone: f.phone,
    after_hours_phone: f.after_hours_phone,
    street: f.street,
    city: f.city,
    state: f.state,
    zip: f.zip,
    is_24hr: f.is_24hr,
    forklift: f.forklift,
    forklift_capacity_lbs:
      f.forklift_capacity_lbs != null ? String(f.forklift_capacity_lbs) : '',
    gl_insurance: f.gl_insurance,
    gl_coverage: f.gl_coverage != null ? String(f.gl_coverage) : '',
    fee_handling: f.fee_handling != null ? String(f.fee_handling) : '',
    fee_ramp: f.fee_ramp != null ? String(f.fee_ramp) : '',
    fee_overnight: f.fee_overnight != null ? String(f.fee_overnight) : '',
    fee_callout: f.fee_callout != null ? String(f.fee_callout) : '',
    fees_waived_with_fuel: f.fees_waived_with_fuel,
    notes: f.notes,
  }
}

function parseMoney(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t.replace(/[,$]/g, ''))
  return Number.isFinite(n) ? n : null
}

function toRowFields(form: FboFormState) {
  const airport_icao = form.airport_icao.trim().toUpperCase()
  const ap = lookupAirport(airport_icao)
  const fields = {
    name: form.name.trim(),
    airport_icao,
    phone: form.phone.trim(),
    after_hours_phone: form.after_hours_phone.trim(),
    is_24hr: form.is_24hr,
    forklift: form.forklift,
    forklift_capacity_lbs: form.forklift
      ? parseMoney(form.forklift_capacity_lbs)
      : null,
    gl_insurance: form.gl_insurance,
    gl_coverage: form.gl_insurance ? parseMoney(form.gl_coverage) : null,
    fee_handling: parseMoney(form.fee_handling),
    fee_ramp: parseMoney(form.fee_ramp),
    fee_overnight: parseMoney(form.fee_overnight),
    fee_callout: parseMoney(form.fee_callout),
    fees_waived_with_fuel: form.fees_waived_with_fuel,
    street: form.street.trim(),
    city: form.city.trim() || ap?.city || '',
    state: form.state.trim().toUpperCase() || ap?.state || '',
    zip: form.zip.trim(),
    lat: ap?.lat ?? null,
    lon: ap?.lon ?? null,
    notes: form.notes.trim(),
  }
  return {
    ...fields,
    needs_info: fboNeedsInfoFrom(fields),
    last_verified: new Date().toISOString().slice(0, 10),
  }
}

function FboEditorForm({
  title,
  initial,
  onCancel,
  onSave,
}: {
  title: string
  initial: FboFormState
  onCancel: () => void
  onSave: (form: FboFormState) => string | null
}) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(initial)
    setError(null)
  }, [initial])

  function patch(p: Partial<FboFormState>) {
    setForm((f) => ({ ...f, ...p }))
  }

  // Prefill city/state from airport catalog when ICAO changes and fields empty.
  useEffect(() => {
    const ap = lookupAirport(form.airport_icao)
    if (!ap) return
    setForm((f) => ({
      ...f,
      city: f.city.trim() ? f.city : ap.city,
      state: f.state.trim() ? f.state : ap.state,
    }))
  }, [form.airport_icao])

  return (
    <div className="space-y-3 rounded-lg border border-gold/40 bg-gold/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gold">{title}</h2>
        <button
          type="button"
          className="text-xs text-muted hover:text-cream"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">
        General details for cargo ranking — airport, contacts, hours, forklift,
        insurance, and fees.
      </p>
      {error ? <p className="text-sm text-late">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <AirportSelect
          label="Airport"
          value={form.airport_icao}
          required
          onChange={(icao) => patch({ airport_icao: icao })}
        />
        <label className={label}>
          FBO name *
          <input
            className={input}
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Wilson Air Center"
          />
        </label>
        <label className={label}>
          Phone
          <input
            className={input}
            value={form.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            placeholder="+1…"
          />
        </label>
        <label className={label}>
          After-hours phone
          <input
            className={input}
            value={form.after_hours_phone}
            onChange={(e) => patch({ after_hours_phone: e.target.value })}
            placeholder="+1…"
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Street address
          <input
            className={input}
            value={form.street}
            onChange={(e) => patch({ street: e.target.value })}
            placeholder="Ramp / FBO street"
          />
        </label>
        <label className={label}>
          City
          <input
            className={input}
            value={form.city}
            onChange={(e) => patch({ city: e.target.value })}
          />
        </label>
        <label className={label}>
          State
          <input
            className={input}
            value={form.state}
            onChange={(e) => patch({ state: e.target.value.toUpperCase() })}
            placeholder="TN"
          />
        </label>
        <label className={label}>
          ZIP
          <input
            className={input}
            value={form.zip}
            onChange={(e) => patch({ zip: e.target.value })}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-cream">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_24hr}
            onChange={(e) => patch({ is_24hr: e.target.checked })}
          />
          24-hour operations
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.forklift}
            onChange={(e) => patch({ forklift: e.target.checked })}
          />
          Forklift
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.gl_insurance}
            onChange={(e) => patch({ gl_insurance: e.target.checked })}
          />
          GL insurance
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.fees_waived_with_fuel}
            onChange={(e) => patch({ fees_waived_with_fuel: e.target.checked })}
          />
          Fees waived with fuel
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          Forklift capacity (lb)
          <input
            className={input}
            inputMode="numeric"
            disabled={!form.forklift}
            value={form.forklift_capacity_lbs}
            onChange={(e) => patch({ forklift_capacity_lbs: e.target.value })}
            placeholder="8000"
          />
        </label>
        <label className={label}>
          GL coverage $
          <input
            className={input}
            inputMode="numeric"
            disabled={!form.gl_insurance}
            value={form.gl_coverage}
            onChange={(e) => patch({ gl_coverage: e.target.value })}
            placeholder="5000000"
          />
        </label>
        <label className={label}>
          Handling fee $
          <input
            className={input}
            inputMode="decimal"
            value={form.fee_handling}
            onChange={(e) => patch({ fee_handling: e.target.value })}
            placeholder="70"
          />
        </label>
        <label className={label}>
          Ramp fee $
          <input
            className={input}
            inputMode="decimal"
            value={form.fee_ramp}
            onChange={(e) => patch({ fee_ramp: e.target.value })}
          />
        </label>
        <label className={label}>
          Overnight fee $
          <input
            className={input}
            inputMode="decimal"
            value={form.fee_overnight}
            onChange={(e) => patch({ fee_overnight: e.target.value })}
          />
        </label>
        <label className={label}>
          Callout fee $
          <input
            className={input}
            inputMode="decimal"
            value={form.fee_callout}
            onChange={(e) => patch({ fee_callout: e.target.value })}
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Notes
          <input
            className={input}
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Cargo desk, gate codes, …"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-lt"
          onClick={() => {
            const err = onSave(form)
            if (err) setError(err)
          }}
        >
          Save FBO
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold/40"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function FbosPage({
  embedded = false,
}: {
  embedded?: boolean
}) {
  const fbos = useSyncExternalStore(subscribeFbos, listFbos, listFbos)
  const [q, setQ] = useState('')
  const [rankIcao, setRankIcao] = useState('')
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formSeed, setFormSeed] = useState<FboFormState>(() => emptyForm())
  const [flash, setFlash] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return fbos
    return fbos.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        f.airport_icao.toLowerCase().includes(needle) ||
        f.city.toLowerCase().includes(needle),
    )
  }, [fbos, q])

  const ranked = rankIcao.trim().length >= 3 ? rankFbosForCargo(rankIcao) : []
  const editing = editingId ? fbos.find((f) => f.id === editingId) : null

  function openAdd() {
    setMode('add')
    setEditingId(null)
    setFormSeed(emptyForm(rankIcao.trim().toUpperCase()))
    setFlash(null)
  }

  function openEdit(f: FboRow) {
    setMode('edit')
    setEditingId(f.id)
    setFormSeed(formFromRow(f))
    setFlash(null)
  }

  function closeForm() {
    setMode('list')
    setEditingId(null)
    setFormSeed(emptyForm())
  }

  function saveForm(form: FboFormState): string | null {
    if (form.airport_icao.trim().length < 3) return 'Pick an airport (ICAO)'
    if (!form.name.trim()) return 'FBO name is required'
    const fields = toRowFields(form)
    if (mode === 'edit' && editingId) {
      updateFbo(editingId, fields)
      setFlash(`Updated ${fields.name}`)
    } else {
      addFbo(fields)
      setFlash(`Added ${fields.name}`)
    }
    closeForm()
    return null
  }

  function onDelete(f: FboRow) {
    if (
      !window.confirm(
        `Delete ${f.name} @ ${f.airport_icao}? This cannot be undone.`,
      )
    ) {
      return
    }
    deleteFbo(f.id)
    if (editingId === f.id) closeForm()
    setFlash(`Deleted ${f.name}`)
  }

  return (
    <div
      className={
        embedded
          ? 'flex flex-col gap-4'
          : 'flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8'
      }
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className={
              embedded
                ? 'text-lg font-semibold text-cream'
                : 'text-2xl font-semibold text-cream'
            }
          >
            FBOs
          </h1>
          <p className="mt-1 text-sm text-muted">
            Survey data for airport choice — 24hr + forklift + insured ranks
            first on cargo. Add, edit, or delete here.
          </p>
        </div>
        {mode === 'list' ? (
          <button
            type="button"
            onClick={openAdd}
            className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
          >
            + Add FBO
          </button>
        ) : null}
      </header>

      {flash ? <p className="text-sm text-onplan">{flash}</p> : null}

      {mode !== 'list' ? (
        <FboEditorForm
          title={mode === 'edit' ? `Edit ${editing?.name ?? 'FBO'}` : 'Add FBO'}
          initial={formSeed}
          onCancel={closeForm}
          onSave={saveForm}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, city, or ICAO…"
          className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
        />
        <AirportSelect
          label="Rank cargo FBOs at"
          value={rankIcao}
          onChange={setRankIcao}
          placeholder="Search airport…"
        />
      </div>

      {ranked.length > 0 && (
        <section className="rounded-lg border border-gold/40 bg-gold/10 p-4">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            Cargo rank @ {rankIcao.toUpperCase()}
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-cream">
            {ranked.map((f) => (
              <li key={f.id}>
                {f.name}
                <span className="ml-2 text-xs text-muted">
                  {[
                    f.is_24hr && '24hr',
                    f.forklift && 'forklift',
                    f.gl_insurance && 'insured',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <ul className="space-y-2">
        {filtered.map((f) => {
          const ap = lookupAirport(f.airport_icao)
          const editingThis = mode === 'edit' && editingId === f.id
          return (
            <li
              key={f.id}
              className={[
                'rounded-lg border bg-surface px-4 py-3',
                editingThis ? 'border-gold/50' : 'border-border',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="avionic text-gold">{f.airport_icao}</span>
                  {ap && (
                    <span className="ml-1 text-xs text-muted">
                      {ap.city}, {ap.state}
                    </span>
                  )}
                  <span className="ml-2 font-medium text-cream">{f.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted">
                    verified {f.last_verified}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-gold hover:text-gold-lt"
                    onClick={() => openEdit(f)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-late hover:underline"
                    onClick={() => onDelete(f)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {(f.street || f.city) && (
                <p className="mt-1 text-xs text-cream">
                  {[f.street, f.city, f.state, f.zip].filter(Boolean).join(', ')}
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                {f.is_24hr && <span className="text-onplan">24hr</span>}
                {f.forklift && (
                  <span>
                    forklift
                    {f.forklift_capacity_lbs
                      ? ` ${f.forklift_capacity_lbs.toLocaleString()} lb`
                      : ''}
                  </span>
                )}
                {f.gl_insurance && <span>GL insured</span>}
                {f.fee_handling != null && (
                  <span>handling ${f.fee_handling}</span>
                )}
                {f.phone && <span className="avionic">{f.phone}</span>}
                {f.after_hours_phone && (
                  <span className="avionic">AH {f.after_hours_phone}</span>
                )}
              </div>
              {f.needs_info.length > 0 && (
                <p className="mt-1 text-xs text-late">
                  NEEDS-INFO: {f.needs_info.join(', ')}
                </p>
              )}
            </li>
          )
        })}
        {!filtered.length ? (
          <li className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No FBOs match — try Add FBO or clear search.
          </li>
        ) : null}
      </ul>
    </div>
  )
}
