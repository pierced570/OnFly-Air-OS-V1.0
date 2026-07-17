import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { NeedsInfoBadge } from '@/components/NeedsInfoBadge'
import { FlightChip } from '@/components/FlightChip'
import { OperatorDocSlots } from '@/components/OperatorDocSlots'
import { loadFleetStatuses } from '@/lib/fleetRadar'
import { loadNetwork } from '@/lib/networkData'
import type { FleetStatus } from '@/domain/fleetStatus'
import type { NetworkFixture } from '@/lib/types'
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
import { listOperatorDrafts, subscribeOperatorDrafts } from '@/lib/operatorDraftStore'
import { subscribeTrips, listTripsStable } from '@/lib/tripStore'

export default function NetworkPage() {
  const [data, setData] = useState<NetworkFixture | null>(null)
  const [statusByTail, setStatusByTail] = useState<Map<string, FleetStatus>>(
    () => new Map(),
  )
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedDocs, setExpandedDocs] = useState<string | null>(null)
  const [coiNote, setCoiNote] = useState<string | null>(null)

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
  // Re-render when trips complete (named-insurer eligibility)
  useSyncExternalStore(subscribeTrips, listTripsStable, () => [])

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
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    void loadFleetStatuses(40).then((rows) => {
      setStatusByTail(new Map(rows.map((s) => [s.tail, s])))
    })
    void runCoiExpiryReminders().then((r) => {
      if (r.sentTo.length) {
        setCoiNote(
          `COI expiry: emailed ${r.sentTo.length} operator${r.sentTo.length === 1 ? '' : 's'} for updated certificates.`,
        )
      }
    })
  }, [])

  // Wizard drafts that aren't already network operators
  useEffect(() => {
    for (const d of drafts) {
      ensureOperatorCompliance({
        operator_id: d.id,
        operator_name: d.name,
        contact_email: d.contacts[0]?.email ?? '',
      })
    }
  }, [drafts])

  const filtered = useMemo(() => {
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
      .filter(Boolean) as Array<{
      op: NetworkFixture['operators'][number]
      aircraft: NetworkFixture['aircraft']
      source: 'network' | 'draft'
    }>

    const fromDrafts = drafts
      .filter((d) => !networkIds.has(d.id))
      .map((d) => {
        const op = {
          id: d.id,
          name: d.name,
          base_icao: d.base_icao || null,
          needs_info: [] as NetworkFixture['operators'][number]['needs_info'],
          aircraft_count: d.aircraft.length,
        }
        const aircraft = d.aircraft.map((a, i) => ({
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
      .filter(Boolean) as Array<{
      op: NetworkFixture['operators'][number]
      aircraft: NetworkFixture['aircraft']
      source: 'network' | 'draft'
    }>

    return [...fromDrafts, ...fromNetwork]
  }, [data, q, drafts])

  const namedInsurerFlags = useMemo(() => {
    return complianceRows.filter((c) => {
      if (c.named_insurer) return false
      return isNamedInsurerEligible(c.operator_id, c.operator_name)
    }).length
  }, [complianceRows])

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
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin" className="text-sm text-gold hover:text-gold-lt">
            Add operator / docs →
          </Link>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search operator, tail, type, ICAO…"
            className="w-72 rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream placeholder:text-muted outline-none focus:border-gold"
          />
        </div>
      </header>

      <div className="space-y-4">
        {filtered.map(({ op, aircraft, source }) => {
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
            <section
              key={op.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
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
                      onClick={() =>
                        setNamedInsurer(op.id, !compliance.named_insurer)
                      }
                      className={[
                        'relative h-5 w-9 rounded-full transition-colors',
                        compliance.named_insurer ? 'bg-onplan' : 'bg-border',
                        !eligible && !compliance.named_insurer
                          ? 'opacity-40'
                          : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'absolute top-0.5 h-4 w-4 rounded-full bg-cream transition-transform',
                          compliance.named_insurer
                            ? 'translate-x-4'
                            : 'translate-x-0.5',
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
                      onChange={(e) =>
                        setOperatorContactEmail(op.id, e.target.value)
                      }
                      placeholder="ops@operator.com"
                    />
                  </label>
                  <OperatorDocSlots
                    compliance={compliance}
                    onUpload={(kind: OperatorDocKind, file: File) =>
                      setOperatorDocFile(op.id, kind, file)
                    }
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
                          <td className="px-4 py-2 text-cream">
                            {a.type_name ?? '—'}
                          </td>
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
                            {a.mtow_lbs != null
                              ? a.mtow_lbs.toLocaleString()
                              : '—'}
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
