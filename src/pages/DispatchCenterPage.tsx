/**
 * Dispatch Center — one waterfall dashboard for day-to-day ops.
 * Consolidates Board / scratchpad / parse / chat / QD / new trip
 * without dropping their routes (tools drawer + deep links).
 */

import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { BookedTripActionsPanel } from '@/components/BookedTripActionsPanel'
import { DeskOfferQuoteWorkbench } from '@/components/DeskOfferQuoteWorkbench'
import { OfferAddOperatorPanel } from '@/components/OfferAddOperatorPanel'
import {
  DISPATCH_DRAWERS,
  buildDispatchDrawers,
  type DispatchCard,
  type DispatchDrawerId,
} from '@/domain/dispatchCenter'
import { parseLaneAirports } from '@/domain/offerMissionDisplay'
import { absoluteAppUrl } from '@/lib/appUrl'
import {
  deleteRequest,
  listRequests,
  pushScratchPadToTripRequest,
  subscribeRequests,
} from '@/lib/requestStore'
import {
  clearScratchPad,
  getScratchPad,
  subscribeScratchPad,
} from '@/lib/scratchPadStore'
import { getClient, listClients, subscribeClients } from '@/lib/clientStore'
import {
  acknowledgeDeclinedOffer,
  deskApproveTrip,
  updateTripOfferRequest,
} from '@/lib/offerFlow'
import { startLiveTripRefresh } from '@/lib/liveTripRefresh'
import { resolveTripClientName } from '@/lib/resolveTripClientName'
import {
  deleteTrip,
  getTrip,
  listTripsStable,
  removeOfferFromTrip,
  subscribeTrips,
} from '@/lib/tripStore'

const ScratchPadPage = lazy(() => import('@/pages/ScratchPadPage'))
const DeskParsePage = lazy(() => import('@/pages/DeskParsePage'))
const QuickDispatchPage = lazy(() => import('@/pages/QuickDispatchPage'))
const ChatPage = lazy(() => import('@/pages/ChatPage'))
const NewTripPage = lazy(() => import('@/pages/NewTripPage'))

type ToolId = 'scratchpad' | 'parse' | 'quick' | 'chat' | 'newtrip'

/** Work tools drawer — Quick Dispatch + Start new request are top-of-page. */
const TOOLS: { id: Exclude<ToolId, 'quick'>; label: string; hint: string }[] = [
  { id: 'scratchpad', label: 'Scratchpad', hint: 'Live phone notes' },
  { id: 'parse', label: 'Parse & shortlist', hint: 'Notes → operators' },
  { id: 'newtrip', label: 'Start new request', hint: 'Full trip request form' },
  { id: 'chat', label: 'Chat', hint: "Who's on trips going out" },
]

function Drawer({
  id,
  title,
  blurb,
  count,
  open,
  onToggle,
  children,
  attention,
}: {
  id: string
  title: string
  blurb: string
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  attention?: boolean
}) {
  return (
    <section
      className={[
        'overflow-hidden rounded-lg border',
        attention ? 'border-gold/50 bg-gold/5' : 'border-border bg-surface',
      ].join(' ')}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`drawer-${id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2/60"
      >
        <span
          className={[
            'avionic text-lg text-muted transition-transform',
            open ? 'rotate-90 text-gold' : '',
          ].join(' ')}
          aria-hidden
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-cream">
            {title}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{blurb}</span>
        </span>
        <span
          className={[
            'avionic rounded-md px-2.5 py-1 text-sm font-semibold',
            count > 0 ? 'bg-gold/20 text-gold' : 'bg-surface-2 text-muted',
          ].join(' ')}
        >
          {count}
        </span>
      </button>
      {open && (
        <div id={`drawer-${id}`} className="border-t border-border/60 px-3 pb-3 pt-2">
          {children}
        </div>
      )}
    </section>
  )
}

function CardList({
  cards,
  onDeleteCard,
  onApproveCard,
  approvingId,
  showBookedActions,
}: {
  cards: DispatchCard[]
  onDeleteCard: (card: DispatchCard) => void
  onApproveCard: (card: DispatchCard) => void
  approvingId?: string | null
  /** Approved drawer — invoice + ETA sheet actions. */
  showBookedActions?: boolean
}) {
  if (!cards.length) {
    return <p className="px-1 py-3 text-sm text-muted">Nothing here right now.</p>
  }
  return (
    <ul className="space-y-2">
      {cards.map((c) => {
        const tripId = c.trip_id ?? (c.kind === 'trip' ? c.id : undefined)
        return (
        <li
          key={`${c.kind}-${c.id}`}
          className="rounded-md border border-border/70 bg-ink px-3 py-3"
        >
          <div className="flex items-stretch gap-2">
            <Link
              to={c.href}
              className="min-w-0 flex-1 hover:opacity-90"
            >
              <div className="font-medium text-cream">{c.title}</div>
              <div className="mt-0.5 text-sm text-muted">{c.subtitle}</div>
              {c.chips?.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.chips.map((chip) => (
                    <span
                      key={chip}
                      className={[
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        chip.includes('forklift required')
                          ? 'bg-late/20 text-late'
                          : chip.includes('courier') || chip.includes('forklift')
                            ? 'bg-gold/15 text-gold'
                            : 'bg-surface-2 text-cream',
                      ].join(' ')}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
            <div className="flex shrink-0 flex-col justify-center gap-1">
              {c.approvable ? (
                <button
                  type="button"
                  aria-label={`Approve trip ${c.title}`}
                  title="Approve trip"
                  disabled={approvingId === c.id}
                  onClick={() => onApproveCard(c)}
                  className="rounded-md bg-gold/20 px-2.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/30 disabled:opacity-40"
                >
                  {approvingId === c.id ? 'Approving…' : 'Approve trip'}
                </button>
              ) : null}
              {c.deletable ? (
                <button
                  type="button"
                  aria-label={`Delete ${c.title}`}
                  title="Delete"
                  onClick={() => onDeleteCard(c)}
                  className="px-2.5 py-1 text-xs text-muted hover:text-late"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
          {showBookedActions && tripId ? (
            <BookedTripActionsPanel tripId={tripId} />
          ) : null}
        </li>
        )
      })}
    </ul>
  )
}

function recipientTone(status: string): string {
  if (status === 'yes' || status === 'quote_submitted' || status === 'selected') {
    return 'text-onplan'
  }
  if (status === 'no' || status === 'stood_down' || status === 'expired') {
    return 'text-muted'
  }
  return 'text-gold'
}

const updateField =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold'

function OfferUpdateForm({
  tripId,
  onClose,
  onError,
}: {
  tripId: string
  onClose: () => void
  onError: (msg: string) => void
}) {
  const trip = getTrip(tripId)
  const parsed = parseLaneAirports(trip?.lane ?? '')
  const [origin, setOrigin] = useState(parsed?.origin ?? '')
  const [dest, setDest] = useState(parsed?.dest ?? '')
  const [payload, setPayload] = useState(trip?.payload_summary ?? '')
  const [ready, setReady] = useState(trip?.ready_label ?? '')
  const [saving, setSaving] = useState(false)

  if (!trip) {
    return (
      <p className="mt-3 text-sm text-late">Trip not found in this session.</p>
    )
  }

  function save() {
    const o = origin.trim().toUpperCase()
    const d = dest.trim().toUpperCase()
    if (!o || !d) {
      onError('Pick departure and arrival airports')
      return
    }
    const rest = parsed?.rest
    const lane = rest ? `${o}→${d} · ${rest}` : `${o}→${d}`
    setSaving(true)
    void updateTripOfferRequest(tripId, {
      lane,
      payload_summary: payload,
      ready_label: ready,
    })
      .then(() => {
        onError('')
        onClose()
      })
      .catch((e) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSaving(false))
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-gold/40 bg-gold/5 px-3 py-3">
      <div className="text-sm font-semibold text-cream">Update request</div>
      <p className="text-xs text-muted">
        Same mission fields as Parse & shortlist. Changes show on existing offer
        links — no re-ping.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <AirportSelect
          label="Departure"
          value={origin}
          onChange={setOrigin}
          allowUnknown
          inputClassName={updateField}
        />
        <AirportSelect
          label="Arrival"
          value={dest}
          onChange={setDest}
          allowUnknown
          inputClassName={updateField}
        />
      </div>
      <label className="block text-xs font-medium uppercase tracking-wider text-muted">
        Mission / payload
        <input
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          className={updateField}
          placeholder="2 pax + standard tooling…"
        />
      </label>
      <label className="block text-xs font-medium uppercase tracking-wider text-muted">
        Ready
        <input
          value={ready}
          onChange={(e) => setReady(e.target.value)}
          className={updateField}
          placeholder="ASAP"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save update'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="rounded-md border border-border px-3 py-2 text-xs text-muted hover:text-cream"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function OfferTripList({
  cards,
  focusTripId,
  onAcknowledgeDeclined,
  onDeleteCard,
  onDeleteOffer,
  onApproveCard,
  onApproveOffer,
  approvingId,
}: {
  cards: DispatchCard[]
  focusTripId?: string | null
  onAcknowledgeDeclined: (tripId: string, offerId: string) => void
  onDeleteCard: (card: DispatchCard) => void
  onDeleteOffer: (tripId: string, offerId: string, name: string) => void
  onApproveCard: (card: DispatchCard) => void
  onApproveOffer: (tripId: string, offerId: string, name: string) => void
  approvingId?: string | null
}) {
  const [updatingTripId, setUpdatingTripId] = useState<string | null>(null)
  const [addingTripId, setAddingTripId] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const [quotingTripId, setQuotingTripId] = useState<string | null>(
    () => focusTripId ?? null,
  )
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    if (!focusTripId) return
    setQuotingTripId(focusTripId)
    if (searchParams.get('update') === '1') {
      setUpdatingTripId(focusTripId)
      setAddingTripId(null)
    } else if (searchParams.get('add') === '1') {
      setAddingTripId(focusTripId)
      setUpdatingTripId(null)
    }
  }, [focusTripId, searchParams])

  // Clear inline panels when the trip disappears (delete / hydrate race).
  useEffect(() => {
    const stillHere = (tripId: string | null) =>
      Boolean(
        tripId && cards.some((c) => c.trip_id === tripId || c.id === tripId),
      )
    if (quotingTripId && !stillHere(quotingTripId)) setQuotingTripId(null)
    if (updatingTripId && !stillHere(updatingTripId)) setUpdatingTripId(null)
    if (addingTripId && !stillHere(addingTripId)) setAddingTripId(null)
  }, [cards, quotingTripId, updatingTripId, addingTripId])

  if (!cards.length) {
    return <p className="px-1 py-3 text-sm text-muted">Nothing here right now.</p>
  }
  return (
    <ul className="space-y-3">
      {cards.map((c) => {
        const focused = Boolean(focusTripId && c.trip_id === focusTripId)
        const editing = Boolean(c.trip_id && updatingTripId === c.trip_id)
        const adding = Boolean(c.trip_id && addingTripId === c.trip_id)
        const quoting = Boolean(c.trip_id && quotingTripId === c.trip_id)
        return (
          <li
            key={`${c.kind}-${c.id}`}
            id={c.trip_id ? `offer-trip-${c.trip_id}` : undefined}
            className={[
              'rounded-md border bg-ink px-3 py-3',
              focused || editing || adding || quoting
                ? 'border-gold/60 ring-1 ring-gold/30'
                : 'border-border/70',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-cream">{c.title}</div>
                <div className="mt-0.5 font-mono text-sm text-gold/90">
                  {c.subtitle}
                </div>
                {c.chips?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.chips.map((chip) => (
                      <span
                        key={chip}
                        className={[
                          'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          chip.includes('forklift required')
                            ? 'bg-late/20 text-late'
                            : chip.includes('courier') ||
                                chip.includes('forklift')
                              ? 'bg-gold/15 text-gold'
                              : 'bg-surface-2 text-cream',
                        ].join(' ')}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {c.approvable ? (
                  <button
                    type="button"
                    disabled={approvingId === c.id}
                    className="rounded-md bg-gold px-2.5 py-1 text-xs font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
                    onClick={() => onApproveCard(c)}
                  >
                    {approvingId === c.id ? 'Approving…' : 'Approve trip'}
                  </button>
                ) : null}
                {c.deletable ? (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-late"
                    onClick={() => onDeleteCard(c)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
            {c.recipients && c.recipients.length > 0 ? (
              <ul className="mt-2 space-y-2 border-t border-border/50 pt-2">
                {c.recipients.map((r) =>
                  r.declined_acked ? (
                    <li
                      key={r.offer_id}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-0.5 py-1 text-sm text-muted"
                    >
                      <span className="text-cream/80">{r.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted">unavailable</span>
                        {c.trip_id ? (
                          <button
                            type="button"
                            className="text-xs text-muted hover:text-late"
                            onClick={() =>
                              onDeleteOffer(c.trip_id!, r.offer_id, r.name)
                            }
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ) : (
                  <li
                    key={r.offer_id}
                    className="rounded-md border border-border/40 bg-surface/40 px-2.5 py-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-cream">{r.name}</span>
                      <span
                        className={`text-xs font-medium ${recipientTone(r.status)}`}
                      >
                        {r.status_label}
                      </span>
                    </div>
                    {r.sent_label ? (
                      <div className="mt-1 font-mono text-[11px] text-muted">
                        {r.sent_label}
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] text-muted">
                        Link not created yet
                      </div>
                    )}
                    {r.quote_summary ? (
                      <div className="mt-1 font-mono text-xs text-cream/90">
                        {r.quote_summary}
                      </div>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                      {r.status === 'no' && c.trip_id ? (
                        <button
                          type="button"
                          className="font-medium text-gold hover:text-gold-lt"
                          onClick={() =>
                            onAcknowledgeDeclined(c.trip_id!, r.offer_id)
                          }
                        >
                          Acknowledge
                        </button>
                      ) : null}
                      {(r.status === 'quote_submitted' ||
                        r.status === 'selected') &&
                      r.quote_summary &&
                      c.trip_id ? (
                        <button
                          type="button"
                          disabled={approvingId === r.offer_id}
                          className="font-medium text-gold hover:text-gold-lt disabled:opacity-40"
                          onClick={() =>
                            onApproveOffer(c.trip_id!, r.offer_id, r.name)
                          }
                        >
                          {approvingId === r.offer_id
                            ? 'Approving…'
                            : 'Approve trip'}
                        </button>
                      ) : null}
                      <Link
                        className="text-gold hover:text-gold-lt"
                        to={r.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open offer link
                      </Link>
                      <button
                        type="button"
                        className="text-muted hover:text-cream"
                        onClick={() => {
                          const url = absoluteAppUrl(r.href)
                          void navigator.clipboard?.writeText(url)
                        }}
                      >
                        Copy link
                      </button>
                      {c.trip_id ? (
                        <button
                          type="button"
                          className="text-muted hover:text-late"
                          onClick={() =>
                            onDeleteOffer(c.trip_id!, r.offer_id, r.name)
                          }
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </li>
                  ),
                )}
              </ul>
            ) : null}
            {editing && c.trip_id ? (
              <>
                {updateError ? (
                  <p className="mt-2 text-xs text-late">{updateError}</p>
                ) : null}
                <OfferUpdateForm
                  key={`update-${c.trip_id}`}
                  tripId={c.trip_id}
                  onClose={() => {
                    setUpdatingTripId(null)
                    setUpdateError(null)
                  }}
                  onError={(msg) => setUpdateError(msg || null)}
                />
              </>
            ) : null}
            {adding && c.trip_id ? (
              <OfferAddOperatorPanel
                key={`add-${c.trip_id}`}
                tripId={c.trip_id}
                onClose={() => setAddingTripId(null)}
              />
            ) : null}
            {quoting && c.trip_id ? (
              <DeskOfferQuoteWorkbench
                key={`quote-${c.trip_id}`}
                tripId={c.trip_id}
                onClose={() => setQuotingTripId(null)}
              />
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {c.trip_id ? (
                <button
                  type="button"
                  className={[
                    'rounded-md px-2.5 py-1.5 text-xs font-medium',
                    quoting
                      ? 'bg-gold text-ink'
                      : 'bg-gold/15 text-gold hover:bg-gold/25',
                  ].join(' ')}
                  onClick={() => {
                    setUpdatingTripId(null)
                    setAddingTripId(null)
                    setUpdateError(null)
                    setQuotingTripId(quoting ? null : c.trip_id!)
                  }}
                >
                  {quoting ? 'Close quotes' : 'Quotes & pricing'}
                </button>
              ) : null}
              {c.trip_id ? (
                <button
                  type="button"
                  className={[
                    'rounded-md border px-2.5 py-1.5 text-xs',
                    adding
                      ? 'border-gold/50 bg-gold/10 text-gold'
                      : 'border-border text-cream hover:border-gold/40',
                  ].join(' ')}
                  onClick={() => {
                    setUpdatingTripId(null)
                    setQuotingTripId(null)
                    setUpdateError(null)
                    setAddingTripId(adding ? null : c.trip_id!)
                  }}
                >
                  {adding ? 'Close send' : 'Send to new operator'}
                </button>
              ) : null}
              {c.trip_id ? (
                <button
                  type="button"
                  className={[
                    'rounded-md border px-2.5 py-1.5 text-xs',
                    editing
                      ? 'border-gold/50 bg-gold/10 text-gold'
                      : 'border-border text-cream hover:border-gold/40',
                  ].join(' ')}
                  onClick={() => {
                    setAddingTripId(null)
                    setQuotingTripId(null)
                    setUpdateError(null)
                    setUpdatingTripId(editing ? null : c.trip_id!)
                  }}
                >
                  {editing ? 'Close update' : 'Update request'}
                </button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const DRAWER_IDS = new Set<string>(DISPATCH_DRAWERS.map((d) => d.id))

export default function DispatchCenterPage() {
  const [searchParams] = useSearchParams()
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const requests = useSyncExternalStore(subscribeRequests, listRequests, listRequests)
  const clients = useSyncExternalStore(subscribeClients, listClients, listClients)
  const scratch = useSyncExternalStore(
    subscribeScratchPad,
    getScratchPad,
    getScratchPad,
  )

  const focusTripId = searchParams.get('focus')
  const drawerParam = searchParams.get('drawer')
  const [openDrawer, setOpenDrawer] = useState<DispatchDrawerId | 'tools' | null>(
    () =>
      drawerParam && DRAWER_IDS.has(drawerParam)
        ? (drawerParam as DispatchDrawerId)
        : 'requests',
  )
  const [tool, setTool] = useState<ToolId | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)

  // Deep link from desk send / share: /dispatch?drawer=offers&focus=<tripId>
  useEffect(() => {
    if (!drawerParam || !DRAWER_IDS.has(drawerParam)) return
    setTool(null)
    setOpenDrawer(drawerParam as DispatchDrawerId)
  }, [drawerParam])

  // Pull operator Yes/No / quotes into this browser without a manual refresh.
  useEffect(() => startLiveTripRefresh(4000), [])

  // Scroll only on focus/drawer change — not on every live trip hydrate (jumpy deletes).
  useEffect(() => {
    if (
      !focusTripId ||
      (openDrawer !== 'offers' &&
        openDrawer !== 'quotes' &&
        openDrawer !== 'submitted_quotes')
    ) {
      return
    }
    const el = document.getElementById(`offer-trip-${focusTripId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusTripId, openDrawer])

  function removeWaterfallCard(card: DispatchCard) {
    if (!card.deletable) return
    if (card.kind === 'request') {
      if (!window.confirm(`Delete trip request?\n\n${card.title}`)) return
      deleteRequest(card.id)
      return
    }
    if (card.kind === 'offer_quote' && card.trip_id) {
      if (
        !window.confirm(
          `Remove this submitted quote from the queue?\n\n${card.title}`,
        )
      ) {
        return
      }
      void removeOfferFromTrip(card.trip_id, card.id)
      return
    }
    const tripId = card.trip_id ?? card.id
    if (
      !window.confirm(
        `Delete this trip from the queue?\n\n${card.title}\n\nThis removes the trip and its offers. Cannot be undone.`,
      )
    ) {
      return
    }
    void deleteTrip(tripId)
  }

  function removeOfferRow(tripId: string, offerId: string, name: string) {
    if (
      !window.confirm(
        `Remove ${name} from this trip?\n\nTheir offer link will stop working.`,
      )
    ) {
      return
    }
    void removeOfferFromTrip(tripId, offerId)
  }

  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)

  function approveWaterfallCard(card: DispatchCard) {
    const tripId = card.trip_id ?? (card.kind === 'trip' ? card.id : null)
    if (!tripId || !card.approvable) return
    if (
      !window.confirm(
        `Approve trip?\n\n${card.title}\n\nBooks the trip with the selected / quoted operator and moves it to Approved.`,
      )
    ) {
      return
    }
    setApproveError(null)
    setApprovingId(card.id)
    void deskApproveTrip(tripId, card.approve_offer_id)
      .then(() => {
        setOpenDrawer('approved')
      })
      .catch((e) =>
        setApproveError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setApprovingId(null))
  }

  function approveOfferRow(tripId: string, offerId: string, name: string) {
    if (
      !window.confirm(
        `Approve trip with ${name}?\n\nBooks the trip and stands other operators down.`,
      )
    ) {
      return
    }
    setApproveError(null)
    setApprovingId(offerId)
    void deskApproveTrip(tripId, offerId)
      .then(() => {
        setOpenDrawer('approved')
      })
      .catch((e) =>
        setApproveError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setApprovingId(null))
  }

  const buckets = useMemo(
    () =>
      buildDispatchDrawers({
        requests,
        trips: trips.map((t) => {
          const fromDir =
            t.client_id ? getClient(t.client_id)?.name?.trim() || '' : ''
          const client_name =
            resolveTripClientName(t, fromDir) || null
          return {
            id: t.id,
            ref: t.ref,
            code: t.code,
            lane: t.lane,
            state: t.state,
            client_name,
            service_pattern: t.service_pattern,
            forklift_required: t.forklift_required,
            forklift_recommended: t.forklift_recommended,
            quick: t.quick,
            legs: t.legs,
            offers: t.offers.map((o) => ({
              ...o,
              declined_acked_at: o.declined_acked_at,
            })),
          }
        }),
      }),
    [requests, trips, clients],
  )

  const scratchPreview = scratch.body.trim()

  function toggle(id: DispatchDrawerId | 'tools') {
    setOpenDrawer((cur) => (cur === id ? null : id))
    if (id !== 'tools') setTool(null)
  }

  function pushToTripRequests() {
    setPushError(null)
    try {
      pushScratchPadToTripRequest()
      setOpenDrawer('requests')
    } catch (e) {
      setPushError(e instanceof Error ? e.message : String(e))
    }
  }

  function eraseScratchPad() {
    if (!scratchPreview) return
    if (!window.confirm('Erase Scratchpad notes? This cannot be undone.')) return
    clearScratchPad()
    setPushError(null)
  }

  if (tool) {
    const Tool = {
      scratchpad: ScratchPadPage,
      parse: DeskParsePage,
      quick: QuickDispatchPage,
      chat: ChatPage,
      newtrip: NewTripPage,
    }[tool]
    return (
      <div className="mx-auto max-w-5xl space-y-3 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTool(null)}
            className="text-sm text-gold hover:text-gold-lt"
          >
            ← Back to Dispatch center
          </button>
          <span className="text-xs uppercase tracking-wider text-muted">
            {tool === 'quick'
              ? 'Quick Dispatch'
              : TOOLS.find((t) => t.id === tool)?.label}
          </span>
        </div>
        <div className="min-h-[70vh] rounded-lg border border-border bg-ink">
          <Suspense
            fallback={
              <p className="p-6 text-sm text-muted">Loading tool…</p>
            }
          >
            {tool === 'scratchpad' ? <ScratchPadPage embedded /> : <Tool />}
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold text-cream">Dispatch center</h1>
          <p className="text-sm text-muted">
            Requests → trip offers → submitted quotes → client quotes → approved
            → live tracking. Open a drawer to work it.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTool('newtrip')
              setOpenDrawer('requests')
            }}
            className="rounded-md border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold hover:bg-gold/20"
          >
            Start new request
          </button>
          <button
            type="button"
            onClick={() => setTool('quick')}
            className="rounded-md bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold-lt"
          >
            Quick Dispatch
          </button>
        </div>
      </header>

      {scratchPreview ? (
        <div className="rounded-lg border border-gold/40 bg-gold/5 px-3 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-gold">
            Scratchpad has notes
          </div>
          <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-cream/85">
            {scratchPreview.slice(0, 600)}
            {scratchPreview.length > 600 ? '…' : ''}
          </pre>
          {pushError ? (
            <p className="mt-2 text-xs text-late">{pushError}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTool('parse')}
              className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-lt"
            >
              Parse & shortlist
            </button>
            <button
              type="button"
              onClick={pushToTripRequests}
              className="rounded-md border border-gold/50 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/10"
            >
              Push to trip requests
            </button>
            <button
              type="button"
              onClick={eraseScratchPad}
              className="rounded-md border border-border px-3 py-2 text-xs text-muted hover:border-late/50 hover:text-late"
            >
              Erase Scratchpad
            </button>
          </div>
        </div>
      ) : null}

      {approveError ? (
        <p className="rounded-md border border-late/40 bg-late/10 px-3 py-2 text-sm text-late">
          {approveError}
        </p>
      ) : null}

      {DISPATCH_DRAWERS.map((d) => (
        <Drawer
          key={d.id}
          id={d.id}
          title={d.label}
          blurb={d.blurb}
          count={buckets[d.id].length}
          open={openDrawer === d.id}
          onToggle={() => toggle(d.id)}
          attention={
            buckets[d.id].length > 0 &&
            (d.id === 'requests' || d.id === 'submitted_quotes')
          }
        >
          {d.id === 'offers' || d.id === 'quotes' ? (
            <OfferTripList
              cards={buckets[d.id]}
              focusTripId={focusTripId}
              onAcknowledgeDeclined={(tripId, offerId) => {
                void acknowledgeDeclinedOffer(tripId, offerId).catch((e) =>
                  console.warn('[dispatch] acknowledge declined', e),
                )
              }}
              onDeleteCard={removeWaterfallCard}
              onDeleteOffer={removeOfferRow}
              onApproveCard={approveWaterfallCard}
              onApproveOffer={approveOfferRow}
              approvingId={approvingId}
            />
          ) : (
            <CardList
              cards={buckets[d.id]}
              onDeleteCard={removeWaterfallCard}
              onApproveCard={approveWaterfallCard}
              approvingId={approvingId}
              showBookedActions={d.id === 'approved'}
            />
          )}
        </Drawer>
      ))}

      <Drawer
        id="tools"
        title="Work tools"
        blurb="Scratchpad, parse, chat, start new request"
        count={TOOLS.length}
        open={openDrawer === 'tools'}
        onToggle={() => toggle('tools')}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              className="rounded-md border border-border bg-ink px-3 py-3 text-left hover:border-gold/40"
            >
              <div className="text-sm font-semibold text-cream">{t.label}</div>
              <div className="mt-0.5 text-xs text-muted">{t.hint}</div>
            </button>
          ))}
        </div>
      </Drawer>
    </div>
  )
}
