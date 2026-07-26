/**
 * Dispatch Center — one waterfall dashboard for day-to-day ops.
 * Consolidates Board / call pad / parse / chat / QD / intake / new trip
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
import { Link } from 'react-router-dom'
import {
  DISPATCH_DRAWERS,
  buildDispatchDrawers,
  type DispatchDrawerId,
} from '@/domain/dispatchCenter'
import {
  acknowledgeCheckpoint,
  listUpcomingCheckpoints,
  subscribeCheckpoints,
} from '@/lib/checkpointStore'
import {
  acknowledgeException,
  listExceptions,
  subscribeExceptions,
  syncExceptionsFromTrips,
} from '@/lib/exceptionStore'
import {
  listPendingIntake,
  subscribeIntake,
} from '@/lib/intakeStore'
import { listRequests, subscribeRequests } from '@/lib/requestStore'
import { getScratchPad, subscribeScratchPad } from '@/lib/scratchPadStore'
import { listTripsStable, subscribeTrips } from '@/lib/tripStore'

const ScratchPadPage = lazy(() => import('@/pages/ScratchPadPage'))
const DeskParsePage = lazy(() => import('@/pages/DeskParsePage'))
const QuickDispatchPage = lazy(() => import('@/pages/QuickDispatchPage'))
const ChatPage = lazy(() => import('@/pages/ChatPage'))
const NewTripPage = lazy(() => import('@/pages/NewTripPage'))
const IntakePage = lazy(() => import('@/pages/IntakePage'))

type ToolId =
  | 'callpad'
  | 'parse'
  | 'quick'
  | 'chat'
  | 'newtrip'
  | 'intake'

const TOOLS: { id: ToolId; label: string; hint: string }[] = [
  { id: 'callpad', label: 'Call pad', hint: 'Live phone notes' },
  { id: 'parse', label: 'Parse & shortlist', hint: 'Notes → operators' },
  { id: 'quick', label: 'Quick dispatch', hint: 'Known aircraft → book' },
  { id: 'newtrip', label: 'New trip', hint: 'Full request form' },
  { id: 'intake', label: 'Intake', hint: 'Email / SMS drafts' },
  { id: 'chat', label: 'Chat', hint: 'Trip threads' },
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
}: {
  cards: ReturnType<typeof buildDispatchDrawers>[DispatchDrawerId]
}) {
  if (!cards.length) {
    return <p className="px-1 py-3 text-sm text-muted">Nothing here right now.</p>
  }
  return (
    <ul className="space-y-2">
      {cards.map((c) => (
        <li key={`${c.kind}-${c.id}`}>
          <Link
            to={c.href}
            className="block rounded-md border border-border/70 bg-ink px-3 py-3 hover:border-gold/40"
          >
            <div className="font-medium text-cream">{c.title}</div>
            <div className="mt-0.5 text-sm text-muted">{c.subtitle}</div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function OfferTripList({
  cards,
}: {
  cards: ReturnType<typeof buildDispatchDrawers>['offers']
}) {
  if (!cards.length) {
    return <p className="px-1 py-3 text-sm text-muted">Nothing here right now.</p>
  }
  return (
    <ul className="space-y-3">
      {cards.map((c) => (
        <li
          key={`${c.kind}-${c.id}`}
          className="rounded-md border border-border/70 bg-ink px-3 py-3"
        >
          <div className="font-medium text-cream">{c.title}</div>
          <div className="mt-0.5 text-sm text-muted">{c.subtitle}</div>
          {c.recipients && c.recipients.length > 0 ? (
            <ul className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
              {c.recipients.map((r) => (
                <li
                  key={r.offer_id}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                >
                  <span className="text-cream">
                    {r.name}
                    {r.status === 'quote_submitted' ? (
                      <span className="ml-1.5 text-xs text-gold">
                        · Quote submitted
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={
                      r.status === 'yes' || r.status === 'quote_submitted'
                        ? 'text-xs text-onplan'
                        : r.status === 'no'
                          ? 'text-xs text-muted'
                          : 'text-xs text-gold'
                    }
                  >
                    {r.status_label}
                    {r.quote_summary ? ` · ${r.quote_summary}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={c.href}
              className="rounded-md bg-gold/15 px-2.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/25"
            >
              Open queue
            </Link>
            <Link
              to={`${c.href}?add=1`}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-cream hover:border-gold/40"
            >
              Send to new operator
            </Link>
            <Link
              to={`${c.href}?update=1`}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-cream hover:border-gold/40"
            >
              Update request
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function DispatchCenterPage() {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const requests = useSyncExternalStore(subscribeRequests, listRequests, listRequests)
  const intake = useSyncExternalStore(
    subscribeIntake,
    listPendingIntake,
    listPendingIntake,
  )
  const exceptions = useSyncExternalStore(
    subscribeExceptions,
    listExceptions,
    listExceptions,
  )
  const upcoming = useSyncExternalStore(
    subscribeCheckpoints,
    listUpcomingCheckpoints,
    listUpcomingCheckpoints,
  )
  const scratch = useSyncExternalStore(
    subscribeScratchPad,
    getScratchPad,
    getScratchPad,
  )

  const [openDrawer, setOpenDrawer] = useState<
    DispatchDrawerId | 'tools' | 'exceptions' | null
  >('requests')
  const [tool, setTool] = useState<ToolId | null>(null)

  useEffect(() => {
    syncExceptionsFromTrips(trips)
  }, [trips])

  const buckets = useMemo(
    () =>
      buildDispatchDrawers({
        intake,
        requests,
        trips: trips.map((t) => ({
          id: t.id,
          ref: t.ref,
          lane: t.lane,
          state: t.state,
          quick: t.quick,
          legs: t.legs,
          offers: t.offers,
        })),
      }),
    [intake, requests, trips],
  )

  const openExceptions = exceptions
  const nextChecks = upcoming.slice(0, 6)
  const scratchPreview = scratch.body.trim()

  function toggle(id: DispatchDrawerId | 'tools' | 'exceptions') {
    setOpenDrawer((cur) => (cur === id ? null : id))
    if (id !== 'tools') setTool(null)
  }

  if (tool) {
    const Tool = {
      callpad: ScratchPadPage,
      parse: DeskParsePage,
      quick: QuickDispatchPage,
      chat: ChatPage,
      newtrip: NewTripPage,
      intake: IntakePage,
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
            {TOOLS.find((t) => t.id === tool)?.label}
          </span>
        </div>
        <div className="min-h-[70vh] rounded-lg border border-border bg-ink">
          <Suspense
            fallback={
              <p className="p-6 text-sm text-muted">Loading tool…</p>
            }
          >
            {tool === 'callpad' ? <ScratchPadPage embedded /> : <Tool />}
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-cream">Dispatch center</h1>
        <p className="text-sm text-muted">
          Requests → trip offers → submitted quotes → client quotes → approved →
          live tracking. Open a drawer to work it.
        </p>
      </header>

      {scratchPreview ? (
        <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-gold">
              Call pad has notes
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-gold hover:text-gold-lt"
              onClick={() => setTool('parse')}
            >
              Parse & shortlist →
            </button>
          </div>
          <pre className="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap font-mono text-xs text-cream/80">
            {scratchPreview.slice(0, 280)}
            {scratchPreview.length > 280 ? '…' : ''}
          </pre>
        </div>
      ) : null}

      <Drawer
        id="exceptions"
        title="Exceptions & check-ins"
        blurb="Touch these first"
        count={openExceptions.length + nextChecks.length}
        open={openDrawer === 'exceptions'}
        onToggle={() => toggle('exceptions')}
        attention={openExceptions.length > 0}
      >
        {openExceptions.length === 0 && nextChecks.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted">All clear.</p>
        ) : (
          <ul className="space-y-2">
            {openExceptions.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-late/40 bg-late/10 px-3 py-2.5"
              >
                <div>
                  <div className="text-sm font-medium text-cream">{e.title}</div>
                  <div className="text-xs text-muted">{e.detail}</div>
                </div>
                <button
                  type="button"
                  className="text-xs text-gold"
                  onClick={() => acknowledgeException(e.id)}
                >
                  Ack
                </button>
              </li>
            ))}
            {nextChecks.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-ink px-3 py-2.5"
              >
                <div>
                  <div className="text-sm text-cream">{c.title}</div>
                  <div className="text-xs text-muted">
                    T-{c.trip_ref} · {c.leg_label}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-gold"
                  onClick={() => acknowledgeCheckpoint(c.id)}
                >
                  Done
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

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
          {d.id === 'offers' ? (
            <OfferTripList cards={buckets.offers} />
          ) : (
            <CardList cards={buckets[d.id]} />
          )}
        </Drawer>
      ))}

      <Drawer
        id="tools"
        title="Work tools"
        blurb="Call pad, parse, quick dispatch, chat, new trip, intake"
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
