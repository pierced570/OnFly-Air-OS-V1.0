/**
 * Chat — simple roster of trips going out and who’s on them.
 * Trip state / lost / tracking live in Dispatch center waterfall.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import {
  CHAT_MEMBER_ROLES,
  formatChatMemberLine,
} from '@/domain/chatRoster'
import {
  addTripParticipant,
  listChatTrips,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'

function TripRosterCard({ trip }: { trip: TripStoreRow }) {
  const [openAdd, setOpenAdd] = useState(false)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('pilot')
  const members = trip.participants.filter((p) => !p.released_at)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    addTripParticipant(trip.id, { name, company, role })
    setName('')
    setCompany('')
    setRole('pilot')
    setOpenAdd(false)
  }

  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-cream">
          T-<span className="avionic">{trip.ref}</span>
          <span className="ml-2 font-normal text-muted">{trip.lane}</span>
        </h2>
        <span className="text-[11px] uppercase tracking-wider text-muted">
          {trip.state === 'in_progress' ? 'In progress' : 'Booked'}
        </span>
      </header>

      <ul className="mt-3 space-y-1.5">
        {members.length === 0 ? (
          <li className="text-sm text-muted">No members yet — add someone.</li>
        ) : (
          members.map((p) => (
            <li key={p.id} className="text-sm text-cream">
              {formatChatMemberLine(p)}
            </li>
          ))
        )}
      </ul>

      {!openAdd ? (
        <button
          type="button"
          className="mt-3 text-sm font-medium text-gold hover:text-gold-lt"
          onClick={() => setOpenAdd(true)}
        >
          + Add new member
        </button>
      ) : (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-3"
          onSubmit={submit}
        >
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
          <div className="flex flex-wrap gap-2 sm:col-span-3">
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
        ...t.participants.map((p) =>
          formatChatMemberLine(p),
        ),
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
          {"Who's on trips going out — name, company, role. Trip status lives in "}
          Dispatch center.
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
          No booked or in-progress trips yet. Book from Dispatch center, then
          add members here.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TripRosterCard key={t.id} trip={t} />
          ))}
        </div>
      )}
    </div>
  )
}
