/**
 * Live tracking card actions — portal, Access chat, Log as complete, Delete.
 * Complete = in_progress → delivered (leaves Live tracking; invoice draft only — desk sends).
 * Delete = soft-discard (testing cleanup).
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { TripThreadPanel } from '@/components/TripThreadPanel'
import { formatChatMemberLine } from '@/domain/chatRoster'
import { portalTrackingUrlForTrip } from '@/lib/etaSheetSender'
import {
  deleteTrip,
  ensureTripThread,
  getTrip,
  listTripsStable,
  safeTransitionTrip,
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
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
  const canComplete = trip.state === 'in_progress'

  function logAsComplete() {
    const row = getTrip(tripId)
    if (!row || row.state !== 'in_progress' || completing) return
    if (
      !window.confirm(
        `Log this trip as complete?\n\n${row.lane}\n\nMoves it out of Live tracking and drafts the invoice.`,
      )
    ) {
      return
    }
    setCompleting(true)
    setErr(null)
    try {
      safeTransitionTrip(row.id, 'delivered', 'dispatcher', {
        via: 'desk_log_complete',
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setCompleting(false)
    }
  }

  function discardLiveTrip() {
    const row = getTrip(tripId)
    if (!row || deleting) return
    if (
      !window.confirm(
        `Delete this live trip?\n\n${row.lane}\n\nSoft-discards the trip (good for test data). Cannot be undone.`,
      )
    ) {
      return
    }
    setDeleting(true)
    setErr(null)
    try {
      if (!deleteTrip(row.id)) {
        setErr('Could not delete trip')
        setDeleting(false)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

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
        {canComplete ? (
          <button
            type="button"
            disabled={completing || deleting}
            className="rounded-md border border-onplan/50 bg-onplan/10 px-3 py-2 text-xs font-semibold text-onplan hover:bg-onplan/20 disabled:opacity-40"
            onClick={logAsComplete}
          >
            {completing ? 'Logging…' : 'Log as complete'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={deleting || completing}
          className="rounded-md border border-late/50 bg-late/10 px-3 py-2 text-xs font-semibold text-late hover:bg-late/20 disabled:opacity-40"
          onClick={discardLiveTrip}
        >
          {deleting ? 'Deleting…' : 'Delete trip'}
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
