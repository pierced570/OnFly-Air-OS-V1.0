import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createWxAdapter } from '@/adapters/wx'
import { loadFleetStatuses } from '@/lib/fleetRadar'
import type { FleetStatus } from '@/domain/fleetStatus'
import { RestChip } from '@/components/RestChip'
import { RadarMap } from '@/components/RadarMap'
import scorecards from '@/fixtures/scorecards.json'

type Filter = 'all' | 'rested' | 'airborne' | 'in_position' | 'ladd'

export default function RadarPage() {
  const [statuses, setStatuses] = useState<FleetStatus[]>([])
  const [wx, setWx] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    void (async () => {
      setStatuses(await loadFleetStatuses(20))
      const brief = await createWxAdapter().brief('KCAK')
      setWx(brief.summary)
    })()
  }, [])

  const filtered = useMemo(() => {
    return statuses.filter((s) => {
      if (q) {
        const needle = q.toLowerCase()
        const hit =
          s.tail.toLowerCase().includes(needle) ||
          (s.operator_name ?? '').toLowerCase().includes(needle) ||
          (s.type_name ?? '').toLowerCase().includes(needle)
        if (!hit) return false
      }
      if (filter === 'rested') return s.rest === 'likely_rested'
      if (filter === 'airborne') return s.rest === 'rest_clock_running' && s.gs > 50
      if (filter === 'in_position') return s.inPositionOfBase
      if (filter === 'ladd') return s.laddBlocked
      return true
    })
  }, [statuses, filter, q])

  const selectedStatus = statuses.find((s) => s.tail === selected) ?? null

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-cream">Fleet Radar</h1>
          <p className="mt-1 text-sm text-muted">
            Trial fixtures · {statuses.length} tails · chips are advisory (not a 135.267 determination)
          </p>
        </div>
        <Link to="/briefing" className="text-sm text-gold hover:text-gold-lt">
          Shift briefing →
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'All'],
            ['rested', 'Rested'],
            ['airborne', 'Airborne'],
            ['in_position', 'In position'],
            ['ladd', 'LADD'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={[
              'rounded-md px-3 py-1.5 text-xs',
              filter === id ? 'bg-gold text-ink' : 'bg-surface text-muted',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter tail / operator…"
          className="ml-auto w-56 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-cream"
        />
      </div>

      <RadarMap statuses={filtered} onSelect={setSelected} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">WX brief</h2>
          <p className="mt-2 text-sm text-cream">{wx || '…'}</p>
          {selectedStatus && (
            <div className="mt-4 border-t border-border pt-3 text-sm">
              <div className="avionic text-gold">{selectedStatus.tail}</div>
              <div className="text-muted">{selectedStatus.operator_name}</div>
              <div className="mt-2">
                <RestChip
                  rest={selectedStatus.rest}
                  inPosition={selectedStatus.inPositionOfBase}
                  laddBlocked={selectedStatus.laddBlocked}
                />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Operator scorecards (fixture)
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {scorecards.operators.slice(0, 5).map((o) => (
              <li
                key={o.name}
                className="flex items-center justify-between border-b border-border/40 pb-2"
              >
                <span className="text-cream">{o.name}</span>
                <span className="avionic text-xs text-muted">
                  {o.median_response_min}m · {o.response_rate_pct}% reply
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ul className="space-y-2">
        {filtered.map((p) => (
          <li
            key={p.tail}
            className={[
              'flex flex-wrap items-center justify-between gap-2 rounded border bg-surface px-3 py-2 text-sm',
              selected === p.tail ? 'border-gold' : 'border-border',
            ].join(' ')}
          >
            <button
              type="button"
              className="text-left"
              onClick={() => setSelected(p.tail)}
            >
              <span className="avionic text-gold">{p.tail}</span>
              <span className="ml-2 text-muted">
                {p.type_name} · {p.operator_name}
              </span>
            </button>
            <div className="flex items-center gap-3">
              <span className="avionic text-xs text-muted">{p.gs} kt</span>
              <RestChip
                rest={p.rest}
                inPosition={p.inPositionOfBase}
                laddBlocked={p.laddBlocked}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
