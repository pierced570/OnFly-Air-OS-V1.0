/**
 * Live tracking card actions — portal link + Access chat only.
 * Chat = ops group thread (everybody on the trip thread).
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { TripThreadPanel } from '@/components/TripThreadPanel'
import { formatChatMemberLine } from '@/domain/chatRoster'
import { portalTrackingUrlForTrip } from '@/lib/etaSheetSender'
import {
  ensureTripThread,
  getTrip,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

type Props = {
  tripId: string
}

export function LiveTrackingCardActions({ tripId }: Props) {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = trips.find((t) => t.id === tripId) ?? getTrip(tripId)
  const [chatOpen, setChatOpen] = useState(false)
  const [ensuring, setEnsuring] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!chatOpen || !trip) return
    if (trip.thread_number && !trip.thread_disbanded_at) return
    setEnsuring(true)
    void ensureTripThread(trip.id)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setEnsuring(false))
  }, [chatOpen, trip])

  if (!trip) return null

  const members = trip.participants.filter(
    (p) => p.in_thread && !p.released_at,
  )
  const trackUrl = portalTrackingUrlForTrip(trip.id)

  return (
    <div className="mt-3 space-y-3 border-t border-gold/30 pt-3">
      <div className="flex flex-wrap gap-2">
        <a
          href={trackUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-cream hover:border-gold/40"
        >
          Open tracking portal
        </a>
        <button
          type="button"
          className={[
            'rounded-md px-3 py-2 text-xs font-semibold',
            chatOpen
              ? 'border border-gold/50 bg-gold/10 text-gold'
              : 'bg-gold text-ink hover:bg-gold-lt',
          ].join(' ')}
          onClick={() => {
            setErr(null)
            setChatOpen((o) => !o)
          }}
        >
          {chatOpen ? 'Close chat' : 'Access chat'}
        </button>
      </div>

      {err ? <p className="text-xs text-late">{err}</p> : null}

      {chatOpen ? (
        <div className="space-y-3">
          <div className="rounded-md border border-border/50 bg-ink/40 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Group chat members
            </div>
            {ensuring ? (
              <p className="mt-1 text-xs text-muted">Opening trip thread…</p>
            ) : null}
            <ul className="mt-1.5 space-y-1 text-sm text-cream">
              {members.length === 0 ? (
                <li className="text-muted">
                  No ops members on the thread yet — add them from Chat or the
                  trip participants panel.
                </li>
              ) : (
                members.map((p) => (
                  <li key={p.id}>{formatChatMemberLine(p)}</li>
                ))
              )}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              Ops group thread — dispatch, crew, ground, FBO. Clients use the
              tracking portal (not this chat).
            </p>
          </div>
          <TripThreadPanel
            trip={trip}
            tall
            title="Trip group chat"
          />
        </div>
      ) : null}
    </div>
  )
}
