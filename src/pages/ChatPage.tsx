/**
 * Trip contacts — click-to-call roster for booked / live trips.
 * Opens from Dispatch “Trip contacts” or live-trip Trip contacts.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { TripContactLine } from '@/domain/tripContacts'
import { listTripContactsForDesk } from '@/lib/tripContacts'
import {
  listChatTrips,
  listTripsStable,
  subscribeTrips,
  type TripStoreRow,
} from '@/lib/tripStore'

function ContactRows({ lines }: { lines: TripContactLine[] }) {
  if (!lines.length) return null
  return (
    <ul className="mt-1.5 space-y-1.5">
      {lines.map((line) => (
        <li
          key={line.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-ink/30 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold text-cream">{line.label}</div>
            <div className="text-[11px] text-muted">
              {line.company}
              {line.roleLabel ? ` · ${line.roleLabel}` : ''}
            </div>
          </div>
          <a
            href={line.telHref}
            className="avionic shrink-0 rounded-md border border-gold/40 px-3 py-2 text-sm font-semibold text-gold hover:bg-gold/10"
          >
            {line.phoneDisplay}
          </a>
        </li>
      ))}
    </ul>
  )
}

function TripContactsCard({
  trip,
  expanded,
}: {
  trip: TripStoreRow
  expanded?: boolean
}) {
  const [open, setOpen] = useState(Boolean(expanded))
  const contacts = useMemo(() => listTripContactsForDesk(trip), [trip])

  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-cream">
            T-<span className="avionic">{trip.ref}</span>
            <span className="ml-2 font-normal text-muted">{trip.lane}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {trip.state === 'in_progress' ? 'Live tracking' : 'Booked'}
            {trip.client_name ? ` · ${trip.client_name}` : ''}
            {contacts.lines.length
              ? ` · ${contacts.lines.length} number${contacts.lines.length === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        <button
          type="button"
          className={[
            'min-h-11 rounded-md px-3 py-2.5 text-xs font-semibold',
            open
              ? 'border border-gold/50 bg-gold/10 text-gold'
              : 'bg-gold text-ink hover:bg-gold-lt',
          ].join(' ')}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close contacts' : 'Trip contacts'}
        </button>
      </header>

      {!open ? (
        <ul className="mt-3 space-y-1 text-sm text-cream/80">
          {contacts.lines.length === 0 ? (
            <li className="text-muted">No phones on file yet.</li>
          ) : (
            contacts.lines.slice(0, 4).map((line) => (
              <li key={line.id} className="flex flex-wrap gap-x-2">
                <span className="text-muted">{line.label}</span>
                <a href={line.telHref} className="avionic text-gold">
                  {line.phoneDisplay}
                </a>
              </li>
            ))
          )}
        </ul>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="text-[11px] text-muted">
            Tap a number to call while the trip is live — client inbound /
            contacts and the charter operator.
          </p>
          {contacts.lines.length === 0 ? (
            <p className="text-sm text-muted">
              Add phones on the client profile or operator offer contact cell.
            </p>
          ) : (
            <>
              {contacts.client.length ? (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted">
                    Client
                  </div>
                  <ContactRows lines={contacts.client} />
                </div>
              ) : null}
              {contacts.operator.length ? (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted">
                    Charter operator
                  </div>
                  <ContactRows lines={contacts.operator} />
                </div>
              ) : null}
              {contacts.crew.length ? (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted">
                    Crew / ground
                  </div>
                  <ContactRows lines={contacts.crew} />
                </div>
              ) : null}
            </>
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
    return list.filter((t) => {
      const contacts = listTripContactsForDesk(t)
      return [
        t.ref,
        t.lane,
        t.client_name,
        ...contacts.lines.map(
          (l) => `${l.label} ${l.company} ${l.phoneDisplay}`,
        ),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [chatTrips, q, paramId])

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-cream">Trip contacts</h1>
        <p className="text-sm text-muted">
          Click-to-call phones for booked and live trips — client inbound and
          charter operator. Also on each live trip under{' '}
          <Link
            className="text-gold hover:text-gold-lt"
            to="/dispatch?drawer=tracking"
          >
            Live tracking
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
          placeholder="Client, operator, T-ref, lane, phone…"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          No booked or live trips yet. Approve a trip or start live tracking to
          see trip contacts here.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TripContactsCard
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
