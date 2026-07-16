import { useEffect, useMemo, useState } from 'react'
import { NeedsInfoBadge } from '@/components/NeedsInfoBadge'
import { RestChip } from '@/components/RestChip'
import { loadFleetStatuses } from '@/lib/fleetRadar'
import { loadNetwork } from '@/lib/networkData'
import type { FleetStatus } from '@/domain/fleetStatus'
import type { NetworkFixture } from '@/lib/types'

export default function NetworkPage() {
  const [data, setData] = useState<NetworkFixture | null>(null)
  const [statusByTail, setStatusByTail] = useState<Map<string, FleetStatus>>(
    () => new Map(),
  )
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadNetwork()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    void loadFleetStatuses(40).then((rows) => {
      setStatusByTail(new Map(rows.map((s) => [s.tail, s])))
    })
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    return data.operators
      .map((op) => {
        const aircraft = data.aircraft.filter((a) => a.operator_id === op.id)
        if (!needle) return { op, aircraft }
        const hit =
          op.name.toLowerCase().includes(needle) ||
          aircraft.some(
            (a) =>
              a.tail.toLowerCase().includes(needle) ||
              (a.type_name ?? '').toLowerCase().includes(needle) ||
              (a.base_icao ?? '').toLowerCase().includes(needle),
          )
        return hit ? { op, aircraft } : null
      })
      .filter(Boolean) as Array<{
      op: NetworkFixture['operators'][number]
      aircraft: NetworkFixture['aircraft']
    }>
  }, [data, q])

  if (error) {
    return <div className="p-8 text-late">Failed to load network: {error}</div>
  }
  if (!data) {
    return <div className="p-8 text-muted">Loading network…</div>
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-cream">Network</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="avionic text-cream">{data.counts.operators}</span> operators ·{' '}
            <span className="avionic text-cream">{data.counts.aircraft}</span> aircraft
            {data.counts.needs_info_tasks > 0 && (
              <>
                {' '}
                · <span className="text-gold">{data.counts.needs_info_tasks}</span> NEEDS-INFO flags
              </>
            )}
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search operator, tail, type, ICAO…"
          className="w-72 rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream placeholder:text-muted outline-none focus:border-gold"
        />
      </header>

      <div className="space-y-4">
        {filtered.map(({ op, aircraft }) => {
          const needs = op.needs_info.length + aircraft.reduce((n, a) => n + a.needs_info.length, 0)
          return (
            <section
              key={op.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <div className="font-medium text-cream">{op.name}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    Base{' '}
                    <span className="avionic text-cream">{op.base_icao ?? '—'}</span>
                    {' · '}
                    <span className="avionic">{aircraft.length}</span> tails
                  </div>
                </div>
                <NeedsInfoBadge count={needs} />
              </div>
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
                        <td className="avionic px-4 py-2 text-muted">{a.base_icao ?? '—'}</td>
                        <td className="px-4 py-2">
                          {st ? (
                            <RestChip
                              rest={st.rest}
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
        })}
      </div>
    </div>
  )
}
