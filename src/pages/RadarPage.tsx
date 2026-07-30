import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { isRealAdsbEnabled } from '@/adapters/adsb'
import { createWxAdapter, type WxBrief } from '@/adapters/wx'
import { D085ReviewPanel } from '@/components/D085ReviewPanel'
import { FlightCatBadge } from '@/components/FlightCatBadge'
import type { D085ReviewRow } from '@/domain/d085Match'
import { trackingSummary } from '@/domain/radarTracking'
import type { FleetStatus } from '@/domain/fleetStatus'
import { FlightChip } from '@/components/FlightChip'
import { RadarMap } from '@/components/RadarMap'
import {
  acceptD085Review,
  parseAndMatchD085,
} from '@/lib/d085Review'
import { fleetStatusByTail, loadFleetStatuses } from '@/lib/fleetRadar'
import { loadNetwork, type LoadedNetwork } from '@/lib/networkData'
import {
  addTailToTracking,
  lookupRadarTail,
  normalizeLookupTail,
  pollOperatorTailsLastKnown,
  setRadarMovementAlert,
  type LookupRadarTailResult,
} from '@/lib/radarSeedFlow'
import {
  listRadarTracks,
  subscribeRadarTracks,
} from '@/lib/radarTrackingStore'
import {
  listWatchedTails,
  subscribeWatchedTails,
} from '@/lib/watchedTailsStore'

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toISOString().replace('.000Z', 'Z')
  } catch {
    return '—'
  }
}

type OpHit = {
  id: string
  name: string
  base_icao: string | null
  tails: Array<{
    tail: string
    type_name: string | null
    base_icao: string | null
  }>
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
  const tracks = useSyncExternalStore(
    subscribeRadarTracks,
    listRadarTracks,
    listRadarTracks,
  )
  const [statuses, setStatuses] = useState<FleetStatus[]>([])
  const [wx, setWx] = useState<WxBrief | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [network, setNetwork] = useState<LoadedNetwork | null>(null)

  const [tailQ, setTailQ] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookup, setLookup] = useState<LookupRadarTailResult | null>(null)
  const [lookupStatus, setLookupStatus] = useState<FleetStatus | null>(null)

  const [opQ, setOpQ] = useState('')
  const [pickedOpId, setPickedOpId] = useState<string | null>(null)
  /** Selected tails within the picked company for last-known poll. */
  const [selectedOpTails, setSelectedOpTails] = useState<Set<string>>(
    () => new Set(),
  )
  const [pollBusy, setPollBusy] = useState(false)
  /** Last-known statuses from company poll (shown even without alert tracking). */
  const [polledStatuses, setPolledStatuses] = useState<FleetStatus[]>([])

  const [alertBusyTail, setAlertBusyTail] = useState<string | null>(null)
  const [alertError, setAlertError] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<string | null>(null)

  const [d085Busy, setD085Busy] = useState(false)
  const [d085Error, setD085Error] = useState<string | null>(null)
  const [d085Note, setD085Note] = useState<string | undefined>()
  const [d085Source, setD085Source] = useState<string | undefined>()
  const [d085Rows, setD085Rows] = useState<D085ReviewRow[] | null>(null)
  const [d085OperatorId, setD085OperatorId] = useState('')

  const adsbLive = isRealAdsbEnabled()
  const trackSummary = trackingSummary(tracks)
  const tracking = useMemo(
    () => tracks.filter((t) => t.alertEnabled),
    [tracks],
  )

  const operators: OpHit[] = useMemo(() => {
    if (!network) return []
    return network.operators
      .map((o) => ({
        id: o.id,
        name: o.name,
        base_icao: o.base_icao,
        tails: network.aircraft
          .filter(
            (a) =>
              a.operator_id === o.id &&
              a.tail &&
              !String(a.tail).toUpperCase().startsWith('TBD'),
          )
          .map((a) => ({
            tail: String(a.tail).toUpperCase(),
            type_name: a.type_name,
            base_icao: a.base_icao,
          }))
          .sort((a, b) => a.tail.localeCompare(b.tail)),
      }))
      .filter((o) => o.tails.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [network])

  const opHits = useMemo(() => {
    const needle = opQ.trim().toLowerCase()
    if (!needle) return operators.slice(0, 12)
    return operators
      .filter(
        (o) =>
          o.name.toLowerCase().includes(needle) ||
          o.tails.some((t) => t.tail.toLowerCase().includes(needle)),
      )
      .slice(0, 20)
  }, [operators, opQ])

  const pickedOp = operators.find((o) => o.id === pickedOpId) ?? null

  const mapStatuses = useMemo(() => {
    const byTail = new Map(statuses.map((s) => [s.tail.toUpperCase(), s]))
    for (const s of polledStatuses) byTail.set(s.tail.toUpperCase(), s)
    if (lookupStatus) byTail.set(lookupStatus.tail.toUpperCase(), lookupStatus)
    return [...byTail.values()]
  }, [statuses, polledStatuses, lookupStatus])

  const selectedStatus =
    mapStatuses.find((s) => s.tail === selected) ??
    (lookupStatus?.tail === selected ? lookupStatus : null)

  async function refresh() {
    setBusy(true)
    try {
      const net = await loadNetwork()
      setNetwork(net)
      setStatuses(await loadFleetStatuses(500, { scope: 'tracked' }))
      setWx(await createWxAdapter().brief('KCAK'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [tracking.length])

  async function onLookupTail(e?: FormEvent) {
    e?.preventDefault()
    const tail = normalizeLookupTail(tailQ)
    if (!tail) {
      setLookup({
        tail: '',
        known: null,
        alertEnabled: false,
        inNetwork: false,
        operator_name: null,
        type_name: null,
        base_icao: null,
        error: 'Enter a tail number (e.g. N159FM)',
      })
      setLookupStatus(null)
      return
    }
    setLookupBusy(true)
    setAlertError(null)
    setActionNote(null)
    try {
      const hit = await lookupRadarTail(tail)
      setLookup(hit)
      setSelected(hit.tail || null)
      // Build a FleetStatus-shaped row for the map from lookup
      const known = hit.known
      if (known) {
        setLookupStatus({
          tail: hit.tail,
          lat: known.lat,
          lon: known.lon,
          alt: known.alt,
          gs: known.gs,
          seenAt: known.seenAt,
          phase: known.phase,
          inPositionOfBase: false,
          nmFromBase: null,
          laddBlocked: known.laddBlocked,
          lastTakeoffAt: known.lastTakeoffAt,
          lastLandingAt: known.lastLandingAt,
          operator_name: hit.operator_name ?? undefined,
          type_name: hit.type_name,
          base_icao: hit.base_icao,
          source: hit.inNetwork ? 'network' : 'manual',
          alertTracked: hit.alertEnabled,
        })
      } else {
        setLookupStatus(null)
      }
      await refresh()
    } catch (err) {
      setLookup({
        tail,
        known: null,
        alertEnabled: false,
        inNetwork: false,
        operator_name: null,
        type_name: null,
        base_icao: null,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLookupBusy(false)
    }
  }

  async function onAddTracking(opts: {
    tail: string
    type_name?: string | null
    operator_name?: string
    operator_id?: string | null
    base_icao?: string | null
  }) {
    setAlertBusyTail(opts.tail)
    setAlertError(null)
    setActionNote(null)
    try {
      const res = await addTailToTracking(opts)
      if (!res.ok) {
        setAlertError(res.error ?? 'Could not add tracking')
        return
      }
      setActionNote(`${res.tail} added to tracking`)
      setSelected(res.tail)
      if (lookup?.tail === res.tail) {
        setLookup({ ...lookup, alertEnabled: true })
      }
      await refresh()
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : String(err))
    } finally {
      setAlertBusyTail(null)
    }
  }

  async function onRemoveTracking(tail: string) {
    setAlertBusyTail(tail)
    setAlertError(null)
    try {
      const res = await setRadarMovementAlert(tail, false)
      if (!res.ok) setAlertError(res.error ?? 'Could not remove tracking')
      else setActionNote(`${tail} removed from tracking`)
      await refresh()
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : String(err))
    } finally {
      setAlertBusyTail(null)
    }
  }

  function toggleOpTail(tail: string) {
    setSelectedOpTails((prev) => {
      const next = new Set(prev)
      if (next.has(tail)) next.delete(tail)
      else next.add(tail)
      return next
    })
  }

  function selectAllOpTails() {
    if (!pickedOp) return
    setSelectedOpTails(new Set(pickedOp.tails.map((t) => t.tail)))
  }

  async function onPollSelectedLastKnown() {
    if (!pickedOp || selectedOpTails.size === 0) return
    setPollBusy(true)
    setAlertError(null)
    setActionNote(null)
    try {
      const picks = pickedOp.tails.filter((t) => selectedOpTails.has(t.tail))
      const result = await pollOperatorTailsLastKnown({
        operator_id: pickedOp.id,
        operator_name: pickedOp.name,
        base_icao: pickedOp.base_icao,
        tails: picks,
      })
      const byTail = await fleetStatusByTail(picks.map((t) => t.tail))
      const rows = picks
        .map((t) => byTail.get(t.tail) ?? byTail.get(t.tail.toUpperCase()))
        .filter((s): s is FleetStatus => Boolean(s))
      setPolledStatuses((prev) => {
        const map = new Map(prev.map((s) => [s.tail.toUpperCase(), s]))
        for (const s of rows) map.set(s.tail.toUpperCase(), s)
        return [...map.values()]
      })
      if (rows[0]) setSelected(rows[0].tail)
      setActionNote(
        `Last-known for ${result.seeded}/${result.requested} selected · ${pickedOp.name}${
          result.noData ? ` · ${result.noData} no data` : ''
        }`,
      )
      await refresh()
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : String(err))
    } finally {
      setPollBusy(false)
    }
  }

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

  const trackedRows = useMemo(() => {
    const watchedBy = new Map(watched.map((w) => [w.tail.toUpperCase(), w]))
    return tracking.map((t) => {
      const st = statuses.find((s) => s.tail.toUpperCase() === t.tail)
      const w = watchedBy.get(t.tail)
      return {
        tail: t.tail,
        type_name: w?.type_name ?? st?.type_name ?? null,
        operator_name: w?.operator_name ?? st?.operator_name ?? '—',
        phase: st?.phase ?? t.lastKnown?.phase ?? 'no_data',
        laddBlocked: st?.laddBlocked ?? t.lastKnown?.laddBlocked ?? true,
        inPosition: st?.inPositionOfBase ?? false,
        gs: st?.gs ?? t.lastKnown?.gs ?? 0,
        lastTakeoffAt: st?.lastTakeoffAt ?? t.lastKnown?.lastTakeoffAt ?? null,
        lastLandingAt: st?.lastLandingAt ?? t.lastKnown?.lastLandingAt ?? null,
      }
    })
  }, [tracking, statuses, watched])

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
            {trackSummary.alertOn} tracking
            {` · ${trackSummary.seeded} with last-known`}
            {adsbLive
              ? ' · FlightAware lookup + movement alerts'
              : ' · ADS-B pending (mock lookup uses base)'}
          </p>
          {actionNote && (
            <p className="mt-2 text-xs text-gold/90">{actionNote}</p>
          )}
          {alertError && (
            <p className="mt-2 text-xs text-late">{alertError}</p>
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
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="text-sm text-gold disabled:opacity-50"
            disabled={busy || trackSummary.alertOn === 0}
            onClick={() => void refresh()}
          >
            {busy
              ? 'Refreshing…'
              : trackSummary.alertOn
                ? 'Refresh tracked'
                : 'Nothing tracked yet'}
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

      {/* FlightAware-style tail lookup */}
      <form
        onSubmit={(e) => void onLookupTail(e)}
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-end"
      >
        <label className="block flex-1 text-xs text-muted">
          Look up tail
          <input
            value={tailQ}
            onChange={(e) => setTailQ(e.target.value.toUpperCase())}
            placeholder="N159FM"
            className="avionic mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-gold tracking-wide"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <button
          type="submit"
          disabled={lookupBusy}
          className="rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
        >
          {lookupBusy ? 'Looking up…' : 'Lookup'}
        </button>
      </form>

      {lookup && (
        <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-3 text-sm">
          {lookup.error ? (
            <p className="text-late">{lookup.error}</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="avionic text-lg text-gold">{lookup.tail}</span>
                <span className="ml-2 text-muted">
                  {[lookup.type_name, lookup.operator_name]
                    .filter(Boolean)
                    .join(' · ') ||
                    (lookup.inNetwork ? 'Network' : 'Not in network')}
                </span>
                <div className="mt-1 text-[11px] text-muted">
                  TO {fmtWhen(lookup.known?.lastTakeoffAt)} · LDG{' '}
                  {fmtWhen(lookup.known?.lastLandingAt)}
                  {lookup.known && !lookup.known.laddBlocked
                    ? ` · ${lookup.known.phase.replace('_', ' ')}`
                    : ' · no position'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lookup.alertEnabled ? (
                  <>
                    <span className="text-[10px] uppercase tracking-wide text-gold">
                      Tracking
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-late"
                      disabled={alertBusyTail === lookup.tail}
                      onClick={() => void onRemoveTracking(lookup.tail)}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="rounded-md border border-gold/40 px-3 py-1.5 text-xs text-gold hover:bg-gold/10 disabled:opacity-50"
                    disabled={alertBusyTail === lookup.tail}
                    onClick={() =>
                      void onAddTracking({
                        tail: lookup.tail,
                        type_name: lookup.type_name,
                        operator_name: lookup.operator_name ?? undefined,
                        base_icao: lookup.base_icao,
                      })
                    }
                  >
                    {alertBusyTail === lookup.tail
                      ? 'Adding…'
                      : 'Add to tracking'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <RadarMap statuses={mapStatuses} onSelect={setSelected} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Company fleet poll
          </h2>
          <p className="mt-1 text-xs text-muted">
            Pick an operator, select individual tails, then pull last-known
            locations — or add them to continuous tracking.
          </p>
          <input
            value={opQ}
            onChange={(e) => {
              setOpQ(e.target.value)
              setPickedOpId(null)
              setSelectedOpTails(new Set())
            }}
            placeholder="Search operator or tail…"
            className="mt-3 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream"
          />
          {!pickedOp ? (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {opHits.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-left text-sm hover:border-gold/40"
                    onClick={() => {
                      setPickedOpId(o.id)
                      setSelectedOpTails(new Set())
                    }}
                  >
                    <span className="text-cream">{o.name}</span>
                    <span className="avionic text-xs text-muted">
                      {o.tails.length} tails
                      {o.base_icao ? ` · ${o.base_icao}` : ''}
                    </span>
                  </button>
                </li>
              ))}
              {!opHits.length ? (
                <li className="px-1 py-2 text-xs text-muted">No operators</li>
              ) : null}
            </ul>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-cream">{pickedOp.name}</div>
                  <div className="text-[11px] text-muted">
                    {pickedOp.tails.length} tails
                    {pickedOp.base_icao ? ` · ${pickedOp.base_icao}` : ''}
                    {selectedOpTails.size
                      ? ` · ${selectedOpTails.size} selected`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-gold"
                  onClick={() => {
                    setPickedOpId(null)
                    setSelectedOpTails(new Set())
                  }}
                >
                  Back
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-xs text-gold hover:text-gold-lt"
                  onClick={selectAllOpTails}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-cream"
                  onClick={() => setSelectedOpTails(new Set())}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="ml-auto rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
                  disabled={pollBusy || selectedOpTails.size === 0}
                  onClick={() => void onPollSelectedLastKnown()}
                >
                  {pollBusy
                    ? 'Polling…'
                    : `Get last known${
                        selectedOpTails.size
                          ? ` (${selectedOpTails.size})`
                          : ''
                      }`}
                </button>
              </div>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {pickedOp.tails.map((a) => {
                  const on = tracking.some((t) => t.tail === a.tail)
                  const checked = selectedOpTails.has(a.tail)
                  const polled = polledStatuses.find(
                    (s) => s.tail.toUpperCase() === a.tail,
                  )
                  return (
                    <li
                      key={a.tail}
                      className={[
                        'flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm',
                        checked ? 'border-gold/50 bg-gold/5' : 'border-border',
                      ].join(' ')}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOpTail(a.tail)}
                          className="accent-[#C9A227]"
                        />
                        <span>
                          <span className="avionic text-gold">{a.tail}</span>
                          <span className="ml-2 text-muted">
                            {a.type_name || '—'}
                          </span>
                          {polled && !polled.laddBlocked ? (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-[#2E7D32]">
                              {polled.phase.replace('_', ' ')}
                            </span>
                          ) : null}
                        </span>
                      </label>
                      {on ? (
                        <span className="text-[10px] uppercase tracking-wide text-gold">
                          Tracking
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md border border-gold/40 px-2.5 py-1 text-xs text-gold hover:bg-gold/10 disabled:opacity-50"
                          disabled={alertBusyTail === a.tail}
                          onClick={() =>
                            void onAddTracking({
                              tail: a.tail,
                              type_name: a.type_name,
                              operator_name: pickedOp.name,
                              operator_id: pickedOp.id,
                              base_icao: a.base_icao ?? pickedOp.base_icao,
                            })
                          }
                        >
                          {alertBusyTail === a.tail
                            ? 'Adding…'
                            : 'Add to tracking'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <Link to="/admin" className="mt-3 inline-block text-xs text-gold">
            Add operator / D085 wizard →
          </Link>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            WX brief
          </h2>
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
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">…</p>
          )}
          {selectedStatus && (
            <div className="mt-4 border-t border-border pt-3 text-sm">
              <div className="avionic text-gold">{selectedStatus.tail}</div>
              <div className="text-cream">
                {selectedStatus.type_name?.trim() || '—'}
              </div>
              <div className="text-muted">{selectedStatus.operator_name}</div>
              <div className="mt-2">
                <FlightChip
                  phase={selectedStatus.phase}
                  inPosition={selectedStatus.inPositionOfBase}
                  laddBlocked={selectedStatus.laddBlocked}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xs uppercase tracking-wider text-muted">
              Who we&apos;re tracking
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Movement alerts on — {trackedRows.length} tail
              {trackedRows.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {!trackedRows.length ? (
          <p className="rounded border border-border bg-surface px-3 py-4 text-sm text-muted">
            Nobody yet. Look up a tail or an operator and click{' '}
            <span className="text-cream">Add to tracking</span>.
          </p>
        ) : (
          <ul className="space-y-2">
            {trackedRows.map((p) => (
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
                  <div className="mt-0.5 text-[11px] text-muted">
                    TO {fmtWhen(p.lastTakeoffAt)} · LDG{' '}
                    {fmtWhen(p.lastLandingAt)}
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  <span className="avionic text-xs text-muted">{p.gs} kt</span>
                  <FlightChip
                    phase={p.phase}
                    inPosition={p.inPosition}
                    laddBlocked={p.laddBlocked}
                  />
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-late disabled:opacity-50"
                    disabled={alertBusyTail === p.tail}
                    onClick={() => void onRemoveTracking(p.tail)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
