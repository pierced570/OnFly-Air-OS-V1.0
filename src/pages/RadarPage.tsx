import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { isRealAdsbEnabled } from '@/adapters/adsb'
import { createWxAdapter, type WxBrief } from '@/adapters/wx'
import { FlightCatBadge } from '@/components/FlightCatBadge'
import { loadFleetStatuses } from '@/lib/fleetRadar'
import { loadNetwork } from '@/lib/networkData'
import type { FleetStatus } from '@/domain/fleetStatus'
import { FlightChip } from '@/components/FlightChip'
import { RadarMap } from '@/components/RadarMap'
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

export default function RadarPage() {
  const watched = useSyncExternalStore(
    subscribeWatchedTails,
    listWatchedTails,
    () => [],
  )
  const [statuses, setStatuses] = useState<FleetStatus[]>([])
  const [wx, setWx] = useState<WxBrief | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const adsbLive = isRealAdsbEnabled()

  async function refresh() {
    setBusy(true)
    try {
      // Ensure watch list matches Network fleet (live DB or fixture).
      await loadNetwork()
      // Mock adapter returns no_data only — never invents airborne tracks.
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

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-cream">Fleet Radar</h1>
          <p className="mt-1 text-sm text-muted">
            {watched.length} watched tails
            {d085Count ? ` · ${d085Count} from D085 uploads` : ''}
            {adsbLive
              ? ' · last takeoff / landing from ADS-B'
              : ' · ADS-B API not connected yet'}
          </p>
          {!adsbLive && (
            <p className="mt-2 text-xs text-gold">
              Positions are off until the live ADS-B provider is wired — no mock
              tracks. Tails below are from Network.
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
                : 'Enable when VITE_ADSB_ADAPTER=real + provider key'
            }
          >
            {busy ? 'Refreshing…' : adsbLive ? 'Refresh ADS-B' : 'ADS-B pending'}
          </button>
          <Link to="/admin" className="text-sm text-muted hover:text-cream">
            Upload D085 →
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
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
            Network import tails are watched automatically. Confirming a D085 in
            Admin adds those N-numbers to this radar and keeps takeoff/landing logs.
          </p>
          <Link to="/admin" className="mt-3 inline-block text-xs text-gold">
            Add operator / D085 →
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
