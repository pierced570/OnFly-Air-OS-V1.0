import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Link } from 'react-router-dom'
import { NeedsInfoBadge } from '@/components/NeedsInfoBadge'
import { FlightChip } from '@/components/FlightChip'
import { OperatorDocSlots } from '@/components/OperatorDocSlots'
import { isRealAdsbEnabled } from '@/adapters/adsb'
import { loadFleetStatuses } from '@/lib/fleetRadar'
import { loadNetwork, type LoadedNetwork } from '@/lib/networkData'
import type { FleetStatus } from '@/domain/fleetStatus'
import type { AircraftRow, OperatorRow } from '@/lib/types'
import {
  ensureOperatorCompliance,
  getOperatorCompliance,
  listOperatorCompliance,
  setNamedInsurer,
  setOperatorContactEmail,
  setOperatorDocExpiry,
  setOperatorDocFile,
  subscribeOperatorCompliance,
  type OperatorDocKind,
} from '@/lib/operatorComplianceStore'
import {
  countCompletedTripsForOperator,
  isNamedInsurerEligible,
  namedInsurerTripThreshold,
} from '@/lib/operatorTrips'
import { runCoiExpiryReminders } from '@/lib/coiExpiry'
import {
  listOperatorDrafts,
  subscribeOperatorDrafts,
} from '@/lib/operatorDraftStore'
import { subscribeTrips, listTripsStable } from '@/lib/tripStore'
import { lookupAirport } from '@/domain/airports'
import { haversineNm } from '@/domain/geo'
import { parseDims, type DimLengthUnit } from '@/domain/dimsParser'
import { DimUnitToggle } from '@/components/DimUnitToggle'
import { rankOperatorsForMission } from '@/domain/missionFit'
import { loadFleetForMissionFit } from '@/lib/fleetRouting'
import {
  VERTICAL_IDS,
  VERTICAL_LABELS,
  buildVerticalBoard,
  type OperatorVerticalCard,
  type VerticalId,
} from '@/domain/operatorVerticals'

type ViewMode = 'board' | 'list'

type OpBundle = {
  op: OperatorRow
  aircraft: AircraftRow[]
  source: 'network' | 'draft'
}

function typesLine(types: string[], max = 2): string {
  if (!types.length) return '—'
  const shown = types.slice(0, max)
  const extra = types.length - shown.length
  return extra > 0 ? `${shown.join(' · ')} +${extra}` : shown.join(' · ')
}

/** Real N-numbers for board cards (skip TBD placeholders). */
function displayTails(tails: string[], max = 4): { shown: string[]; extra: number } {
  const real = tails.filter((t) => t && !t.toUpperCase().startsWith('TBD'))
  return { shown: real.slice(0, max), extra: Math.max(0, real.length - max) }
}

export default function NetworkPage() {
  const [data, setData] = useState<LoadedNetwork | null>(null)
  const [statusByTail, setStatusByTail] = useState<Map<string, FleetStatus>>(
    () => new Map(),
  )
  const [q, setQ] = useState('')
  const [originIcao, setOriginIcao] = useState('')
  const [cargoDims, setCargoDims] = useState('')
  const [dimUnit, setDimUnit] = useState<DimLengthUnit>('in')
  const [error, setError] = useState<string | null>(null)
  const [expandedDocs, setExpandedDocs] = useState<string | null>(null)
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null)
  const [coiNote, setCoiNote] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('board')
  const [adsbBusy, setAdsbBusy] = useState(false)
  const [missionFleet, setMissionFleet] = useState<
    Awaited<ReturnType<typeof loadFleetForMissionFit>>
  >([])
  const [visibleVerticals, setVisibleVerticals] = useState<Set<VerticalId>>(
    () => new Set(VERTICAL_IDS),
  )
  const detailRef = useRef<HTMLDivElement | null>(null)

  const complianceRows = useSyncExternalStore(
    subscribeOperatorCompliance,
    listOperatorCompliance,
    listOperatorCompliance,
  )
  const drafts = useSyncExternalStore(
    subscribeOperatorDrafts,
    listOperatorDrafts,
    listOperatorDrafts,
  )
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)

  const adsbLive = isRealAdsbEnabled()

  async function refreshAdsb() {
    if (!isRealAdsbEnabled()) {
      setStatusByTail(new Map())
      return
    }
    setAdsbBusy(true)
    try {
      const rows = await loadFleetStatuses(500)
      setStatusByTail(new Map(rows.map((s) => [s.tail, s])))
    } finally {
      setAdsbBusy(false)
    }
  }

  useEffect(() => {
    loadNetwork()
      .then((net) => {
        setData(net)
        for (const op of net.operators) {
          ensureOperatorCompliance({
            operator_id: op.id,
            operator_name: op.name,
          })
        }
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
    void refreshAdsb()
    void loadFleetForMissionFit().then(setMissionFleet)
    void runCoiExpiryReminders().then((r) => {
      if (r.sentTo.length) {
        setCoiNote(
          `COI expiry: emailed ${r.sentTo.length} operator${r.sentTo.length === 1 ? '' : 's'} for updated certificates.`,
        )
      }
    })
  }, [])

  useEffect(() => {
    for (const d of drafts) {
      ensureOperatorCompliance({
        operator_id: d.id,
        operator_name: d.name,
        contact_email: d.contacts[0]?.email ?? '',
      })
    }
  }, [drafts])

  const bundles: OpBundle[] = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    const networkIds = new Set(data.operators.map((o) => o.id))

    const fromNetwork = data.operators
      .map((op) => {
        const aircraft = data.aircraft.filter((a) => a.operator_id === op.id)
        if (!needle) return { op, aircraft, source: 'network' as const }
        const hit =
          op.name.toLowerCase().includes(needle) ||
          aircraft.some(
            (a) =>
              a.tail.toLowerCase().includes(needle) ||
              (a.type_name ?? '').toLowerCase().includes(needle) ||
              (a.base_icao ?? '').toLowerCase().includes(needle),
          )
        return hit ? { op, aircraft, source: 'network' as const } : null
      })
      .filter(Boolean) as OpBundle[]

    const fromDrafts = drafts
      .filter((d) => !networkIds.has(d.id))
      .map((d) => {
        const op: OperatorRow = {
          id: d.id,
          name: d.name,
          base_icao: d.base_icao || null,
          needs_info: [],
          aircraft_count: d.aircraft.length,
        }
        const aircraft: AircraftRow[] = d.aircraft.map((a, i) => ({
          id: `${d.id}:${a.tail}:${i}`,
          operator_id: d.id,
          operator_name: d.name,
          tail: a.tail,
          type_name: a.type_name,
          category: null,
          engines: null,
          base_icao: d.base_icao || null,
          cruise_kts: null,
          mtow_lbs: null,
          max_payload_lbs: null,
          seats: null,
          fet_applies: null,
          needs_info: [],
          active: true,
        }))
        if (!needle) return { op, aircraft, source: 'draft' as const }
        const hit =
          d.name.toLowerCase().includes(needle) ||
          aircraft.some((a) => a.tail.toLowerCase().includes(needle))
        return hit ? { op, aircraft, source: 'draft' as const } : null
      })
      .filter(Boolean) as OpBundle[]

    return [...fromDrafts, ...fromNetwork]
  }, [data, q, drafts])

  const originAp = useMemo(() => {
    const code = originIcao.trim().toUpperCase()
    if (code.length < 3) return null
    return lookupAirport(code)
  }, [originIcao])

  const dimsParsed = useMemo(
    () => parseDims(cargoDims, { unit: dimUnit }),
    [cargoDims, dimUnit],
  )
  const missionPieces = dimsParsed.pieces

  const missionRank = useMemo(() => {
    if (!missionPieces.length || !missionFleet.length) return []
    const origin = originAp
      ? { lat: originAp.lat, lon: originAp.lon }
      : null
    return rankOperatorsForMission(missionFleet, missionPieces, origin)
  }, [missionPieces, missionFleet, originAp])

  const fitByOperator = useMemo(() => {
    const m = new Map<
      string,
      {
        score: number
        door: 'fits' | 'no_fit' | 'unknown'
        hard_fail: boolean
        label?: 'best_fit' | 'closest' | 'best_payload'
        reasons: string[]
        nm_from_origin: number | null
      }
    >()
    for (const r of missionRank) {
      m.set(r.operator_id, {
        score: r.best.score,
        door: r.best.door,
        hard_fail: r.best.hard_fail,
        label: r.label,
        reasons: r.best.reasons,
        nm_from_origin: r.nm_from_origin,
      })
    }
    return m
  }, [missionRank])

  const board = useMemo(() => {
    return buildVerticalBoard({
      operators: bundles.map((b) => b.op),
      aircraft: bundles.flatMap((b) => b.aircraft),
      origin: originAp
        ? { lat: originAp.lat, lon: originAp.lon }
        : null,
      nmFrom: haversineNm,
      lookupBase: (icao) => {
        const ap = lookupAirport(icao)
        return ap ? { lat: ap.lat, lon: ap.lon } : null
      },
      fitByOperator: missionPieces.length ? fitByOperator : undefined,
    })
  }, [bundles, originAp, fitByOperator, missionPieces.length])

  const topPicks = useMemo(
    () => missionRank.filter((r) => !r.best.hard_fail).slice(0, 5),
    [missionRank],
  )

  const visibleColumns = useMemo(() => {
    const cols = board.filter((c) => visibleVerticals.has(c.id))
    // Non-empty first so the board isn’t a long slide through blanks.
    return [...cols].sort((a, b) => {
      const ae = a.operator_count > 0 ? 0 : 1
      const be = b.operator_count > 0 ? 0 : 1
      if (ae !== be) return ae - be
      return 0
    })
  }, [board, visibleVerticals])

  const filledColumns = useMemo(
    () => visibleColumns.filter((c) => c.operator_count > 0),
    [visibleColumns],
  )

  // With every vertical on, hide empties so the board isn’t a sideways slog.
  // Narrower chip selection shows empties so you can inspect a class.
  const displayColumns = useMemo(() => {
    if (visibleVerticals.size === VERTICAL_IDS.length) return filledColumns
    return visibleColumns
  }, [visibleVerticals, filledColumns, visibleColumns])

  const emptyHiddenCount = useMemo(() => {
    if (visibleVerticals.size !== VERTICAL_IDS.length) return 0
    return visibleColumns.length - filledColumns.length
  }, [visibleVerticals, visibleColumns, filledColumns])

  const namedInsurerFlags = useMemo(() => {
    return complianceRows.filter((c) => {
      if (c.named_insurer) return false
      return isNamedInsurerEligible(c.operator_id, c.operator_name)
    }).length
  }, [complianceRows])

  const selectedBundle = bundles.find((b) => b.op.id === selectedOpId) ?? null

  useEffect(() => {
    if (!selectedOpId || !detailRef.current) return
    detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedOpId])

  function toggleVertical(id: VerticalId) {
    setVisibleVerticals((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (error) {
    return <div className="p-4 text-late sm:p-8">Failed to load network: {error}</div>
  }
  if (!data) {
    return <div className="p-4 text-muted sm:p-8">Loading network…</div>
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-cream sm:text-2xl">Network</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="avionic text-cream">{data.counts.operators}</span>{' '}
            operators ·{' '}
            <span className="avionic text-cream">{data.counts.aircraft}</span>{' '}
            aircraft
            {' · '}
            <span className="text-muted">
              {data.source === 'live' ? 'live DB' : 'bundled fixture'}
            </span>
            {namedInsurerFlags > 0 && (
              <>
                {' '}
                ·{' '}
                <span className="text-gold">
                  {namedInsurerFlags} named-insurer flag
                  {namedInsurerFlags === 1 ? '' : 's'}
                </span>
              </>
            )}
          </p>
          {coiNote && <p className="mt-1 text-xs text-gold">{coiNote}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex w-full rounded-md border border-border bg-surface p-0.5 sm:w-auto">
            <button
              type="button"
              onClick={() => setView('board')}
              className={[
                'flex-1 rounded px-3 py-2 text-xs font-medium sm:flex-none sm:py-1.5',
                view === 'board' ? 'bg-gold text-ink' : 'text-muted hover:text-cream',
              ].join(' ')}
            >
              Board
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={[
                'flex-1 rounded px-3 py-2 text-xs font-medium sm:flex-none sm:py-1.5',
                view === 'list' ? 'bg-gold text-ink' : 'text-muted hover:text-cream',
              ].join(' ')}
            >
              List
            </button>
          </div>
          <Link to="/admin" className="text-sm text-gold hover:text-gold-lt">
            Add operator →
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
        <div className="text-xs uppercase tracking-wider text-muted">
          Mission fit
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[8rem_9rem_1fr_10rem_auto] lg:items-end lg:gap-3">
          <input
            value={originIcao}
            onChange={(e) => setOriginIcao(e.target.value.toUpperCase())}
            placeholder="Origin ICAO"
            inputMode="text"
            autoCapitalize="characters"
            className="w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream placeholder:text-muted outline-none focus:border-gold avionic sm:py-2"
          />
          <DimUnitToggle value={dimUnit} onChange={setDimUnit} />
          <input
            value={cargoDims}
            onChange={(e) => setCargoDims(e.target.value)}
            placeholder={
              dimUnit === 'ft'
                ? 'Cargo dims — 3 skids 4x3.5x5 @ 800ea (ft)'
                : 'Cargo dims — 3 skids 48x40x60 @ 800ea (in)'
            }
            className="w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream placeholder:text-muted outline-none focus:border-gold sm:col-span-2 sm:py-2 lg:col-span-1"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter name / tail…"
            className="w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream placeholder:text-muted outline-none focus:border-gold sm:py-2"
          />
          {adsbLive ? (
            <button
              type="button"
              disabled={adsbBusy}
              onClick={() => void refreshAdsb()}
              className="w-full rounded-md border border-gold/40 px-3 py-2.5 text-xs text-gold hover:bg-gold/10 disabled:opacity-50 sm:w-auto sm:py-2"
            >
              {adsbBusy ? 'Refreshing…' : 'Refresh ADS-B'}
            </button>
          ) : (
            <span
              className="w-full rounded-md border border-border px-3 py-2.5 text-xs text-muted sm:w-auto sm:py-2"
              title="Set VITE_ADSB_ADAPTER=real when the provider API is ready"
            >
              ADS-B pending API
            </span>
          )}
        </div>
        {cargoDims.trim() && (
          <p className="text-xs text-muted">
            Parsed {missionPieces.length} piece line
            {missionPieces.length === 1 ? '' : 's'}
            {dimsParsed.confidence !== 'high'
              ? ` · confidence ${dimsParsed.confidence}`
              : ''}
            {originAp
              ? ` · ranking from ${originAp.icao}`
              : ' · add origin ICAO to score closest'}
            . Door dims from type specs; missing door = flagged, not dropped.
          </p>
        )}
        {topPicks.length > 0 && (
          <ol className="flex flex-wrap gap-2">
            {topPicks.map((p, i) => (
              <li key={p.operator_id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOpId(p.operator_id)
                    setView('board')
                  }}
                  className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-left text-xs text-cream hover:bg-gold/20 sm:py-1.5"
                >
                  <span className="avionic text-gold">{i + 1}.</span>{' '}
                  <span className="font-medium">{p.operator_name}</span>
                  {p.label === 'best_fit' && (
                    <span className="ml-1 text-gold">best fit</span>
                  )}
                  {p.label === 'closest' && (
                    <span className="ml-1 text-gold">closest</span>
                  )}
                  {p.nm_from_origin != null && (
                    <span className="ml-1 avionic text-muted">
                      {p.nm_from_origin} NM
                    </span>
                  )}
                  <span className="ml-1 text-muted">
                    · {p.best.type_name ?? p.best.tail}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {view === 'board' && (
        <>
          <div className="board-rail flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              className="shrink-0 rounded-md px-3 py-2.5 text-[11px] uppercase tracking-wide text-muted hover:text-cream sm:py-1.5"
              onClick={() => setVisibleVerticals(new Set(VERTICAL_IDS))}
            >
              All
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md px-3 py-2.5 text-[11px] uppercase tracking-wide text-muted hover:text-cream sm:py-1.5"
              onClick={() => setVisibleVerticals(new Set())}
            >
              None
            </button>
            {VERTICAL_IDS.map((id) => {
              const on = visibleVerticals.has(id)
              const col = board.find((c) => c.id === id)
              const empty = !col || col.operator_count === 0
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleVertical(id)}
                  className={[
                    'shrink-0 rounded-md border px-3 py-2.5 text-[11px] transition-colors whitespace-nowrap sm:py-1.5',
                    on
                      ? 'border-gold/50 bg-gold/15 text-gold'
                      : 'border-border bg-surface text-muted',
                    empty ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  {VERTICAL_LABELS[id]}
                  {col ? (
                    <span className="ml-1 avionic opacity-70">
                      {col.operator_count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {visibleColumns.length === 0 ? (
            <p className="text-sm text-muted">
              No verticals selected — turn one on above.
            </p>
          ) : displayColumns.length === 0 ? (
            <p className="text-sm text-muted">
              No operators in the selected verticals.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 sm:gap-4">
                {displayColumns.map((col) => (
                  <section
                    key={col.id}
                    className="flex min-h-0 flex-col rounded-lg border border-border bg-surface"
                  >
                    <header className="border-b border-border px-4 py-3">
                      <h2 className="text-sm font-medium text-cream">
                        {col.label}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="avionic text-cream">
                          {col.operator_count}
                        </span>{' '}
                        ops ·{' '}
                        <span className="avionic text-cream">
                          {col.aircraft_count}
                        </span>{' '}
                        tails
                      </p>
                    </header>
                    <ul className="max-h-[50vh] space-y-2 overflow-y-auto p-3 sm:max-h-[58vh]">
                      {col.operators.length === 0 ? (
                        <li className="px-1 py-4 text-center text-xs text-muted">
                          No operators in this vertical
                        </li>
                      ) : (
                        col.operators.map((card, idx) => (
                          <VerticalCard
                            key={`${col.id}:${card.operator_id}`}
                            rank={idx + 1}
                            card={card}
                            selected={selectedOpId === card.operator_id}
                            onSelect={() => setSelectedOpId(card.operator_id)}
                          />
                        ))
                      )}
                    </ul>
                  </section>
                ))}
              </div>
              {emptyHiddenCount > 0 && (
                <p className="text-[11px] text-muted">
                  {emptyHiddenCount} empty vertical
                  {emptyHiddenCount === 1 ? '' : 's'} hidden — select a chip to
                  inspect one.
                </p>
              )}
            </>
          )}

          {selectedBundle && (
            <div ref={detailRef}>
              <OperatorDetail
                bundle={selectedBundle}
                statusByTail={statusByTail}
                expandedDocs={expandedDocs}
                setExpandedDocs={setExpandedDocs}
                onClose={() => setSelectedOpId(null)}
              />
            </div>
          )}
        </>
      )}

      {view === 'list' && (
        <div className="space-y-4">
          {bundles.map((bundle) => (
            <OperatorDetail
              key={bundle.op.id}
              bundle={bundle}
              statusByTail={statusByTail}
              expandedDocs={expandedDocs}
              setExpandedDocs={setExpandedDocs}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function VerticalCard({
  rank,
  card,
  selected,
  onSelect,
}: {
  rank: number
  card: OperatorVerticalCard
  selected: boolean
  onSelect: () => void
}) {
  const fail = Boolean(card.fit_hard_fail)
  const { shown: tailsShown, extra: tailsExtra } = displayTails(card.tails)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        title={card.fit_reasons?.join(' · ') || undefined}
        className={[
          'w-full rounded-md border px-3 py-3 text-left transition-colors',
          selected
            ? 'border-gold bg-gold/10'
            : fail
              ? 'border-border/50 bg-ink/20 opacity-60 hover:opacity-90'
              : 'border-border/80 bg-ink/40 hover:border-gold/40',
        ].join(' ')}
      >
        <div className="flex items-start gap-2.5">
          <span className="avionic w-5 shrink-0 pt-0.5 text-xs text-muted">
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-cream">
                {card.operator_name}
              </span>
              {card.fit_label === 'best_fit' && (
                <span className="rounded border border-gold/40 bg-gold/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gold">
                  best fit
                </span>
              )}
              {card.fit_label === 'closest' && (
                <span className="rounded border border-onplan/40 bg-onplan/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-onplan">
                  closest
                </span>
              )}
              {card.fit_door === 'unknown' && !fail && (
                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  door?
                </span>
              )}
              {fail && (
                <span className="rounded border border-late/40 bg-late/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-late">
                  no fit
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted">
              {typesLine(card.types)}
            </div>
            {tailsShown.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 avionic text-[11px] text-gold">
                {tailsShown.map((t) => (
                  <span key={t}>{t}</span>
                ))}
                {tailsExtra > 0 && (
                  <span className="text-muted">+{tailsExtra}</span>
                )}
              </div>
            ) : (
              <div className="mt-1.5 text-[11px] text-muted">No N-numbers yet</div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
              <span className="avionic text-cream">
                {card.base_icao ?? '—'}
              </span>
              {card.nm_from_origin != null && (
                <span className="avionic text-gold">
                  {card.nm_from_origin} NM
                </span>
              )}
              <span className="avionic">{card.aircraft_count} ac</span>
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}

function OperatorDetail({
  bundle,
  statusByTail,
  expandedDocs,
  setExpandedDocs,
  onClose,
}: {
  bundle: OpBundle
  statusByTail: Map<string, FleetStatus>
  expandedDocs: string | null
  setExpandedDocs: Dispatch<SetStateAction<string | null>>
  onClose?: () => void
}) {
  const { op, aircraft, source } = bundle
  const needs =
    op.needs_info.length +
    aircraft.reduce((n, a) => n + a.needs_info.length, 0)
  const compliance =
    getOperatorCompliance(op.id) ??
    ensureOperatorCompliance({
      operator_id: op.id,
      operator_name: op.name,
    })
  const completed = countCompletedTripsForOperator(op.id, op.name)
  const eligible = completed >= namedInsurerTripThreshold()
  const docsOpen = expandedDocs === op.id

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="font-medium text-cream">
            {op.name}
            {source === 'draft' && (
              <span className="ml-2 text-xs font-normal text-gold">
                wizard draft
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            Base{' '}
            <span className="avionic text-cream">{op.base_icao ?? '—'}</span>
            {' · '}
            <span className="avionic">{aircraft.length}</span> tails
            {' · '}
            <span className="avionic">{completed}</span> completed trips
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {eligible && !compliance.named_insurer && (
            <span className="rounded border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold">
              Flag: add OnFly as named insurer
            </span>
          )}
          <label
            className="flex items-center gap-2 text-xs text-muted"
            title={
              eligible
                ? 'Mark when OnFly is listed as named insured on their COI'
                : `Unlocks after ${namedInsurerTripThreshold()} completed trips`
            }
          >
            <span className={eligible ? 'text-cream' : 'text-muted'}>
              Named insurer
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={compliance.named_insurer}
              disabled={!eligible && !compliance.named_insurer}
              onClick={() => setNamedInsurer(op.id, !compliance.named_insurer)}
              className={[
                'relative h-5 w-9 rounded-full transition-colors',
                compliance.named_insurer ? 'bg-onplan' : 'bg-border',
                !eligible && !compliance.named_insurer ? 'opacity-40' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-0.5 h-4 w-4 rounded-full bg-cream transition-transform',
                  compliance.named_insurer ? 'translate-x-4' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </label>
          <button
            type="button"
            className="text-xs text-gold hover:text-gold-lt"
            onClick={() =>
              setExpandedDocs((id) => (id === op.id ? null : op.id))
            }
          >
            {docsOpen ? 'Hide docs' : 'Docs / COI'}
          </button>
          <NeedsInfoBadge count={needs} />
          {onClose && (
            <button
              type="button"
              className="text-xs text-muted hover:text-cream"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {docsOpen && (
        <div className="border-b border-border px-4 py-4">
          <label className="mb-3 block text-xs text-muted">
            Ops email (COI expiry reminders)
            <input
              type="email"
              className="mt-1 w-full max-w-md rounded-md border border-border bg-ink px-2 py-1.5 text-sm text-cream"
              value={compliance.contact_email}
              onChange={(e) => setOperatorContactEmail(op.id, e.target.value)}
              placeholder="ops@operator.com"
            />
          </label>
          <OperatorDocSlots
            compliance={compliance}
            onUpload={(kind: OperatorDocKind, file: File) => {
              void setOperatorDocFile(op.id, kind, file)
            }}
            onExpiryChange={(kind, expiresOn) =>
              setOperatorDocExpiry(op.id, kind, expiresOn)
            }
          />
        </div>
      )}

      {/* Mobile: stacked cards */}
      <ul className="divide-y divide-border/60 sm:hidden">
        {aircraft.map((a) => {
          const st = statusByTail.get(a.tail)
          return (
            <li key={a.id} className="space-y-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="avionic text-gold">{a.tail}</span>
                <NeedsInfoBadge count={a.needs_info.length} />
              </div>
              <div className="text-sm text-cream">{a.type_name ?? '—'}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="avionic">{a.base_icao ?? '—'}</span>
                {a.cruise_kts != null && (
                  <span className="avionic">{a.cruise_kts} kt</span>
                )}
                {a.mtow_lbs != null && (
                  <span className="avionic">{a.mtow_lbs.toLocaleString()} lb</span>
                )}
              </div>
              {st && isRealAdsbEnabled() ? (
                <FlightChip
                  phase={st.phase}
                  inPosition={st.inPositionOfBase}
                  laddBlocked={st.laddBlocked}
                />
              ) : (
                <span className="text-[11px] text-muted">ADS-B pending</span>
              )}
            </li>
          )
        })}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Tail</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Base</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Cruise</th>
              <th className="px-4 py-2 font-medium">MTOW</th>
              <th className="px-4 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {aircraft.map((a) => {
              const st = statusByTail.get(a.tail)
              return (
                <tr key={a.id} className="border-t border-border/60">
                  <td className="avionic px-4 py-2 text-gold">{a.tail}</td>
                  <td className="px-4 py-2 text-cream">{a.type_name ?? '—'}</td>
                  <td className="avionic px-4 py-2 text-muted">
                    {a.base_icao ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    {st && isRealAdsbEnabled() ? (
                      <FlightChip
                        phase={st.phase}
                        inPosition={st.inPositionOfBase}
                        laddBlocked={st.laddBlocked}
                      />
                    ) : (
                      <span className="text-xs text-muted">
                        {isRealAdsbEnabled() ? '—' : 'pending'}
                      </span>
                    )}
                  </td>
                  <td className="avionic px-4 py-2 text-muted">
                    {a.cruise_kts != null ? `${a.cruise_kts} kt` : '—'}
                  </td>
                  <td className="avionic px-4 py-2 text-muted">
                    {a.mtow_lbs != null ? a.mtow_lbs.toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <NeedsInfoBadge count={a.needs_info.length} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
