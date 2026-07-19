/**
 * Dispatcher Participants panel — add people, text invite links, disband + bank.
 *
 * Model (blueprint M8):
 * - Vendors/ops chat via SMS trip thread (not the client portal)
 * - Clients get portal / tracking links (not on the ops thread by default)
 */

import { useState } from 'react'
import {
  addTripParticipant,
  disbandTripComms,
  ensureTripThread,
  inviteTripParticipant,
  releaseTripParticipant,
  type TripStoreRow,
} from '@/lib/tripStore'
import { roleOnOpsThread } from '@/domain/tripThread'

const ROLES = [
  { value: 'operator_ops', label: 'Operator ops' },
  { value: 'pilot', label: 'Pilot' },
  { value: 'driver', label: 'Driver / truck' },
  { value: 'fbo', label: 'FBO' },
  { value: 'client_supply', label: 'Client (tracker)' },
  { value: 'client_ap', label: 'Client AP' },
  { value: 'other', label: 'Other' },
] as const

export function ParticipantsPanel({ trip }: { trip: TripStoreRow }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<string>('driver')
  const [cell, setCell] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [bankOnDisband, setBankOnDisband] = useState(true)
  const [promote, setPromote] = useState(true)

  const active = trip.participants.filter((p) => !p.released_at)
  const released = trip.participants.filter((p) => p.released_at)

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Participants &amp; comms
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Vendors coordinate on the SMS trip thread. Clients get a tracking /
            portal link — they are not on the ops chat.
          </p>
        </div>
        {trip.thread_number && !trip.thread_disbanded_at ? (
          <div className="avionic rounded border border-gold/40 bg-gold/10 px-2 py-1 text-xs text-gold">
            Thread {trip.thread_number}
          </div>
        ) : trip.thread_disbanded_at ? (
          <div className="rounded border border-border px-2 py-1 text-xs text-muted">
            Comms disbanded
          </div>
        ) : (
          <button
            type="button"
            className="text-xs text-gold underline"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void ensureTripThread(trip.id)
                .then((n) =>
                  setMsg(n ? `Thread ${n} assigned` : 'No free thread number'),
                )
                .finally(() => setBusy(false))
            }}
          >
            Open trip thread
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-2 text-sm">
        {active.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-start justify-between gap-2 border-b border-border/40 pb-2 last:border-0"
          >
            <div>
              <div className="text-cream">{p.name || '—'}</div>
              <div className="text-[11px] text-muted">
                {p.role}
                {p.cell ? ` · ${p.cell}` : ''}
                {p.email ? ` · ${p.email}` : ''}
                {p.in_thread ? ' · on thread' : ' · portal/tracker'}
                {p.invite_sent_at ? ' · invited' : ''}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!trip.thread_disbanded_at && (
                <button
                  type="button"
                  className="text-xs text-gold"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void inviteTripParticipant(trip.id, p.id)
                      .then((r) => setMsg(r.ok ? r.detail : r.detail))
                      .finally(() => setBusy(false))
                  }}
                >
                  {roleOnOpsThread(p.role) ? 'Text intro' : 'Send link'}
                </button>
              )}
              {p.in_thread && !p.released_at && !trip.thread_disbanded_at && (
                <button
                  type="button"
                  className="text-xs text-muted hover:text-late"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void releaseTripParticipant(trip.id, p.id).finally(() =>
                      setBusy(false),
                    )
                  }}
                >
                  Release
                </button>
              )}
            </div>
          </li>
        ))}
        {active.length === 0 && (
          <li className="text-muted">No participants yet — add below.</li>
        )}
      </ul>

      {!trip.thread_disbanded_at && (
        <form
          className="mt-4 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            const p = addTripParticipant(trip.id, {
              name,
              role,
              cell,
              email,
            })
            setName('')
            setCell('')
            setEmail('')
            setMsg(`Added ${p.name}`)
            if (cell || email) {
              setBusy(true)
              void inviteTripParticipant(trip.id, p.id)
                .then((r) => setMsg(r.detail))
                .finally(() => setBusy(false))
            }
          }}
        >
          <input
            className="rounded border border-border bg-black/30 px-2 py-1.5 text-sm text-cream"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <select
            className="rounded border border-border bg-black/30 px-2 py-1.5 text-sm text-cream"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            className="avionic rounded border border-border bg-black/30 px-2 py-1.5 text-sm text-cream"
            placeholder="Cell (+1…)"
            value={cell}
            onChange={(e) => setCell(e.target.value)}
          />
          <input
            className="rounded border border-border bg-black/30 px-2 py-1.5 text-sm text-cream"
            placeholder="Email (portal / tracker)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            className="rounded bg-gold px-3 py-2 text-xs font-medium text-ink sm:col-span-2"
          >
            Add &amp; send invite
          </button>
        </form>
      )}

      {(trip.state === 'delivered' ||
        trip.state === 'invoiced' ||
        trip.state === 'closed' ||
        trip.state === 'cancelled') &&
        !trip.thread_disbanded_at && (
          <div className="mt-4 rounded border border-late/30 bg-late/5 p-3">
            <div className="text-xs font-medium text-cream">
              Disband trip communications
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Texts everyone on the thread that it is closed, frees the trip
              number, expires one-tap links. Contacts can be banked for next
              time.
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={bankOnDisband}
                onChange={(e) => setBankOnDisband(e.target.checked)}
              />
              Bank contacts (keep for future trips)
            </label>
            {bankOnDisband && trip.client_id && (
              <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={promote}
                  onChange={(e) => setPromote(e.target.checked)}
                />
                Also add client-side people to this client’s contact list
              </label>
            )}
            <button
              type="button"
              className="mt-3 rounded border border-late/50 px-3 py-1.5 text-xs text-late hover:bg-late/10"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void disbandTripComms(trip.id, {
                  bankContacts: bankOnDisband,
                  promoteToClient: promote,
                })
                  .then((r) =>
                    setMsg(
                      `Comms closed · banked ${r.banked}` +
                        (r.promoted ? ` · promoted ${r.promoted}` : ''),
                    ),
                  )
                  .finally(() => setBusy(false))
              }}
            >
              Disband all trip comms
            </button>
          </div>
        )}

      {released.length > 0 && (
        <details className="mt-3 text-xs text-muted">
          <summary>Released ({released.length})</summary>
          <ul className="mt-1 space-y-1">
            {released.map((p) => (
              <li key={p.id}>
                {p.name} · {p.role}
              </li>
            ))}
          </ul>
        </details>
      )}

      {msg && <p className="mt-2 text-xs text-gold">{msg}</p>}
    </section>
  )
}
