import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  buildPipeline,
  PIPELINE_STAGES,
  type PipelineCard,
} from '@/domain/pipelineStages'
import { listTrips, listTripsStable, subscribeTrips } from '@/lib/tripStore'
import {
  deleteRequest,
  listRequests,
  subscribeRequests,
} from '@/lib/requestStore'
import {
  acknowledgeException,
  listExceptions,
  subscribeExceptions,
  syncExceptionsFromTrips,
} from '@/lib/exceptionStore'
import {
  endShift,
  getOnShift,
  startShift,
  subscribeShift,
} from '@/lib/shiftStore'
import {
  deleteIntakeDraft,
  listPendingIntake,
  subscribeIntake,
} from '@/lib/intakeStore'
import { listOpenNeedsInfo, subscribeNeedsInfo } from '@/lib/needsInfoStore'

export default function BoardPage() {
  const trips = useSyncExternalStore(subscribeTrips, listTripsStable, listTrips)
  const requests = useSyncExternalStore(subscribeRequests, listRequests, () => [])
  const exceptions = useSyncExternalStore(subscribeExceptions, listExceptions, () => [])
  const onShift = useSyncExternalStore(subscribeShift, getOnShift, () => null)
  const intake = useSyncExternalStore(subscribeIntake, listPendingIntake, () => [])
  const openTasks = useSyncExternalStore(subscribeNeedsInfo, listOpenNeedsInfo, () => [])

  const [shiftName, setShiftName] = useState('')
  const [shiftPhone, setShiftPhone] = useState('+15555550100')

  useEffect(() => {
    syncExceptionsFromTrips(trips)
  }, [trips])

  const columns = useMemo(
    () =>
      buildPipeline({
        intake,
        requests,
        trips: trips.map((t) => ({
          id: t.id,
          ref: t.ref,
          lane: t.lane,
          state: t.state,
          quick: t.quick,
          legs: t.legs,
        })),
      }),
    [intake, requests, trips],
  )

  const activeCount = PIPELINE_STAGES.reduce(
    (n, s) => n + columns[s.id].length,
    0,
  )

  return (
    <div className="flex min-h-full flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:p-8">
      <aside className="w-full shrink-0 space-y-3 lg:w-80">
        <h2 className="text-xs uppercase tracking-wider text-gold">
          Exception queue
        </h2>
        {exceptions.length === 0 && (
          <p className="text-sm text-muted">Quiet — no exceptions</p>
        )}
        {exceptions.map((ex) => (
          <div
            key={ex.id}
            className={[
              'rounded-lg border p-3',
              ex.severity === 'late'
                ? 'border-late/50 bg-late/10'
                : 'border-gold/40 bg-gold/10',
            ].join(' ')}
          >
            <div className="text-sm font-medium text-cream">{ex.title}</div>
            <p className="mt-1 text-xs text-muted">{ex.detail}</p>
            <div className="mt-2 flex gap-3">
              {ex.trip_id && (
                <Link to={`/trips/${ex.trip_id}`} className="text-xs text-gold">
                  Open trip
                </Link>
              )}
              <button
                type="button"
                className="text-xs text-muted"
                onClick={() => acknowledgeException(ex.id)}
              >
                Acknowledge
              </button>
            </div>
          </div>
        ))}

        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-xs uppercase tracking-wider text-muted">
            On shift
          </div>
          {onShift ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-cream">{onShift.person_name}</p>
              <p className="avionic text-xs text-muted">{onShift.phone}</p>
              <button
                type="button"
                className="text-xs text-late"
                onClick={() => endShift()}
              >
                End shift
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="Dispatcher name"
                className="w-full rounded border border-border bg-ink px-2 py-1 text-sm text-cream placeholder:text-muted"
              />
              <input
                value={shiftPhone}
                onChange={(e) => setShiftPhone(e.target.value)}
                placeholder="Ring phone"
                className="avionic w-full rounded border border-border bg-ink px-2 py-1 text-sm text-cream"
              />
              <button
                type="button"
                className="text-xs text-gold"
                onClick={() => {
                  if (!shiftName.trim()) return
                  startShift(shiftName, shiftPhone)
                }}
              >
                Start shift
              </button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted">
            Queues
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              <Link to="/intake" className="text-gold">
                Intake
              </Link>
              <span className="ml-2 avionic text-muted">{intake.length}</span>
            </li>
            <li>
              <Link to="/admin/tasks" className="text-gold">
                NEEDS-INFO
              </Link>
              <span className="ml-2 avionic text-muted">{openTasks.length}</span>
            </li>
            <li>
              <span className="text-muted">Pipeline active</span>
              <span className="ml-2 avionic text-cream">{activeCount}</span>
            </li>
            <li>
              <Link to="/portal" className="text-gold">
                Client portal
              </Link>
            </li>
          </ul>
        </div>

        {columns.out.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs uppercase tracking-wider text-muted">
              Lost / cancelled ({columns.out.length})
            </div>
            <ul className="mt-2 space-y-2">
              {columns.out.map((c) => (
                <li key={`${c.kind}-${c.id}`}>
                  <Link to={c.href} className="text-xs text-muted hover:text-cream">
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-cream">Dispatch Board</h1>
            <p className="mt-1 text-sm text-muted">
              Pipeline: inbound → quote → booked/ETA → tracking → invoice → done.
              Same Trip spine — stages are a view, not a second status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/quick-dispatch"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
            >
              Quick Dispatch
            </Link>
            <Link
              to="/intake"
              className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold/40"
            >
              Intake
            </Link>
            <Link
              to="/trips/new"
              className="rounded-md border border-border px-4 py-2 text-sm text-cream hover:border-gold/40"
            >
              New trip
            </Link>
          </div>
        </header>

        {/* Mobile: stacked stages. Desktop: horizontal columns. */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-2 lg:overflow-x-auto lg:pb-2">
          {PIPELINE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage.id}
              label={stage.label}
              blurb={stage.blurb}
              cards={columns[stage.id]}
              accent={
                stage.id === 'inbound'
                  ? 'gold'
                  : stage.id === 'tracking'
                    ? 'onplan'
                    : 'muted'
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function PipelineColumn({
  label,
  blurb,
  cards,
  accent,
}: {
  label: string
  blurb: string
  cards: PipelineCard[]
  accent: 'gold' | 'onplan' | 'muted'
}) {
  const head =
    accent === 'gold'
      ? 'text-gold'
      : accent === 'onplan'
        ? 'text-onplan'
        : 'text-muted'

  return (
    <section className="flex w-full flex-col rounded-lg border border-border bg-surface/60 lg:w-56 lg:shrink-0">
      <header className="border-b border-border px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={`text-xs uppercase tracking-wider ${head}`}>{label}</h2>
          <span className="avionic text-xs text-muted">{cards.length}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">{blurb}</p>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {cards.length === 0 ? (
          <p className="px-1 py-4 text-center text-[11px] text-muted">—</p>
        ) : (
          cards.map((c) => <PipelineCardView key={`${c.kind}-${c.id}`} card={c} />)
        )}
      </div>
    </section>
  )
}

function PipelineCardView({ card }: { card: PipelineCard }) {
  const border =
    card.kind === 'intake'
      ? 'border-late/40 bg-late/10'
      : card.kind === 'request'
        ? 'border-gold/40 bg-gold/10'
        : 'border-border bg-ink/50'

  return (
    <div className={`rounded-md border px-2.5 py-2 ${border}`}>
      <Link to={card.href} className="block min-w-0 hover:opacity-90">
        <div className="truncate text-sm font-medium text-cream">{card.title}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">
          {card.subtitle}
        </div>
      </Link>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Link to={card.href} className="text-[11px] text-gold hover:text-gold-lt">
          Open →
        </Link>
        {card.kind === 'request' && (
          <button
            type="button"
            className="text-[11px] text-late hover:underline"
            onClick={() => {
              if (
                window.confirm(
                  `Delete request R-${card.ref}? This cannot be undone.`,
                )
              ) {
                deleteRequest(card.id)
              }
            }}
          >
            Delete
          </button>
        )}
        {card.kind === 'intake' && (
          <button
            type="button"
            className="text-[11px] text-late hover:underline"
            onClick={() => {
              if (
                window.confirm(
                  `Delete intake “${card.title}”? This cannot be undone.`,
                )
              ) {
                deleteIntakeDraft(card.id)
              }
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
