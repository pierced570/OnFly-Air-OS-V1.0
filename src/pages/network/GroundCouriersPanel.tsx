/**
 * Ground courier / hotshot directory inside Network hub.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  listGroundCouriers,
  removeGroundCourier,
  subscribeGroundCouriers,
  upsertGroundCourier,
} from '@/lib/groundCourierStore'

export function GroundCouriersPanel() {
  const rows = useSyncExternalStore(
    subscribeGroundCouriers,
    listGroundCouriers,
    listGroundCouriers,
  )
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [areas, setAreas] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) =>
      [r.name, r.phone, r.email, r.service_areas, r.notes]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [rows, q])

  function add() {
    try {
      upsertGroundCourier({
        name,
        phone,
        email,
        service_areas: areas,
        notes,
      })
      setName('')
      setPhone('')
      setEmail('')
      setAreas('')
      setNotes('')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-cream">Ground couriers</h2>
        <p className="mt-1 text-sm text-muted">
          Hotshot and trucking contacts for pickup / delivery legs. Incomplete
          rows stay listed — fill contacts when you have them.
        </p>
      </header>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, phone, area…"
        className="w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
      />

      <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted">
          Add courier
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company / driver name"
            className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="rounded-md border border-border bg-ink px-3 py-2 font-mono text-sm text-cream"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
          />
          <input
            value={areas}
            onChange={(e) => setAreas(e.target.value)}
            placeholder="Service areas (CLE · CAK · OH)"
            className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream sm:col-span-2"
          />
        </div>
        {error && <p className="text-xs text-late">{error}</p>}
        <button
          type="button"
          onClick={add}
          className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
        >
          Save courier
        </button>
      </section>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No ground couriers yet.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-ink px-4 py-3"
            >
              <div>
                <div className="font-medium text-cream">{r.name}</div>
                <div className="mt-0.5 font-mono text-xs text-muted">
                  {[r.phone, r.email].filter(Boolean).join(' · ') ||
                    'No contact yet'}
                </div>
                {r.service_areas ? (
                  <div className="mt-1 text-xs text-gold">{r.service_areas}</div>
                ) : null}
                {r.notes ? (
                  <div className="mt-1 text-xs text-muted">{r.notes}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs text-muted hover:text-late"
                onClick={() => removeGroundCourier(r.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
