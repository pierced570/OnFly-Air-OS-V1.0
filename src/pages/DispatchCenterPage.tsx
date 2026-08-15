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
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { BookedTripActionsPanel } from '@/components/BookedTripActionsPanel'
import { LiveTrackingCardActions } from '@/components/LiveTrackingCardActions'
import { DeskOfferQuoteWorkbench } from '@/components/DeskOfferQuoteWorkbench'
import { OfferAddOperatorPanel } from '@/components/OfferAddOperatorPanel'
import { OfferQuoteFactsBlock } from '@/components/OfferQuoteFactsBlock'
import { SubmittedQuotesHistory } from '@/components/SubmittedQuotesHistory'
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

const QuickDispatchPage = lazy(() => import('@/pages/QuickDispatchPage'))
const ChatPage = lazy(() => import('@/pages/ChatPage'))
const NewTripPage = lazy(() => import('@/pages/NewTripPage'))

type ToolId = 'quick' | 'chat' | 'newtrip'

/** Work tools drawer — Quick Dispatch + Start new request (scratchpad) are top-of-page. */
const TOOLS: {
  id: ToolId | 'scratchpad' | 'parse'
  label: string
  hint: string
}[] = [
  { id: 'scratchpad', label: 'Scratchpad', hint: 'Same full-page notes as pre-login' },
  { id: 'parse', label: 'Parse & shortlist', hint: 'Same desk flow as login → parse' },
  { id: 'newtrip', label: 'Start new request', hint: 'Full trip request form' },
  { id: 'chat', label: 'Chat', hint: "Who's on trips going out" },
]

function StageStrip({
  counts,
  openDrawer,
  onSelect,
}: {
  counts: Record<DispatchDrawerId, number>
  openDrawer: DispatchDrawerId | 'tools' | null
  onSelect: (id: DispatchDrawerId) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {DISPATCH_DRAWERS.map((d) => {
        const count = counts[d.id]
        const active = openDrawer === d.id
        const hot = count > 0
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect(d.id)}
            className={[
              'rounded-xl border px-3 py-3 text-left transition-colors',
              active
                ? 'border-gold/55 bg-surface-2 ring-1 ring-gold/20'
                : hot
                  ? 'border-gold/40 bg-surface hover:border-gold/55'
                  : 'border-border/70 bg-surface hover:border-border',
            ].join(' ')}
          >
            <div
              className={[
                'avionic text-2xl font-semibold leading-none tabular-nums',
                hot ? 'text-gold' : 'text-muted',
              ].join(' ')}
            >
              {count}
            </div>
            <div className="mt-1.5 text-xs leading-snug text-muted">
              {d.shortLabel}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Chip({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'gold' | 'late'
}) {
  return (
    <span
      className={[
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tone === 'late'
          ? 'bg-late/20 text-late'
          : tone === 'gold'
            ? 'bg-gold/15 text-gold'
            : 'border border-border/80 bg-surface-2/80 text-muted',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

function chipTone(chip: string): 'muted' | 'gold' | 'late' {
  if (chip.includes('forklift required')) return 'late'
  if (
    chip.includes('courier') ||
    chip.includes('forklift') ||
    chip.includes('AWB')
  ) {
    return 'gold'
  }
  return 'muted'
}

function WaterfallCardHeader({
  title,
  code,
  meta,
  subtitle,
  chips,
  deletable,
  onDelete,
  titleHref,
}: {
  title: string
  code?: string | null
  meta?: string | null
  subtitle?: string | null
  chips?: string[]
  deletable?: boolean
  onDelete?: () => void
  /** When set, title links through (request cards). */
  titleHref?: string
}) {
  const titleEl = (
    <span className="text-base font-semibold text-cream">{title}</span>
  )
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {titleHref ? (
            <Link to={titleHref} className="hover:opacity-90">
              {titleEl}
            </Link>
          ) : (
            titleEl
          )}
          {code ? (
            <span className="avionic rounded bg-gold px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-ink">
              {code}
            </span>
          ) : null}
          {meta ? <Chip>{meta}</Chip> : null}
          {chips?.map((chip) => (
            <Chip key={chip} tone={chipTone(chip)}>
              {chip}
            </Chip>
          ))}
        </div>
        {!code && subtitle ? (
          <div className="mt-0.5 text-sm text-muted">
            {titleHref ? (
              <Link to={titleHref} className="hover:opacity-90">
                {subtitle}
              </Link>
            ) : (
              subtitle
            )}
          </div>
        ) : null}
      </div>
      {deletable && onDelete ? (
        <button
          type="button"
          aria-label={`Delete ${title}`}
          title="Delete"
          onClick={onDelete}
          className="shrink-0 px-1 py-0.5 text-xs text-muted hover:text-late"
        >
          Delete
        </button>
      ) : null}
    </div>
  )
}

function Drawer({
  id,
  title,
  blurb,
  count,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  blurb: string
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`drawer-${id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2/50"
      >
        <span
          className={[
            'avionic text-sm text-muted transition-transform',
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
            'avionic flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-sm font-semibold tabular-nums',
            count > 0
              ? 'border-gold/55 text-gold'
              : 'border-border/80 text-muted',
          ].join(' ')}
        >
          {count}
        </span>
      </button>
      {open && (
        <div
          id={`drawer-${id}`}
          className="border-t border-border/50 px-3 pb-3 pt-3"
        >
          {children}
        </div>
      )}
    </section>
  )
}

function CardList({
  cards,
  onDeleteCard,
  showBookedActions,
  showTrackingActions,
}: {
  cards: DispatchCard[]
  onDeleteCard: (card: DispatchCard) => void
  /** Approved drawer — invoice + ETA sheet actions. */
  showBookedActions?: boolean
  /** Live tracking — portal, Access chat, Log as complete. */
  showTrackingActions?: boolean
}) {
  if (!cards.length) {
    return <p className="px-1 py-3 text-sm text-muted">Nothing here right now.</p>
  }
  return (
    <ul className="space-y-3">
      {cards.map((c) => {
        const tripId = c.trip_id ?? (c.kind === 'trip' ? c.id : undefined)
        const stayOnCard = Boolean(showBookedActions || showTrackingActions)
        return (
          <li
            key={`${c.kind}-${c.id}`}
            id={tripId ? `offer-trip-${tripId}` : undefined}
            className="rounded-xl border border-border/70 bg-surface-2 px-3.5 py-3.5"
          >
            <WaterfallCardHeader
              title={c.title}
              code={c.code}
              meta={c.meta}
              subtitle={c.subtitle}
              chips={
                c.chips?.length && !showTrackingActions ? c.chips : undefined
              }
              deletable={!showTrackingActions && c.deletable}
              onDelete={() => onDeleteCard(c)}
              titleHref={stayOnCard ? undefined : c.href}
            />
            {showBookedActions && c.booking ? (
              <dl className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                {c.booking.operator_name ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">
                      Operator
                    </dt>
                    <dd className="font-medium text-gold">
                      {c.booking.operator_name}
                    </dd>
                  </div>
                ) : null}
                {c.booking.type_name ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">
                      Aircraft
                    </dt>
                    <dd className="text-cream">{c.booking.type_name}</dd>
                  </div>
                ) : null}
                {c.booking.tail ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">
                      Tail
                    </dt>
                    <dd className="avionic text-cream">{c.booking.tail}</dd>
                  </div>
                ) : null}
                {c.booking.client_total != null ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">
                      Client total
                    </dt>
                    <dd className="avionic text-gold">
                      $
                      {Math.round(c.booking.client_total).toLocaleString(
                        'en-US',
                      )}
                    </dd>
                  </div>
                ) : null}
                {c.booking.po ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">
                      PO
                    </dt>
                    <dd className="avionic text-cream">{c.booking.po}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {(showBookedActions || showTrackingActions) &&
            c.quote_history &&
            c.quote_history.length > 0 ? (
              <SubmittedQuotesHistory
                rows={c.quote_history}
                className="mt-3 border-t border-border/40 pt-3"
              />
            ) : null}
            {showBookedActions && tripId ? (
              <BookedTripActionsPanel tripId={tripId} />
            ) : null}
            {showTrackingActions && tripId ? (
              <LiveTrackingCardActions tripId={tripId} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function recipientTone(status: string, label?: string): string {
  if (status === 'yes' || status === 'quote_submitted' || status === 'selected') {
    return 'text-onplan'
  }
  if (status === 'no' || status === 'stood_down' || status === 'expired') {
    return 'text-muted'
  }
  if (status === 'awaiting' && label?.startsWith('Notified')) {
    return 'text-[#E39B3A]'
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
    <div className="mt-3 space-y-3 rounded-xl border border-gold/45 bg-ink/40 px-3.5 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
        Update request
      </div>
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
  mode = 'offers',
  onAcknowledgeDeclined,
  onDeleteCard,
  onDeleteOffer,
  onApproveCard,
  onApproveOffer,
  approvingId,
}: {
  cards: DispatchCard[]
  focusTripId?: string | null
  /** offers = send; submitted = quotes in; quotes = client price/send */
  mode?: 'offers' | 'submitted' | 'quotes'
  onAcknowledgeDeclined: (tripId: string, offerId: string) => void
  onDeleteCard: (card: DispatchCard) => void
  onDeleteOffer: (tripId: string, offerId: string, name: string) => void
  onApproveCard?: (card: DispatchCard) => void
  onApproveOffer?: (tripId: string, offerId: string, name: string) => void
  approvingId?: string | null
}) {
  const isQuotes = mode === 'quotes'
  const isOffers = mode === 'offers'
  const isSubmitted = mode === 'submitted'
  const [updatingTripId, setUpdatingTripId] = useState<string | null>(null)
  const [addingTripId, setAddingTripId] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const [quotingTripId, setQuotingTripId] = useState<string | null>(
    () => (isQuotes || isSubmitted ? (focusTripId ?? null) : null),
  )
  const [manualQuoteOfferId, setManualQuoteOfferId] = useState<string | null>(
    null,
  )
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    if (!focusTripId) return
    if (isQuotes || isSubmitted) setQuotingTripId(focusTripId)
    if (isOffers && searchParams.get('update') === '1') {
      setUpdatingTripId(focusTripId)
      setAddingTripId(null)
      setQuotingTripId(null)
      setManualQuoteOfferId(null)
    } else if (isOffers && searchParams.get('add') === '1') {
      setAddingTripId(focusTripId)
      setUpdatingTripId(null)
      setQuotingTripId(null)
      setManualQuoteOfferId(null)
    } else if (
      (isOffers || isSubmitted || isQuotes) &&
      searchParams.get('manualQuote')
    ) {
      setManualQuoteOfferId(searchParams.get('manualQuote'))
      setQuotingTripId(focusTripId)
      setAddingTripId(null)
      setUpdatingTripId(null)
    }
  }, [focusTripId, searchParams, isQuotes, isSubmitted, isOffers])

  // Clear inline panels when the trip disappears (delete / hydrate race).
  useEffect(() => {
    const stillHere = (tripId: string | null) =>
      Boolean(
        tripId && cards.some((c) => c.trip_id === tripId || c.id === tripId),
      )
    if (quotingTripId && !stillHere(quotingTripId)) {
      setQuotingTripId(null)
      setManualQuoteOfferId(null)
    }
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
              'rounded-xl border bg-surface-2 px-3.5 py-3.5',
              focused || editing || adding || quoting
                ? 'border-gold/55 ring-1 ring-gold/20'
                : 'border-border/70',
            ].join(' ')}
          >
            <WaterfallCardHeader
              title={c.title}
              code={c.code}
              meta={c.meta}
              chips={c.chips}
              deletable={c.deletable}
              onDelete={() => onDeleteCard(c)}
            />
            {c.recipients &&
            c.recipients.length > 0 &&
            !((isQuotes || isSubmitted || isOffers) && quoting) ? (
              <ul className="mt-3 space-y-3 border-t border-border/40 pt-3">
                {isOffers ? (
                  <>
                    <li className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Sent to
                    </li>
                    {c.recipients.map((r) =>
                      r.declined_acked ? (
                        <li
                          key={r.offer_id}
                          className="flex flex-wrap items-baseline justify-between gap-2 px-0.5 py-1 text-sm text-muted"
                        >
                          <span className="font-semibold text-gold/70">
                            {r.name}
                          </span>
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
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ) : (
                        <li
                          key={r.offer_id}
                          className="space-y-1 px-0.5 py-1 text-sm"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="font-semibold text-gold">
                              {r.name}
                            </span>
                            {r.destination_summary ? (
                              <span className="text-xs text-muted">
                                {r.destination_summary}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span
                              className={`font-medium ${recipientTone(r.status, r.status_label)}`}
                            >
                              {r.status_label}
                            </span>
                            {r.sent_label ? (
                              <span className="avionic text-muted">
                                {r.sent_label}
                              </span>
                            ) : null}
                            {r.status === 'no' && c.trip_id ? (
                              <button
                                type="button"
                                className="font-medium text-gold hover:text-gold-lt"
                                onClick={() =>
                                  onAcknowledgeDeclined(
                                    c.trip_id!,
                                    r.offer_id,
                                  )
                                }
                              >
                                Acknowledge
                              </button>
                            ) : null}
                            {r.status !== 'no' &&
                            r.status !== 'stood_down' &&
                            c.trip_id ? (
                              <button
                                type="button"
                                className="font-semibold text-gold hover:text-gold-lt"
                                onClick={() => {
                                  setUpdatingTripId(null)
                                  setAddingTripId(null)
                                  setUpdateError(null)
                                  setManualQuoteOfferId(r.offer_id)
                                  setQuotingTripId(c.trip_id!)
                                }}
                              >
                                Add quote manually
                              </button>
                            ) : null}
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
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ),
                    )}
                  </>
                ) : (
                  <>
                    <li className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {isSubmitted
                        ? 'Operator quotes submitted'
                        : 'Options for client'}
                    </li>
                    {c.recipients.map((r) => (
                      <li key={r.offer_id} className="px-0.5 py-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="font-semibold text-gold">{r.name}</div>
                          {isQuotes &&
                          c.approvable &&
                          c.trip_id &&
                          r.quote_facts &&
                          onApproveOffer ? (
                            <button
                              type="button"
                              disabled={approvingId === r.offer_id}
                              className="text-xs font-semibold text-gold hover:text-gold-lt disabled:opacity-40"
                              onClick={() =>
                                onApproveOffer(c.trip_id!, r.offer_id, r.name)
                              }
                            >
                              {approvingId === r.offer_id
                                ? 'Approving…'
                                : 'Approve this option'}
                            </button>
                          ) : null}
                        </div>
                        {r.quote_facts ? (
                          <OfferQuoteFactsBlock facts={r.quote_facts} />
                        ) : (
                          <div className="mt-1 text-[11px] text-muted">
                            No quote facts yet
                          </div>
                        )}
                      </li>
                    ))}
                  </>
                )}
              </ul>
            ) : isOffers && !quoting ? (
              <p className="mt-3 text-sm text-muted">
                Not sent to any operators yet — use Send to more operators.
              </p>
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
                key={`quote-${c.trip_id}-${manualQuoteOfferId ?? 'none'}`}
                tripId={c.trip_id}
                initialManualOfferId={manualQuoteOfferId}
                onClose={() => {
                  setQuotingTripId(null)
                  setManualQuoteOfferId(null)
                }}
              />
            ) : null}
            <div className="mt-3.5 flex flex-wrap gap-2">
              {isQuotes && c.approvable && onApproveCard ? (
                <button
                  type="button"
                  disabled={approvingId === c.id}
                  className="rounded-lg bg-gold px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
                  onClick={() => onApproveCard(c)}
                >
                  {approvingId === c.id ? 'Approving…' : 'Approve trip'}
                </button>
              ) : null}
              {(isQuotes || isSubmitted) && c.trip_id ? (
                <button
                  type="button"
                  className={[
                    'rounded-lg px-3.5 py-2.5 text-sm font-semibold',
                    quoting
                      ? 'border border-gold/50 bg-transparent text-gold hover:bg-gold/10'
                      : isQuotes && c.approvable
                        ? 'border border-gold/50 bg-transparent text-gold hover:bg-gold/10'
                        : 'bg-gold text-ink hover:bg-gold-lt',
                  ].join(' ')}
                  onClick={() => {
                    setUpdatingTripId(null)
                    setAddingTripId(null)
                    setUpdateError(null)
                    setManualQuoteOfferId(null)
                    setQuotingTripId(quoting ? null : c.trip_id!)
                  }}
                >
                  {quoting
                    ? 'Close compare'
                    : isSubmitted
                      ? 'Compare & price for client'
                      : 'Compare & price quotes'}
                </button>
              ) : null}
              {isOffers && c.trip_id && c.recipients && c.recipients.length > 0 ? (
                <button
                  type="button"
                  className={[
                    'rounded-lg px-3.5 py-2.5 text-sm font-semibold',
                    quoting
                      ? 'border border-gold/50 bg-transparent text-gold hover:bg-gold/10'
                      : 'border border-gold/50 bg-gold/10 text-gold hover:bg-gold/20',
                  ].join(' ')}
                  onClick={() => {
                    setUpdatingTripId(null)
                    setAddingTripId(null)
                    setUpdateError(null)
                    if (quoting) {
                      setQuotingTripId(null)
                      setManualQuoteOfferId(null)
                    } else {
                      setManualQuoteOfferId(null)
                      setQuotingTripId(c.trip_id!)
                    }
                  }}
                >
                  {quoting ? 'Close quotes' : 'Add quote manually'}
                </button>
              ) : null}
              {isOffers && c.trip_id ? (
                <button
                  type="button"
                  className={[
                    'rounded-lg px-3.5 py-2.5 text-sm font-semibold',
                    adding
                      ? 'border border-gold/50 bg-transparent text-gold hover:bg-gold/10'
                      : 'bg-gold text-ink hover:bg-gold-lt',
                  ].join(' ')}
                  onClick={() => {
                    setUpdatingTripId(null)
                    setQuotingTripId(null)
                    setManualQuoteOfferId(null)
                    setUpdateError(null)
                    setAddingTripId(adding ? null : c.trip_id!)
                  }}
                >
                  {adding ? 'Close send' : 'Send to more operators'}
                </button>
              ) : null}
              {isOffers && c.trip_id ? (
                <button
                  type="button"
                  className={[
                    'rounded-lg border px-3.5 py-2.5 text-sm font-semibold',
                    editing
                      ? 'border-gold/50 bg-gold/10 text-gold'
                      : 'border-gold/50 bg-transparent text-gold hover:bg-gold/10',
                  ].join(' ')}
                  onClick={() => {
                    setAddingTripId(null)
                    setQuotingTripId(null)
                    setManualQuoteOfferId(null)
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
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const toolParam = searchParams.get('tool')
  const [openDrawer, setOpenDrawer] = useState<DispatchDrawerId | 'tools' | null>(
    () =>
      drawerParam && DRAWER_IDS.has(drawerParam)
        ? (drawerParam as DispatchDrawerId)
        : 'requests',
  )
  const [tool, setTool] = useState<ToolId | null>(() =>
    toolParam === 'quick' || toolParam === 'chat' || toolParam === 'newtrip'
      ? toolParam
      : null,
  )
  const [pushError, setPushError] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)

  // Deep link from desk send / share: /dispatch?drawer=offers&focus=<tripId>
  // Quick Dispatch: /dispatch?tool=quick
  // Scratchpad / parse use the same routes as pre-login: / and /desk
  useEffect(() => {
    if (toolParam === 'scratchpad') {
      nav('/', { replace: true })
      return
    }
    if (toolParam === 'parse') {
      nav('/desk', { replace: true })
      return
    }
    if (
      toolParam === 'quick' ||
      toolParam === 'chat' ||
      toolParam === 'newtrip'
    ) {
      setTool(toolParam)
      return
    }
    if (!drawerParam || !DRAWER_IDS.has(drawerParam)) return
    setTool(null)
    setOpenDrawer(drawerParam as DispatchDrawerId)
  }, [drawerParam, toolParam, nav])

  // Pull operator Yes/No / quotes into this browser without a manual refresh.
  useEffect(() => startLiveTripRefresh(4000), [])

  // Scroll only on focus/drawer change — not on every live trip hydrate (jumpy deletes).
  useEffect(() => {
    if (
      !focusTripId ||
      (openDrawer !== 'offers' &&
        openDrawer !== 'quotes' &&
        openDrawer !== 'submitted_quotes' &&
        openDrawer !== 'approved' &&
        openDrawer !== 'tracking')
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

  function approveWaterfallCard(card: DispatchCard) {
    const tripId = card.trip_id ?? (card.kind === 'trip' ? card.id : null)
    if (!tripId || !card.approvable) return
    if (
      !window.confirm(
        `Approve trip?\n\n${card.title}\n\nBooks the trip with the selected / quoted operator, notifies win/stand-down on their offer channel, and moves it to Approved. Invoice + tracking emails stay on Approved for you to confirm recipients.`,
      )
    ) {
      return
    }
    setApproveError(null)
    setApprovingId(card.id)
    void deskApproveTrip(tripId, card.approve_offer_id)
      .then((booked) => {
        setOpenDrawer('approved')
        const next = new URLSearchParams(searchParams)
        next.set('drawer', 'approved')
        next.set('focus', booked.id)
        setSearchParams(next, { replace: true })
      })
      .catch((e) =>
        setApproveError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setApprovingId(null))
  }

  function approveOfferRow(tripId: string, offerId: string, name: string) {
    if (
      !window.confirm(
        `Approve trip with ${name}?\n\nBooks the trip, stands other operators down on their offer channel, and moves to Approved.`,
      )
    ) {
      return
    }
    setApproveError(null)
    setApprovingId(offerId)
    void deskApproveTrip(tripId, offerId)
      .then((booked) => {
        setOpenDrawer('approved')
        const next = new URLSearchParams(searchParams)
        next.set('drawer', 'approved')
        next.set('focus', booked.id)
        setSearchParams(next, { replace: true })
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
            request_id: t.request_id,
            client_name,
            service_pattern: t.service_pattern,
            forklift_required: t.forklift_required,
            forklift_recommended: t.forklift_recommended,
            awb_needed: t.awb_needed,
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

  const stageCounts = useMemo(
    () =>
      Object.fromEntries(
        DISPATCH_DRAWERS.map((d) => [d.id, buckets[d.id].length]),
      ) as Record<DispatchDrawerId, number>,
    [buckets],
  )

  if (tool) {
    const Tool = {
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
            <Tool />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-cream">
            Dispatch center
          </h1>
          <p className="text-sm text-muted">
            Requests → offers → quotes → approved → live tracking.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => nav('/')}
            className="rounded-lg border border-gold/55 bg-transparent px-4 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10"
          >
            Start new request
          </button>
          <button
            type="button"
            onClick={() => setTool('quick')}
            className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold-lt"
          >
            Quick Dispatch
          </button>
        </div>
      </header>

      <StageStrip
        counts={stageCounts}
        openDrawer={openDrawer}
        onSelect={(id) => {
          setOpenDrawer(id)
        }}
      />

      {approveError ? (
        <p className="rounded-lg border border-late/40 bg-late/10 px-3 py-2 text-sm text-late">
          {approveError}
        </p>
      ) : null}

      {scratchPreview ? (
        <div className="rounded-xl border border-gold/40 bg-gold/5 px-3.5 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
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
              onClick={() => nav('/desk')}
              className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-ink hover:bg-gold-lt"
            >
              Parse & shortlist
            </button>
            <button
              type="button"
              onClick={() => nav('/')}
              className="rounded-lg border border-gold/50 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/10"
            >
              Open scratchpad
            </button>
            <button
              type="button"
              onClick={pushToTripRequests}
              className="rounded-lg border border-gold/50 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/10"
            >
              Push to trip requests
            </button>
            <button
              type="button"
              onClick={eraseScratchPad}
              className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-late/50 hover:text-late"
            >
              Erase Scratchpad
            </button>
          </div>
        </div>
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
        >
          {d.id === 'offers' ||
          d.id === 'quotes' ||
          d.id === 'submitted_quotes' ? (
            <OfferTripList
              cards={buckets[d.id]}
              focusTripId={focusTripId}
              mode={
                d.id === 'quotes'
                  ? 'quotes'
                  : d.id === 'submitted_quotes'
                    ? 'submitted'
                    : 'offers'
              }
              onAcknowledgeDeclined={(tripId, offerId) => {
                void acknowledgeDeclinedOffer(tripId, offerId).catch((e) =>
                  console.warn('[dispatch] acknowledge declined', e),
                )
              }}
              onDeleteCard={removeWaterfallCard}
              onDeleteOffer={removeOfferRow}
              onApproveCard={
                d.id === 'quotes' ? approveWaterfallCard : undefined
              }
              onApproveOffer={
                d.id === 'quotes' ? approveOfferRow : undefined
              }
              approvingId={d.id === 'quotes' ? approvingId : null}
            />
          ) : (
            <CardList
              cards={buckets[d.id]}
              onDeleteCard={removeWaterfallCard}
              showBookedActions={d.id === 'approved'}
              showTrackingActions={d.id === 'tracking'}
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
              onClick={() => {
                // Same destinations as pre-login: scratchpad = /, parse = /desk
                if (t.id === 'scratchpad') {
                  nav('/')
                  return
                }
                if (t.id === 'parse') {
                  nav('/desk')
                  return
                }
                setTool(t.id)
              }}
              className="rounded-xl border border-border/70 bg-surface-2 px-3 py-3 text-left hover:border-gold/40"
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
