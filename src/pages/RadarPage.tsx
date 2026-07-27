import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { isRealAdsbEnabled } from '@/adapters/adsb'
import { createWxAdapter, type WxBrief } from '@/adapters/wx'
import { D085ReviewPanel } from '@/components/D085ReviewPanel'
import { FlightCatBadge } from '@/components/FlightCatBadge'
import type { D085ReviewRow } from '@/domain/d085Match'
import { loadFleetStatuses } from '@/lib/fleetRadar'
import { loadNetwork } from '@/lib/networkData'
import type { FleetStatus } from '@/domain/fleetStatus'
import { FlightChip } from '@/components/FlightChip'
import { RadarMap } from '@/components/RadarMap'
import {
  acceptD085Review,
  parseAndMatchD085,
} from '@/lib/d085Review'
import {
  listWatchedTails,
  subscribeWatchedTails,
} from '@/lib/watchedTailsStore'

type Filter = 'all' | 'airborne' | 'on_ground' | 'no_data' | 'd085'

function fmtWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toISOString().replace('.000Z', 'Z')
  } catch {
    return '—'
  }
}

export default function RadarPage({
  embedded = false,
}: {
  embedded?: boolean
}) {
  const watched = useSyncExternalStore(
    subscribeWatchedTails,
    listWatchedTails,
    listWatchedTails,
  )
  const [statuses, setStatuses] = useState<FleetStatus[]>([])
  const [wx, setWx] = useState<WxBrief | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [d085Busy, setD085Busy] = useState(false)
  const [d085Error, setD085Error] = useState<string | null>(null)
  const [d085Note, setD085Note] = useState<string | undefined>()
  const [d085Source, setD085Source] = useState<string | undefined>()
  const [d085Rows, setD085Rows] = useState<D085ReviewRow[] | null>(null)
  const [d085OperatorId, setD085OperatorId] = useState('')
  const [operators, setOperators] = useState<
    Array<{ id: string; name: string; base_icao: string | null }>
  >([])

  const adsbLive = isRealAdsbEnabled()

  async function refresh() {
    setBusy(true)
    try {
      const net = await loadNetwork()
      setOperators(
        net.operators.map((o) => ({
          id: o.id,
          name: o.name,
          base_icao: o.base_icao,
        })),
      )
      setStatuses(await loadFleetStatuses())
      setWx(await createWxAdapter().brief('KCAK'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [watched.length])

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
      if (filter === 'airborne') return s.phase === 'airborne'
      if (filter === 'on_ground') return s.phase === 'on_ground'
      if (filter === 'no_data') return s.phase === 'no_data' || s.laddBlocked
      if (filter === 'd085') return s.source === 'd085'
      return true
    })
  }, [statuses, filter, q])

  const selectedStatus = statuses.find((s) => s.tail === selected) ?? null
  const d085Count = watched.filter((w) => w.source === 'd085').length

  async function onD085File(file: File) {
    setD085Busy(true)
    setD085Error(null)
    try {
      const bundle = await parseAndMatchD085(file)
      setD085Rows(bundle.rows)
      setD085Note(bundle.note)
      setD085Source(bundle.source)
      const linkedOp = bundle.rows.find((r) => r.existing_operator_id)
        ?.existing_operator_id
      if (linkedOp) setD085OperatorId(linkedOp)
    } catch (e) {
      setD085Error(e instanceof Error ? e.message : String(e))
      setD085Rows(null)
    } finally {
      setD085Busy(false)
    }
  }

  function clearD085() {
    setD085Rows(null)
    setD085Note(undefined)
    setD085Source(undefined)
  }

  return (
    <div
      className={
        embedded
          ? 'flex flex-col gap-4'
          : 'flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8'
      }
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className={
              embedded
                ? 'text-lg font-semibold text-cream'
                : 'text-2xl font-semibold text-cream'
            }
          >
            Fleet Radar
          </h1>
          <p className="mt-1 text-sm text-muted">
            {watched.length} watched tails
            {d085Count ? ` · ${d085Count} from D085 uploads` : ''}
            {adsbLive
              ? ' · last takeoff / landing from ADS-B'
              : ' · ADS-B API not connected yet'}
          </p>
          {!adsbLive && (
            <p className="mt-2 text-xs text-gold">
              Positions are off until the ADS-B provider is connected. Tails
              below are from Network.
            </p>
          )}
          {wx && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="avionic text-gold">{wx.icao}</span>
              <FlightCatBadge cat={wx.flightCat} />
              {wx.tafWorstCat && (
                <span className="inline-flex items-center gap-1">
                  TAF <FlightCatBadge cat={wx.tafWorstCat} size="sm" />
                </span>
              )}
              <span className="text-muted/80">live METAR/TAF</span>
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="text-sm text-gold disabled:opacity-50"
            disabled={busy || !adsbLive}
            onClick={() => void refresh()}
            title={
              adsbLive
                ? 'Refresh live positions'
                : 'ADS-B provider not connected'
            }
          >
            {busy ? 'Refreshing…' : adsbLive ? 'Refresh ADS-B' : 'ADS-B pending'}
          </button>
          <label className="cursor-pointer text-sm text-gold hover:text-gold-lt">
            {d085Busy ? 'Parsing D085…' : 'Upload D085'}
            <input
              type="file"
              accept=".pdf,.txt,.csv"
              className="hidden"
              disabled={d085Busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void onD085File(f)
              }}
            />
          </label>
        </div>
      </header>

      {d085Error ? <p className="text-sm text-late">{d085Error}</p> : null}

      {d085Rows ? (
        <div className="space-y-3">
          <label className="block text-xs text-muted">
            Operator for new tails
            <select
              className="mt-1 w-full max-w-md rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
              value={d085OperatorId}
              onChange={(e) => setD085OperatorId(e.target.value)}
            >
              <option value="">Select operator…</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.base_icao ? ` · ${o.base_icao}` : ''}
                </option>
              ))}
            </select>
          </label>
          <D085ReviewPanel
            rows={d085Rows}
            source={d085Source}
            note={d085Note}
            busy={d085Busy}
            acceptLabel="Accept into Network + Radar"
            onCancel={clearD085}
            onAccept={(selectedRows) => {
              const needsOp = selectedRows.some(
                (r) => r.match_kind === 'new' || r.match_kind === 'conflict',
              )
              const op = operators.find((o) => o.id === d085OperatorId)
              if (needsOp && !op) {
                setD085Error(
                  'Select an operator for new or conflicting tails before accepting.',
                )
                return
              }
              const payload = selectedRows.map((r) => {
                if (r.match_kind === 'linked' && r.existing_operator_id) {
                  return {
                    tail: r.tail,
                    type_name: r.type_name,
                    match_kind: r.match_kind,
                    operator_id: r.existing_operator_id,
                    operator_name:
                      r.existing_operator_name || op?.name || 'Operator',
                    base_icao: op?.base_icao ?? null,
                  }
                }
                return {
                  tail: r.tail,
                  type_name: r.type_name,
                  match_kind: r.match_kind,
                  operator_id: op!.id,
                  operator_name: op!.name,
                  base_icao: op!.base_icao,
                }
              })
              acceptD085Review(payload)
              clearD085()
              setD085Error(null)
              void refresh()
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter tail / operator…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-cream sm:max-w-xs sm:py-2"
        />
        <div className="board-rail flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['all', 'All'],
              ['airborne', 'Airborne'],
              ['on_ground', 'On ground'],
              ['no_data', 'No ADS-B'],
              ['d085', 'D085 watch'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={[
                'shrink-0 rounded-md px-3 py-2.5 text-xs sm:py-2',
                filter === id ? 'bg-gold text-ink' : 'bg-surface text-muted',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <RadarMap statuses={filtered} onSelect={setSelected} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">WX brief</h2>
          {wx ? (
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="avionic text-gold">{wx.icao}</span>
                <FlightCatBadge cat={wx.flightCat} />
                {wx.tafWorstCat && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                    TAF <FlightCatBadge cat={wx.tafWorstCat} size="sm" />
                  </span>
                )}
              </div>
              {wx.metar && (
                <p className="avionic text-xs text-cream/90">{wx.metar}</p>
              )}
              {wx.tafPeriods.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {wx.tafPeriods.slice(0, 6).map((p, i) => (
                    <li
                      key={`${p.timeFrom}-${i}`}
                      className="inline-flex items-center gap-1 text-[10px] text-muted"
                    >
                      <span className="avionic">{p.label}</span>
                      <FlightCatBadge cat={p.flightCat} size="sm" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">…</p>
          )}
          {selectedStatus && (
            <div className="mt-4 border-t border-border pt-3 text-sm">
              <div className="avionic text-gold">{selectedStatus.tail}</div>
              <div className="text-muted">{selectedStatus.operator_name}</div>
              <div className="mt-2">
                <FlightChip
                  phase={selectedStatus.phase}
                  inPosition={selectedStatus.inPositionOfBase}
                  laddBlocked={selectedStatus.laddBlocked}
                />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted">Last takeoff</dt>
                  <dd className="avionic text-cream">
                    {fmtWhen(selectedStatus.lastTakeoffAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Last landing</dt>
                  <dd className="avionic text-cream">
                    {fmtWhen(selectedStatus.lastLandingAt)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Watch sources
          </h2>
          <p className="mt-2 text-sm text-muted">
            Network import tails are watched automatically. Upload a D085 above
            to match existing N-numbers; new tails ask you to confirm details
            before they are added.
          </p>
          <Link to="/admin" className="mt-3 inline-block text-xs text-gold">
            Add operator / D085 wizard →
          </Link>
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
                {p.source === 'd085' ? ' · D085' : ''}
              </span>
              <div className="mt-0.5 text-[11px] text-muted">
                TO {fmtWhen(p.lastTakeoffAt)} · LDG {fmtWhen(p.lastLandingAt)}
              </div>
            </button>
            <div className="flex items-center gap-3">
              <span className="avionic text-xs text-muted">{p.gs} kt</span>
              <FlightChip
                phase={p.phase}
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
