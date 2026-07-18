import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Link } from 'react-router-dom'
import { NeedsInfoBadge } from '@/components/NeedsInfoBadge'
import { FlightChip } from '@/components/FlightChip'
import { OperatorDocSlots } from '@/components/OperatorDocSlots'
import { loadFleetStatuses } from '@/lib/fleetRadar'
import { loadNetwork } from '@/lib/networkData'
import type { FleetStatus } from '@/domain/fleetStatus'
import type { AircraftRow, NetworkFixture, OperatorRow } from '@/lib/types'
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

export default function NetworkPage() {
  const [data, setData] = useState<NetworkFixture | null>(null)
  const [statusByTail, setStatusByTail] = useState<Map<string, FleetStatus>>(
    () => new Map(),
  )
  const [q, setQ] = useState('')
  const [originIcao, setOriginIcao] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedDocs, setExpandedDocs] = useState<string | null>(null)
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null)
  const [coiNote, setCoiNote] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('board')
  const [adsbBusy, setAdsbBusy] = useState(false)
  const [visibleVerticals, setVisibleVerticals] = useState<Set<VerticalId>>(
    () => new Set(VERTICAL_IDS),
  )

  const complianceRows = useSyncExternalStore(
    subscribeOperatorCompliance,
    listOperatorCompliance,
    () => [],
  )
  const drafts = useSyncExternalStore(
    subscribeOperatorDrafts,
    listOperatorDrafts,
    () => [],
  )
  useSyncExternalStore(subscribeTrips, listTripsStable, () => [])

  async function refreshAdsb() {
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
    })
  }, [bundles, originAp])

  const visibleColumns = useMemo(
    () => board.filter((c) => visibleVerticals.has(c.id)),
    [board, visibleVerticals],
  )

  const namedInsurerFlags = useMemo(() => {
    return complianceRows.filter((c) => {
      if (c.named_insurer) return false
      return isNamedInsurerEligible(c.operator_id, c.operator_name)
    }).length
  }, [complianceRows])

  const selectedBundle = bundles.find((b) => b.op.id === selectedOpId) ?? null

  function toggleVertical(id: VerticalId) {
    setVisibleVerticals((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (error) {
    return <div className="p-8 text-late">Failed to load network: {error}</div>
  }
  if (!data) {
    return <div className="p-8 text-muted">Loading network…</div>
  }

  return (
    <div className="flex flex-col gap-5 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-cream">Network</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="avionic text-cream">{data.counts.operators}</span>{' '}
            operators ·{' '}
            <span className="avionic text-cream">{data.counts.aircraft}</span>{' '}
            aircraft
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
          <div className="flex rounded-md border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setView('board')}
              className={[
                'rounded px-3 py-1.5 text-xs font-medium',
                view === 'board' ? 'bg-gold text-ink' : 'text-muted hover:text-cream',
              ].join(' ')}
            >
              Vertical board
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={[
                'rounded px-3 py-1.5 text-xs font-medium',
                view === 'list' ? 'bg-gold text-ink' : 'text-muted hover:text-cream',
              ].join(' ')}
            >
              Scroll list
            </button>
          </div>
          <Link to="/admin" className="text-sm text-gold hover:text-gold-lt">
            Add operator →
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={originIcao}
          onChange={(e) => setOriginIcao(e.target.value.toUpperCase())}
          placeholder="Origin ICAO — rank every vertical by distance"
          className="min-w-[280px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream placeholder:text-muted outline-none focus:border-gold avionic"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter operator / tail / type…"
          className="w-56 rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream placeholder:text-muted outline-none focus:border-gold"
        />
        <button
          type="button"
          disabled={adsbBusy}
          onClick={() => void refreshAdsb()}
          className="rounded-md border border-gold/40 px-3 py-2 text-xs text-gold hover:bg-gold/10 disabled:opacity-50"
        >
          {adsbBusy ? 'Refreshing…' : 'Refresh ADS-B'}
        </button>
      </div>

      {view === 'board' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md px-2.5 py-1 text-[11px] uppercase tracking-wide text-muted hover:text-cream"
              onClick={() => setVisibleVerticals(new Set(VERTICAL_IDS))}
            >
              All
            </button>
            <button
              type="button"
              className="rounded-md px-2.5 py-1 text-[11px] uppercase tracking-wide text-muted hover:text-cream"
              onClick={() => setVisibleVerticals(new Set())}
            >
              None
            </button>
            {VERTICAL_IDS.map((id) => {
              const on = visibleVerticals.has(id)
              const col = board.find((c) => c.id === id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleVertical(id)}
                  className={[
                    'rounded-md border px-2.5 py-1 text-[11px] transition-colors',
                    on
                      ? 'border-gold/50 bg-gold/15 text-gold'
                      : 'border-border bg-surface text-muted',
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
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {visibleColumns.map((col) => (
                <section
                  key={col.id}
                  className="flex w-[280px] shrink-0 flex-col rounded-lg border border-border bg-surface"
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
                  <ul className="max-h-[62vh] space-y-2 overflow-y-auto p-3">
                    {col.operators.length === 0 && (
                      <li className="px-1 py-4 text-center text-xs text-muted">
                        No operators in this vertical
                      </li>
                    )}
                    {col.operators.map((card, idx) => (
                      <VerticalCard
                        key={`${col.id}:${card.operator_id}`}
                        rank={idx + 1}
                        card={card}
                        selected={selectedOpId === card.operator_id}
                        onSelect={() => setSelectedOpId(card.operator_id)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {selectedBundle && (
            <OperatorDetail
              bundle={selectedBundle}
              statusByTail={statusByTail}
              expandedDocs={expandedDocs}
              setExpandedDocs={setExpandedDocs}
              onClose={() => setSelectedOpId(null)}
            />
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
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={[
          'w-full rounded-md border px-3 py-3 text-left transition-colors',
          selected
            ? 'border-gold bg-gold/10'
            : 'border-border/80 bg-ink/40 hover:border-gold/40',
        ].join(' ')}
      >
        <div className="flex items-start gap-2.5">
          <span className="avionic w-5 shrink-0 pt-0.5 text-xs text-muted">
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-cream">
              {card.operator_name}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted">
              {typesLine(card.types)}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
              <span className="avionic text-cream">
                {card.base_icao ?? '—'}
              </span>
              {card.nm_from_origin != null && (
                <span className="avionic text-gold">
                  {card.nm_from_origin} NM
                </span>
              )}
              <span className="avionic">{card.aircraft_count} tails</span>
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

      <div className="overflow-x-auto">
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
                    {st ? (
                      <FlightChip
                        phase={st.phase}
                        inPosition={st.inPositionOfBase}
                        laddBlocked={st.laddBlocked}
                      />
                    ) : (
                      <span className="text-xs text-muted">—</span>
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
