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
import {
  DISPATCH_DRAWERS,
  buildDispatchDrawers,
  type DispatchCard,
  type DispatchDrawerId,
} from '@/domain/dispatchCenter'
import { absoluteAppUrl } from '@/lib/appUrl'
import {
  listRequests,
  pushScratchPadToTripRequest,
  subscribeRequests,
} from '@/lib/requestStore'
import {
  clearScratchPad,
  getScratchPad,
  subscribeScratchPad,
} from '@/lib/scratchPadStore'
import { listTripsStable, subscribeTrips } from '@/lib/tripStore'

const ScratchPadPage = lazy(() => import('@/pages/ScratchPadPage'))
const DeskParsePage = lazy(() => import('@/pages/DeskParsePage'))
const QuickDispatchPage = lazy(() => import('@/pages/QuickDispatchPage'))
const ChatPage = lazy(() => import('@/pages/ChatPage'))
const NewTripPage = lazy(() => import('@/pages/NewTripPage'))

type ToolId = 'scratchpad' | 'parse' | 'quick' | 'chat' | 'newtrip'

/** Work tools drawer — Quick Dispatch is a top-of-page button, not here. */
const TOOLS: { id: Exclude<ToolId, 'quick'>; label: string; hint: string }[] = [
  { id: 'scratchpad', label: 'Scratchpad', hint: 'Live phone notes' },
  { id: 'parse', label: 'Parse & shortlist', hint: 'Notes → operators' },
  { id: 'newtrip', label: 'New trip', hint: 'Full request form' },
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

function CardList({ cards }: { cards: DispatchCard[] }) {
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

function recipientTone(status: string): string {
  if (status === 'yes' || status === 'quote_submitted' || status === 'selected') {
    return 'text-onplan'
  }
  if (status === 'no' || status === 'stood_down' || status === 'expired') {
    return 'text-muted'
  }
  return 'text-gold'
}

function OfferTripList({
  cards,
  focusTripId,
}: {
  cards: ReturnType<typeof buildDispatchDrawers>['offers']
  focusTripId?: string | null
}) {
  if (!cards.length) {
    return <p className="px-1 py-3 text-sm text-muted">Nothing here right now.</p>
  }
  return (
    <ul className="space-y-3">
      {cards.map((c) => {
        const focused = Boolean(focusTripId && c.trip_id === focusTripId)
        return (
          <li
            key={`${c.kind}-${c.id}`}
            id={c.trip_id ? `offer-trip-${c.trip_id}` : undefined}
            className={[
              'rounded-md border bg-ink px-3 py-3',
              focused
                ? 'border-gold/60 ring-1 ring-gold/30'
                : 'border-border/70',
            ].join(' ')}
          >
            <div className="font-medium text-cream">{c.title}</div>
            <div className="mt-0.5 text-sm text-muted">{c.subtitle}</div>
            <p className="mt-1 text-xs text-muted">
              Share each offer link — operators are not auto-pinged. Status
              updates when they answer Yes / No or submit a quote.
            </p>
            {c.recipients && c.recipients.length > 0 ? (
              <ul className="mt-2 space-y-2 border-t border-border/50 pt-2">
                {c.recipients.map((r) => (
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
                    <div className="mt-1 font-mono text-[11px] text-muted">
                      {r.destination_summary}
                    </div>
                    {r.destination_gaps.length > 0 ? (
                      <div className="mt-0.5 text-[11px] text-late">
                        {r.destination_gaps.join(' · ')}
                      </div>
                    ) : null}
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
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={c.href}
                className="rounded-md bg-gold/15 px-2.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/25"
              >
                Manage trip offers
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

  useEffect(() => {
    if (!focusTripId || openDrawer !== 'offers') return
    const el = document.getElementById(`offer-trip-${focusTripId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusTripId, openDrawer, trips])

  const buckets = useMemo(
    () =>
      buildDispatchDrawers({
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
    [requests, trips],
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
        <button
          type="button"
          onClick={() => setTool('quick')}
          className="shrink-0 rounded-md bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold-lt"
        >
          Quick Dispatch
        </button>
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
            <OfferTripList cards={buckets.offers} focusTripId={focusTripId} />
          ) : (
            <CardList cards={buckets[d.id]} />
          )}
        </Drawer>
      ))}

      <Drawer
        id="tools"
        title="Work tools"
        blurb="Scratchpad, parse, chat, new trip"
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
