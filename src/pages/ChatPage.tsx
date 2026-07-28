/**
 * Chat — trip group chat for booked / live trips.
 * Access from Live tracking “Access chat” or /chat/:tripId.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TripThreadPanel } from '@/components/TripThreadPanel'
import {
  CHAT_MEMBER_ROLES,
  formatChatMemberLine,
} from '@/domain/chatRoster'
import {
  addTripParticipant,
  ensureTripThread,
  listChatTrips,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'

function TripChatCard({
  trip,
  expanded,
}: {
  trip: TripStoreRow
  expanded?: boolean
}) {
  const [open, setOpen] = useState(Boolean(expanded))
  const [openAdd, setOpenAdd] = useState(false)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('pilot')
  const [cell, setCell] = useState('')
  const members = trip.participants.filter((p) => !p.released_at)
  const threadMembers = members.filter((p) => p.in_thread)

  useEffect(() => {
    if (!open) return
    if (trip.thread_number && !trip.thread_disbanded_at) return
    void ensureTripThread(trip.id)
  }, [open, trip.id, trip.thread_number, trip.thread_disbanded_at])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    addTripParticipant(trip.id, {
      name,
      company,
      role,
      cell: cell.trim() || undefined,
    })
    setName('')
    setCompany('')
    setRole('pilot')
    setCell('')
    setOpenAdd(false)
  }

  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-cream">
            T-<span className="avionic">{trip.ref}</span>
            <span className="ml-2 font-normal text-muted">{trip.lane}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {trip.state === 'in_progress' ? 'Live tracking' : 'Booked'} ·{' '}
            {threadMembers.length} on group chat
          </p>
        </div>
        <button
          type="button"
          className={[
            'rounded-md px-3 py-1.5 text-xs font-semibold',
            open
              ? 'border border-gold/50 bg-gold/10 text-gold'
              : 'bg-gold text-ink hover:bg-gold-lt',
          ].join(' ')}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close chat' : 'Access chat'}
        </button>
      </header>

      {!open ? (
        <ul className="mt-3 space-y-1.5">
          {members.length === 0 ? (
            <li className="text-sm text-muted">No members yet.</li>
          ) : (
            members.map((p) => (
              <li key={p.id} className="text-sm text-cream">
                {formatChatMemberLine(p)}
                {p.in_thread ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
                    chat
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded-md border border-border/50 bg-ink/40 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Group chat members
            </div>
            <ul className="mt-1.5 space-y-1 text-sm text-cream">
              {threadMembers.length === 0 ? (
                <li className="text-muted">
                  Add ops members below to put them on the group chat.
                </li>
              ) : (
                threadMembers.map((p) => (
                  <li key={p.id}>{formatChatMemberLine(p)}</li>
                ))
              )}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              Ops group thread — dispatch, crew, ground, FBO. Clients stay on
              the tracking portal.
            </p>
          </div>

          <TripThreadPanel trip={trip} tall title="Trip group chat" />

          {!openAdd ? (
            <button
              type="button"
              className="text-sm font-medium text-gold hover:text-gold-lt"
              onClick={() => setOpenAdd(true)}
            >
              + Add chat member
            </button>
          ) : (
            <form className="grid gap-2 sm:grid-cols-2" onSubmit={submit}>
              <input
                className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
              <input
                className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
              <select
                className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {CHAT_MEMBER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <input
                className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
                placeholder="Cell (SMS thread)"
                value={cell}
                onChange={(e) => setCell(e.target.value)}
              />
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
                >
                  Add member
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-2 text-sm text-muted"
                  onClick={() => setOpenAdd(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  )
}

export default function ChatPage() {
  const { tripId: paramId } = useParams()
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const chatTrips = useMemo(() => listChatTrips(), [trips])
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = chatTrips
    if (paramId) {
      list = list.filter((t) => t.id === paramId)
      if (!list.length) list = chatTrips
    }
    if (!needle) return list
    return list.filter((t) =>
      [
        t.ref,
        t.lane,
        ...t.participants.map((p) => formatChatMemberLine(p)),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [chatTrips, q, paramId])

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-cream">Chat</h1>
        <p className="text-sm text-muted">
          Group chat for everyone on the trip ops thread. Live tracking also
          opens this from{' '}
          <Link className="text-gold hover:text-gold-lt" to="/dispatch?drawer=tracking">
            Dispatch center
          </Link>
          .
        </p>
      </header>

      <label className="block text-xs text-muted">
        Search
        <input
          className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, company, T-ref, lane…"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          No booked or live trips yet. Approve a trip, start live tracking, then
          Access chat.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TripChatCard
              key={t.id}
              trip={t}
              expanded={Boolean(paramId && t.id === paramId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
