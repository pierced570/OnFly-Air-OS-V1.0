/**
 * Network → Operators → View by state
 * Part 135 State Fleet Browser — match OnFly_Part135_Fleet_Review.html.
 */

import { useMemo, useState } from 'react'
import {
  PART135_CATS,
  PART135_CAT_LABELS,
  PART135_FLEET_CAVEATS,
  US_STATE_NAMES_FLEET,
  buildPart135FleetView,
  buildPart135PackStats,
  defaultPart135Filters,
  filteredPart135Aircraft,
  listApprovedNetworkRows,
  listPart135StateOptions,
  listPart135StateRollupRows,
  operatorCatCount,
  parseFleetSummarySegments,
  part135StatusPill,
  splitApprovedBands,
  workhorseTypeNames,
  type Part135ApprovedNetworkRow,
  type Part135Filters,
  type Part135Operator,
  type Part135StateRollup,
} from '@/domain/part135Fleet'
import {
  getPart135ApprovedNetworkCsv,
  getPart135FleetPack,
} from '@/lib/part135FleetStore'

function pillClass(tone: 'gold' | 'neutral' | 'bad' | 'warn'): string {
  switch (tone) {
    case 'gold':
      return 'border-gold/50 text-gold'
    case 'bad':
      return 'border-[#B5584F]/60 text-[#B5584F]'
    case 'warn':
      return 'border-[#D28B3B]/60 text-[#D28B3B]'
    default:
      return 'border-border text-muted'
  }
}

function catLine(op: Part135Operator): string {
  return PART135_CATS.filter((c) => operatorCatCount(op, c) > 0)
    .map((c) => `${PART135_CAT_LABELS[c]} ${operatorCatCount(op, c)}`)
    .join(' · ')
}

function stateCatLine(s: Part135StateRollup): string {
  return PART135_CATS.filter((c) => s.cats[c] > 0)
    .map((c) => `${PART135_CAT_LABELS[c]} ${s.cats[c]}`)
    .join(' · ')
}

function OperatorRow({
  op,
  filters,
  open,
  onToggle,
}: {
  op: Part135Operator
  filters: Part135Filters
  open: boolean
  onToggle: () => void
}) {
  const pill = part135StatusPill(String(op.onfly_status))
  const whTypes = workhorseTypeNames(op)
  const segments = parseFleetSummarySegments(op.fleet_summary, whTypes)
  const tails = open ? filteredPart135Aircraft(op, filters.cats) : []
  const displayName = op.onfly_approved
    ? op.onfly_name || op.operator
    : op.operator

  return (
    <div
      className={[
        'border-b border-[#2A2A30]',
        op.onfly_approved ? 'bg-[rgba(201,162,39,.08)]' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-1 gap-2 px-3 py-3 text-left sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_5.5rem] sm:items-start sm:gap-4"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[#F7F2E3]">
              {open ? '▾' : '▸'} {displayName}
            </span>
            <span
              className={[
                'rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                pillClass(pill.tone),
              ].join(' ')}
            >
              {pill.label}
            </span>
          </div>
          {op.onfly_approved && op.onfly_name && (
            <div className="mt-0.5 text-[11px] text-[#A8A294]">{op.operator}</div>
          )}
          <div className="mt-1 font-mono text-[11px] text-[#A8A294]">
            {op.faa_cert}
            {op.fsdo_office ? ` · ${op.fsdo_office}` : ''}
            {op.state_source === 'fsdo_estimate' && (
              <em className="ml-1 not-italic text-[#D28B3B]">
                · <span className="italic">FSDO estimate</span>
              </em>
            )}
          </div>
          {op.onfly_approved && (
            <div className="mt-1 text-[11px] text-[#A8A294]">
              {[
                op.onfly_base ? `base ${op.onfly_base}` : '',
                op.onfly_usefulness
                  ? `use ${op.onfly_usefulness}/10`
                  : '',
                op.onfly_callout ? `call-out ${op.onfly_callout}` : '',
                op.onfly_caps,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
        <div className="min-w-0 text-sm text-[#F7F2E3]">
          <div className="leading-snug">
            {segments.map((seg, i) => (
              <span key={`${seg.type}-${i}`}>
                {i > 0 ? ', ' : ''}
                {seg.workhorse ? (
                  <span className="font-semibold text-[#C9A227]">
                    ● {seg.type}
                    {seg.count != null ? ` (${seg.count})` : ''}
                  </span>
                ) : (
                  <>
                    {seg.type}
                    {seg.count != null ? ` (${seg.count})` : ''}
                  </>
                )}
              </span>
            ))}
          </div>
          <div className="mt-1 text-[11px] text-[#A8A294]">{catLine(op)}</div>
        </div>
        <div className="text-left sm:text-right">
          <div className="font-mono text-lg font-semibold text-[#C9A227]">
            {op.tails_total}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-[#A8A294]">
            tails
          </div>
          <div className="mt-1 font-mono text-xs text-[#F7F2E3]">
            {op.workhorse_tails}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-[#A8A294]">
            workhorse
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-[#2A2A30] bg-[#0C0C0E] px-3 py-3 sm:px-4">
          {op.cert_note ? (
            <p className="mb-3 border-l-2 border-[#C9A227] pl-3 text-xs text-[#F7F2E3]">
              {op.cert_note}
            </p>
          ) : null}
          {tails.length === 0 ? (
            <p className="text-xs text-[#A8A294]">
              No tails in the selected categories.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-[#A8A294]">
                    <th className="pb-2 pr-3 font-medium">Tail</th>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 pr-3 font-medium">Category</th>
                    <th className="pb-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {tails.map((a) => (
                    <tr key={a.tail} className="border-t border-[#2A2A30]">
                      <td className="py-1.5 pr-3 font-mono text-[#F7F2E3]">
                        {a.tail}
                      </td>
                      <td className="py-1.5 pr-3 text-[#F7F2E3]">
                        {a.workhorse ? (
                          <span className="font-semibold text-[#C9A227]">
                            ● {a.aircraft_type}
                          </span>
                        ) : (
                          a.aircraft_type
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-[#A8A294]">
                        {PART135_CAT_LABELS[
                          a.category as keyof typeof PART135_CAT_LABELS
                        ] ?? a.category}
                      </td>
                      <td className="py-1.5 text-[#A8A294]">
                        {[
                          a.freight_history ? 'freight' : '',
                          a.onfly_flown_type ? 'flown for OnFly' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StateCard({
  rollup,
  filters,
  forceOpen,
}: {
  rollup: Part135StateRollup
  filters: Part135Filters
  forceOpen: boolean
}) {
  const [open, setOpen] = useState(false)
  const [openOps, setOpenOps] = useState<Set<string>>(() => new Set())
  const expanded = forceOpen || open
  const { approved, rest } = splitApprovedBands(rollup.operators)
  const name = US_STATE_NAMES_FLEET[rollup.state] ?? rollup.state

  function toggleOp(key: string) {
    setOpenOps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[#2A2A30] bg-[#141417]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-[#1B1B1F]"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-2xl font-semibold text-[#C9A227]">
            {rollup.state}
          </span>
          <span className="text-sm text-[#F7F2E3]">{name}</span>
          <span className="text-[11px] text-[#A8A294]">
            {stateCatLine(rollup)}
          </span>
        </div>
        <p className="text-xs text-[#A8A294]">
          {rollup.operator_count} operators · {rollup.tails_total} tails ·{' '}
          {rollup.workhorse_tails} workhorse
          {rollup.approved_count > 0
            ? ` · ${rollup.approved_count} approved: ${rollup.approved_names.join(', ')}`
            : ''}
        </p>
      </button>

      {expanded && (
        <div className="border-t border-[#2A2A30]">
          {approved.length > 0 && (
            <>
              <div className="bg-[rgba(201,162,39,.14)] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#C9A227]">
                OnFly approved
              </div>
              {approved.map((op) => {
                const key = `${op.state}:${op.faa_cert}`
                return (
                  <OperatorRow
                    key={key}
                    op={op}
                    filters={filters}
                    open={openOps.has(key)}
                    onToggle={() => toggleOp(key)}
                  />
                )
              })}
            </>
          )}
          {rest.length > 0 && (
            <>
              <div className="bg-[#1B1B1F] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#A8A294]">
                Everyone else on the list — {rest.length} operator
                {rest.length === 1 ? '' : 's'}
              </div>
              {rest.map((op) => {
                const key = `${op.state}:${op.faa_cert}`
                return (
                  <OperatorRow
                    key={key}
                    op={op}
                    filters={filters}
                    open={openOps.has(key)}
                    onToggle={() => toggleOp(key)}
                  />
                )
              })}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function StatsBand({
  stats,
}: {
  stats: {
    states: number
    operators: number
    tails: number
    approvedTails: number
  }
}) {
  const cells = [
    { label: 'States', value: stats.states },
    { label: 'Operators', value: stats.operators },
    { label: 'Tails', value: stats.tails },
    { label: 'Approved tails', value: stats.approvedTails },
  ]
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#2A2A30] bg-[#2A2A30] sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="bg-[#141417] px-4 py-3">
          <div className="font-mono text-2xl font-semibold text-[#C9A227]">
            {c.value.toLocaleString('en-US')}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[#A8A294]">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function ApprovedNetworkTable({ rows }: { rows: Part135ApprovedNetworkRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#2A2A30] bg-[#141417]">
      <div className="border-b border-[#2A2A30] px-4 py-3">
        <h2 className="text-base font-semibold text-[#F7F2E3]">
          Your network by state
        </h2>
        <p className="mt-0.5 text-xs text-[#A8A294]">
          OnFly-approved roster ({rows.length}) — including operators not on the
          FAA Part 135 holder list. Use when building a trip offer ladder.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-xs">
          <thead>
            <tr className="border-b border-[#2A2A30] text-[10px] uppercase tracking-wide text-[#A8A294]">
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Operator</th>
              <th className="px-3 py-2 font-medium">Base</th>
              <th className="px-3 py-2 font-medium">Cert</th>
              <th className="px-3 py-2 font-medium">Use</th>
              <th className="px-3 py-2 font-medium">Call-out</th>
              <th className="px-3 py-2 font-medium">Caps</th>
              <th className="px-3 py-2 font-medium">Tails</th>
              <th className="px-3 py-2 font-medium">Fleet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.state}:${r.faa_cert || r.name}`}
                className={[
                  'border-b border-[#2A2A30]',
                  r.csv_only ? 'bg-[rgba(201,162,39,.06)]' : '',
                ].join(' ')}
              >
                <td className="px-3 py-2 font-mono text-[#C9A227]">{r.state}</td>
                <td className="px-3 py-2 text-[#F7F2E3]">
                  <div className="font-semibold">{r.name}</div>
                  {r.faa_name && r.faa_name !== r.name ? (
                    <div className="text-[10px] text-[#A8A294]">{r.faa_name}</div>
                  ) : null}
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {!r.in_faa_135_list || r.csv_only ? (
                      <span className="rounded border border-[#D28B3B]/50 px-1 text-[9px] uppercase tracking-wide text-[#D28B3B]">
                        Not on FAA 135 list
                      </span>
                    ) : null}
                    {r.state_conflict ? (
                      <span className="rounded border border-[#D28B3B]/50 px-1 text-[9px] uppercase tracking-wide text-[#D28B3B]">
                        State conflict CHECK
                      </span>
                    ) : null}
                    {r.cert_note ? (
                      <span className="text-[10px] text-[#A8A294]">
                        {r.cert_note}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-[#A8A294]">{r.base || '—'}</td>
                <td className="px-3 py-2 font-mono text-[#F7F2E3]">
                  {r.faa_cert || '—'}
                </td>
                <td className="px-3 py-2 font-mono text-[#F7F2E3]">
                  {r.usefulness || '—'}
                </td>
                <td className="px-3 py-2 text-[#A8A294]">{r.callout || '—'}</td>
                <td className="px-3 py-2 text-[#A8A294]">{r.caps || '—'}</td>
                <td className="px-3 py-2 font-mono text-[#C9A227]">
                  {r.tails}
                  {r.workhorse_tails > 0 ? (
                    <span className="ml-1 text-[10px] text-[#A8A294]">
                      ({r.workhorse_tails} wh)
                    </span>
                  ) : null}
                </td>
                <td className="max-w-[14rem] px-3 py-2 text-[#A8A294]">
                  {r.fleet_summary || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StateRollupTable({ rows }: { rows: Part135StateRollup[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#2A2A30] bg-[#141417]">
      <div className="border-b border-[#2A2A30] px-4 py-3">
        <h2 className="text-base font-semibold text-[#F7F2E3]">State rollup</h2>
        <p className="mt-0.5 text-xs text-[#A8A294]">
          Unfiltered pack totals by state — approved operators first in the
          sort.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead>
            <tr className="border-b border-[#2A2A30] text-[10px] uppercase tracking-wide text-[#A8A294]">
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Operators</th>
              <th className="px-3 py-2 font-medium">Tails</th>
              <th className="px-3 py-2 font-medium">Workhorse</th>
              <th className="px-3 py-2 font-medium">Approved</th>
              <th className="px-3 py-2 font-medium">Categories</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.state} className="border-b border-[#2A2A30]">
                <td className="px-3 py-2">
                  <span className="font-mono font-semibold text-[#C9A227]">
                    {s.state}
                  </span>
                  <span className="ml-2 text-[#A8A294]">
                    {US_STATE_NAMES_FLEET[s.state] ?? ''}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-[#F7F2E3]">
                  {s.operator_count}
                </td>
                <td className="px-3 py-2 font-mono text-[#F7F2E3]">
                  {s.tails_total}
                </td>
                <td className="px-3 py-2 font-mono text-[#F7F2E3]">
                  {s.workhorse_tails}
                </td>
                <td className="px-3 py-2 text-[#F7F2E3]">
                  {s.approved_count > 0 ? (
                    <>
                      <span className="font-mono text-[#C9A227]">
                        {s.approved_count}
                      </span>
                      <span className="ml-1 text-[10px] text-[#A8A294]">
                        {s.approved_names.join(', ')}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#A8A294]">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[11px] text-[#A8A294]">
                  {stateCatLine(s) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function StateFleetBrowser() {
  const pack = useMemo(() => getPart135FleetPack(), [])
  const csv = useMemo(() => getPart135ApprovedNetworkCsv(), [])
  const [filters, setFilters] = useState<Part135Filters>(() =>
    defaultPart135Filters(),
  )

  const stats = useMemo(() => buildPart135PackStats(pack), [pack])
  const networkRows = useMemo(
    () => listApprovedNetworkRows(pack, csv),
    [pack, csv],
  )
  const rollupRows = useMemo(() => listPart135StateRollupRows(pack), [pack])
  const stateOptions = useMemo(() => listPart135StateOptions(pack), [pack])
  const view = useMemo(
    () => buildPart135FleetView(pack, filters),
    [pack, filters],
  )

  const forceOpenStates =
    filters.openAllStates || Boolean(filters.state) || Boolean(filters.q.trim())

  function patch(p: Partial<Part135Filters>) {
    setFilters((prev) => ({ ...prev, ...p }))
  }

  function toggleCat(cat: string) {
    setFilters((prev) => {
      const cats = new Set(prev.cats)
      if (cats.has(cat)) cats.delete(cat)
      else cats.add(cat)
      return { ...prev, cats }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C9A227]">
          Network · Operators
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#F7F2E3] sm:text-3xl">
          Part 135 state fleet
        </h1>
        <p className="max-w-2xl text-sm text-[#A8A294]">
          Every Part 135 certificate that flies metal OnFly uses, grouped by
          state — approved network first, then the full holder list for trip
          offers.
        </p>
        <StatsBand
          stats={{
            states: stats.states,
            operators: stats.operators,
            tails: stats.tails,
            approvedTails: stats.approvedTails,
          }}
        />
      </header>

      <ApprovedNetworkTable rows={networkRows} />

      <StateRollupTable rows={rollupRows} />

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#F7F2E3]">
            State by state
          </h2>
          <p className="mt-0.5 text-xs text-[#A8A294]">
            Filter and expand operators — OnFly approved gold band first, then
            everyone else. Keys: FAA cert · N-number.
          </p>
        </div>

        <div className="sticky top-0 z-10 space-y-3 rounded-lg border border-[#2A2A30] bg-[#141417]/95 p-3 backdrop-blur sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="text-xs text-[#A8A294] sm:w-40">
              State
              <select
                value={filters.state}
                onChange={(e) => patch({ state: e.target.value })}
                className="mt-1 w-full rounded-md border border-[#2A2A30] bg-[#0C0C0E] px-2 py-2 text-sm text-[#F7F2E3]"
              >
                <option value="">All states</option>
                {stateOptions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[12rem] flex-1 text-xs text-[#A8A294]">
              Search
              <input
                value={filters.q}
                onChange={(e) => patch({ q: e.target.value })}
                placeholder="Name · fleet · FAA cert…"
                className="mt-1 w-full rounded-md border border-[#2A2A30] bg-[#0C0C0E] px-3 py-2 text-sm text-[#F7F2E3] outline-none focus:border-[#C9A227]"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#A8A294]">
            {(
              [
                ['approvedOnly', 'Approved only'],
                ['workhorseOps', 'Workhorse operators'],
                ['freightTypes', 'Freight types'],
                ['hideSkip', 'Hide jet-card / broker / defunct'],
                ['hideAkHiPr', 'Hide Alaska · Hawaii · PR'],
                ['openAllStates', 'Open all states'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters[key]}
                  onChange={(e) => patch({ [key]: e.target.checked })}
                  className="accent-[#C9A227]"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PART135_CATS.map((c) => {
              const on = filters.cats.has(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCat(c)}
                  className={[
                    'rounded-md border px-2.5 py-1.5 text-[11px] transition-colors',
                    on
                      ? 'border-[#C9A227]/50 bg-[rgba(201,162,39,.14)] text-[#C9A227]'
                      : 'border-[#2A2A30] bg-[#0C0C0E] text-[#A8A294]',
                  ].join(' ')}
                >
                  {PART135_CAT_LABELS[c]}
                </button>
              )
            })}
          </div>
        </div>

        {view.empty ? (
          <p className="px-1 py-8 text-center text-sm text-[#A8A294]">
            Nothing matches these filters.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {view.states.map((s) => (
              <StateCard
                key={s.state}
                rollup={s}
                filters={filters}
                forceOpen={forceOpenStates}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="space-y-2 border-t border-[#2A2A30] pt-4 text-[11px] leading-relaxed text-[#A8A294]">
        <p className="font-semibold uppercase tracking-wider text-[#C9A227]">
          Data caveats
        </p>
        <ul className="list-disc space-y-1.5 pl-4">
          {PART135_FLEET_CAVEATS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </footer>
    </div>
  )
}
