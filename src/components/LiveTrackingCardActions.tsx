/**
 * Live tracking card actions — portal, client email update, Access chat,
 * Log as complete, Delete.
 * Client ETA / stop / info updates are drafted here and emailed in the ETA sheet thread.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { PortalStopPicker } from '@/components/PortalStopPicker'
import { TripThreadPanel } from '@/components/TripThreadPanel'
import { formatChatMemberLine } from '@/domain/chatRoster'
import {
  emptyPortalStop,
  formatPortalStopTitle,
  type PortalStopLocation,
} from '@/domain/portalStopLocation'
import {
  getEtaSheetThreadMeta,
  portalTrackingUrlForTrip,
  sendClientTrackingUpdate,
} from '@/lib/etaSheetSender'
import {
  deleteTrip,
  ensureTripThread,
  getTrip,
  listTripsStable,
  safeTransitionTrip,
  setPortalStopLocations,
  subscribeTrips,
} from '@/lib/tripStore'

type Props = {
  tripId: string
}

export function LiveTrackingCardActions({ tripId }: Props) {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = trips.find((t) => t.id === tripId) ?? getTrip(tripId)
  const [chatOpen, setChatOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [ensuring, setEnsuring] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const [headline, setHeadline] = useState('ETA update')
  const [etaLine, setEtaLine] = useState('')
  const [body, setBody] = useState('')
  const [extraEmails, setExtraEmails] = useState('')

  const originIcao =
    trip?.eta_chain?.find((l) => l.type === 'air_leg')?.from.icao ||
    trip?.lane?.split(/→|->/)[0]?.trim() ||
    ''
  const destIcao =
    trip?.eta_chain?.find((l) => l.type === 'air_leg')?.to.icao ||
    trip?.lane?.split(/→|->/).at(-1)?.trim() ||
    ''

  const [draftPickup, setDraftPickup] = useState<PortalStopLocation>(() =>
    emptyPortalStop(originIcao),
  )
  const [draftDropoff, setDraftDropoff] = useState<PortalStopLocation>(() =>
    emptyPortalStop(destIcao),
  )

  useEffect(() => {
    if (!chatOpen || !trip) return
    if (trip.thread_number && !trip.thread_disbanded_at) return
    setEnsuring(true)
    void ensureTripThread(trip.id)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setEnsuring(false))
  }, [chatOpen, trip])

  useEffect(() => {
    if (!trip || !updateOpen) return
    setDraftPickup(trip.portal_pickup_stop ?? emptyPortalStop(originIcao))
    setDraftDropoff(trip.portal_dropoff_stop ?? emptyPortalStop(destIcao))
  }, [trip, updateOpen, originIcao, destIcao])

  if (!trip) return null

  const members = trip.participants.filter(
    (p) => p.in_thread && !p.released_at,
  )
  const trackUrl = portalTrackingUrlForTrip(trip.id)
  const canComplete = trip.state === 'in_progress'
  const thread = getEtaSheetThreadMeta(trip)
  const threadRecipients = thread?.recipients ?? []

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

  function saveStopsOnly() {
    setErr(null)
    setNote(null)
    try {
      setPortalStopLocations(
        tripId,
        { pickup: draftPickup, dropoff: draftDropoff },
        'dispatcher',
      )
      setNote(
        `Stops saved · pickup ${formatPortalStopTitle(draftPickup)} · drop-off ${formatPortalStopTitle(draftDropoff)}`,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function sendUpdate() {
    if (sending) return
    setSending(true)
    setErr(null)
    setNote(null)
    try {
      setPortalStopLocations(
        tripId,
        { pickup: draftPickup, dropoff: draftDropoff },
        'dispatcher',
      )
      const extras = extraEmails
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes('@'))
      const result = await sendClientTrackingUpdate({
        tripId,
        body,
        headline,
        etaLine: etaLine.trim() || undefined,
        recipients: extras.length
          ? [...threadRecipients, ...extras]
          : undefined,
      })
      setNote(
        `Update emailed to ${result.sentTo.join(', ')} · ${result.subject}`,
      )
      setBody('')
      setEtaLine('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
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
            updateOpen
              ? 'border border-gold/50 bg-gold/10 text-gold'
              : 'border border-gold/40 text-gold hover:bg-gold/10',
          ].join(' ')}
          onClick={() => {
            setErr(null)
            setNote(null)
            setUpdateOpen((o) => !o)
            if (!updateOpen) setChatOpen(false)
          }}
        >
          {updateOpen ? 'Close client update' : 'Client ETA / info update'}
        </button>
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
            if (!chatOpen) setUpdateOpen(false)
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
      {note ? <p className="text-xs text-onplan">{note}</p> : null}

      {updateOpen ? (
        <div className="space-y-3 rounded-md border border-gold/30 bg-ink/50 p-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gold">
              Client update · ETA sheet thread
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Edits stops on the tracker and emails trackers in the same thread
              as the ETA sheet (Re: + Message-ID).
            </p>
            {threadRecipients.length ? (
              <p className="mt-1 font-mono text-[11px] text-cream/70">
                Thread: {threadRecipients.join(', ')}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-late">
                No ETA sheet recipients yet — enter emails below or send the ETA
                sheet first.
              </p>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <PortalStopPicker
              label="Pickup"
              icao={originIcao}
              value={draftPickup}
              onChange={setDraftPickup}
              tone="dark"
            />
            <PortalStopPicker
              label="Drop-off"
              icao={destIcao}
              value={draftDropoff}
              onChange={setDraftDropoff}
              tone="dark"
            />
          </div>

          <label className="block text-xs text-muted">
            Headline
            <select
              className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            >
              <option value="ETA update">ETA update</option>
              <option value="Stop change">Stop change</option>
              <option value="Trip update">Trip update</option>
              <option value="Ops note">Ops note</option>
            </select>
          </label>

          <label className="block text-xs text-muted">
            Revised timing (optional)
            <input
              className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 font-mono text-sm text-cream"
              placeholder="e.g. Landing ~18:40 local · +20 min"
              value={etaLine}
              onChange={(e) => setEtaLine(e.target.value)}
            />
          </label>

          <label className="block text-xs text-muted">
            Message to client
            <textarea
              className="mt-1 min-h-[96px] w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
              placeholder="What changed and what they should expect…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          <label className="block text-xs text-muted">
            Extra recipients (optional)
            <input
              className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
              placeholder="email@client.com"
              value={extraEmails}
              onChange={(e) => setExtraEmails(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-cream hover:border-gold/40"
              onClick={saveStopsOnly}
            >
              Save stops only
            </button>
            <button
              type="button"
              disabled={sending || !body.trim()}
              className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
              onClick={() => void sendUpdate()}
            >
              {sending ? 'Sending…' : 'Save stops + email update'}
            </button>
          </div>
        </div>
      ) : null}

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
