/**
 * Live tracking card actions — portal, client update, trip contacts,
 * Log as complete, Delete.
 * Client update = progress portal stage OR email on the ETA sheet thread.
 * Trip contacts = click-to-call client + charter operator (no group thread).
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  clientOpsStageLabel,
  PORTAL_OPS_STAGE_KEYS,
  type PortalOpsStageKey,
  tripToTrackingInput,
  buildPortalTrackingView,
} from '@/domain/portalTracking'
import type { TripContactLine } from '@/domain/tripContacts'
import {
  getEtaSheetThreadMeta,
  portalTrackingUrlForTrip,
  sendClientTrackingUpdate,
} from '@/lib/etaSheetSender'
import { listTripContactsForDesk } from '@/lib/tripContacts'
import {
  deleteTrip,
  getTrip,
  listTripsStable,
  safeTransitionTrip,
  setPortalOpsStage,
  subscribeTrips,
} from '@/lib/tripStore'

type Props = {
  tripId: string
}

type UpdateMode = 'stage' | 'email'

function ContactSection({
  title,
  lines,
}: {
  title: string
  lines: TripContactLine[]
}) {
  if (!lines.length) return null
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted">
        {title}
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-ink/40 px-3 py-2"
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
    </div>
  )
}

export function LiveTrackingCardActions({ tripId }: Props) {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = trips.find((t) => t.id === tripId) ?? getTrip(tripId)
  const [contactsOpen, setContactsOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateMode, setUpdateMode] = useState<UpdateMode>('stage')
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sending, setSending] = useState(false)
  const [savingStage, setSavingStage] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [draftStage, setDraftStage] = useState<PortalOpsStageKey | null>(null)

  useEffect(() => {
    if (!trip || !updateOpen) return
    setDraftStage(trip.portal_ops_stage ?? null)
  }, [trip, updateOpen])

  const stageView = useMemo(() => {
    if (!trip) return null
    return buildPortalTrackingView(tripToTrackingInput(trip))
  }, [trip])

  const contacts = useMemo(
    () => (trip ? listTripContactsForDesk(trip) : null),
    [trip],
  )

  if (!trip) return null

  const trackUrl = portalTrackingUrlForTrip(trip.id)
  const canComplete = trip.state === 'in_progress'
  const thread = getEtaSheetThreadMeta(trip)
  const threadRecipients = thread?.recipients ?? []
  const liveStage =
    stageView?.opsForecastRows.find((r) => r.status === 'active') ?? null
  const pinnedStage = trip.portal_ops_stage ?? null

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

  function applyStage(stage: PortalOpsStageKey | null) {
    if (savingStage) return
    setSavingStage(true)
    setErr(null)
    setNote(null)
    try {
      setPortalOpsStage(tripId, stage)
      setDraftStage(stage)
      setNote(
        stage
          ? `Portal stage set to ${clientOpsStageLabel({ key: stage })}`
          : 'Portal stage follows live ADS-B / ETA again',
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingStage(false)
    }
  }

  async function sendEmailUpdate() {
    if (sending) return
    setSending(true)
    setErr(null)
    setNote(null)
    try {
      const result = await sendClientTrackingUpdate({
        tripId,
        body,
        headline: 'Trip update',
      })
      setNote(
        `Update emailed to ${result.sentTo.join(', ')} · ${result.subject}`,
      )
      setBody('')
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
          className="inline-flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-xs font-semibold text-cream hover:border-gold/40"
        >
          Open tracking portal
        </a>
        <button
          type="button"
          className={[
            'min-h-11 rounded-md px-3 py-2 text-xs font-semibold',
            updateOpen
              ? 'border border-gold/50 bg-gold/10 text-gold'
              : 'border border-gold/40 text-gold hover:bg-gold/10',
          ].join(' ')}
          onClick={() => {
            setErr(null)
            setNote(null)
            setUpdateOpen((o) => !o)
            if (!updateOpen) setContactsOpen(false)
          }}
        >
          {updateOpen ? 'Close client update' : 'Client update'}
        </button>
        <button
          type="button"
          className={[
            'min-h-11 rounded-md px-3 py-2 text-xs font-semibold',
            contactsOpen
              ? 'border border-gold/50 bg-gold/10 text-gold'
              : 'bg-gold text-ink hover:bg-gold-lt',
          ].join(' ')}
          onClick={() => {
            setErr(null)
            setContactsOpen((o) => !o)
            if (!contactsOpen) setUpdateOpen(false)
          }}
        >
          {contactsOpen ? 'Close trip contacts' : 'Trip contacts'}
        </button>
        {canComplete ? (
          <button
            type="button"
            disabled={completing || deleting}
            className="min-h-11 rounded-md border border-onplan/50 bg-onplan/10 px-3 py-2 text-xs font-semibold text-onplan hover:bg-onplan/20 disabled:opacity-40"
            onClick={logAsComplete}
          >
            {completing ? 'Logging…' : 'Log as complete'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={deleting || completing}
          className="min-h-11 rounded-md border border-late/50 bg-late/10 px-3 py-2 text-xs font-semibold text-late hover:bg-late/20 disabled:opacity-40"
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
              Client update
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Progress what the client sees on live tracking, or email them in
              the same thread as the ETA sheet.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={[
                'min-h-10 rounded-md px-3 py-2 text-xs font-semibold',
                updateMode === 'stage'
                  ? 'bg-gold text-ink'
                  : 'border border-border text-cream hover:border-gold/40',
              ].join(' ')}
              onClick={() => {
                setUpdateMode('stage')
                setErr(null)
                setNote(null)
              }}
            >
              Progress portal stage
            </button>
            <button
              type="button"
              className={[
                'min-h-10 rounded-md px-3 py-2 text-xs font-semibold',
                updateMode === 'email'
                  ? 'bg-gold text-ink'
                  : 'border border-border text-cream hover:border-gold/40',
              ].join(' ')}
              onClick={() => {
                setUpdateMode('email')
                setErr(null)
                setNote(null)
              }}
            >
              Email on ETA thread
            </button>
          </div>

          {updateMode === 'stage' ? (
            <div className="space-y-3">
              <p className="text-[11px] text-muted">
                {pinnedStage
                  ? `Pinned on portal: ${clientOpsStageLabel({ key: pinnedStage })}`
                  : liveStage
                    ? `Live (ADS-B / ETA): ${clientOpsStageLabel(liveStage)}`
                    : 'No portal stages yet — set one below once the trip is tracking.'}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PORTAL_OPS_STAGE_KEYS.map((key) => {
                  const selected = (draftStage ?? pinnedStage) === key
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={savingStage}
                      className={[
                        'min-h-11 rounded-md border px-3 py-2 text-left text-xs font-semibold disabled:opacity-40',
                        selected
                          ? 'border-gold bg-gold/15 text-gold'
                          : 'border-border text-cream hover:border-gold/40',
                      ].join(' ')}
                      onClick={() => applyStage(key)}
                    >
                      {clientOpsStageLabel({ key })}
                    </button>
                  )
                })}
              </div>
              {pinnedStage ? (
                <button
                  type="button"
                  disabled={savingStage}
                  className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-cream hover:border-gold/40 disabled:opacity-40"
                  onClick={() => applyStage(null)}
                >
                  Clear pin · follow live ADS-B / ETA
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {threadRecipients.length ? (
                <p className="font-mono text-[11px] text-cream/70">
                  Thread: {threadRecipients.join(', ')}
                </p>
              ) : (
                <p className="text-[11px] text-late">
                  No ETA sheet recipients yet — send the ETA sheet first so this
                  reply stays on that thread.
                </p>
              )}
              <label className="block text-xs text-muted">
                Message to client
                <textarea
                  className="mt-1 min-h-[96px] w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
                  placeholder="What changed and what they should expect…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={
                  sending || !body.trim() || threadRecipients.length === 0
                }
                className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
                onClick={() => void sendEmailUpdate()}
              >
                {sending ? 'Sending…' : 'Send email update'}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {contactsOpen ? (
        <div className="space-y-4 rounded-md border border-gold/30 bg-ink/50 p-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gold">
              Trip contacts
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Tap a number to call — client inbound / contacts and the charter
              operator on this trip.
            </p>
          </div>
          {!contacts || contacts.lines.length === 0 ? (
            <p className="text-xs text-muted">
              No phone numbers on file yet. Add them on the client profile or
              operator offer contact cell.
            </p>
          ) : (
            <>
              <ContactSection title="Client" lines={contacts.client} />
              <ContactSection
                title="Charter operator"
                lines={contacts.operator}
              />
              <ContactSection title="Crew / ground" lines={contacts.crew} />
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
