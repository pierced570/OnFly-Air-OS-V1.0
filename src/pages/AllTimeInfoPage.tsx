/**
 * All Time Info — master CSV tracker of every trip metric we can capture.
 * KPI strip on top; full log table + download; event journal for parses/invoices/ADS-B.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  ALL_TIME_COLUMNS,
  allTimeRowsToCsv,
  formatKpiMinutes,
  formatKpiPct,
  formatKpiUsd,
  summarizeAllTimeKpis,
  type AllTimeColumn,
} from '@/domain/allTimeInfo'
import {
  ensureAllTimeSync,
  listAllTimeEvents,
  listAllTimeRows,
  subscribeAllTime,
  syncAllTripsToAllTime,
} from '@/lib/allTimeInfoStore'

const COL_LABELS: Partial<Record<AllTimeColumn, string>> = {
  logged_at: 'Logged (UTC)',
  trip_code: 'Code',
  trip_ref: 'Ref',
  client_name: 'Client',
  lane: 'Lane',
  payload_kind: 'Payload',
  source: 'Source',
  state: 'State',
  discarded: 'Discarded',
  operator_name: 'Operator',
  tail: 'Tail',
  aircraft_type: 'Type',
  time_to_position_min: 'TTP min',
  vendor_cost: 'Vendor $',
  client_price: 'Client $',
  margin: 'Margin $',
  po_number: 'PO',
  referral_name: 'Referral',
  request_logged_at: 'Request @',
  parsed_at: 'Parsed @',
  quote_sent_at: 'Quote @',
  minutes_to_quote: 'Min→quote',
  booked_at: 'Booked @',
  minutes_request_to_book: 'Min→book',
  wheels_up_at: 'Wheels up',
  wheels_down_at: 'Wheels down',
  wheels_up_est_at: 'Est up',
  wheels_down_est_at: 'Est down',
  on_time_departure: 'OTD',
  on_time_arrival: 'OTA',
  delivered_at: 'Delivered @',
  invoice_created_at: 'Inv created',
  invoice_sent_at: 'Inv sent',
  invoice_paid_at: 'Inv paid',
  invoice_status: 'Inv status',
  invoice_total: 'Inv $',
  adsb_actuals_logged: 'ADS-B',
  discarded_at: 'Discarded @',
  lost_reason: 'Lost reason',
}

/** Columns shown in the on-screen table (CSV download still has all). */
const TABLE_COLS: AllTimeColumn[] = [
  'trip_code',
  'client_name',
  'lane',
  'state',
  'source',
  'operator_name',
  'tail',
  'vendor_cost',
  'client_price',
  'margin',
  'time_to_position_min',
  'minutes_to_quote',
  'minutes_request_to_book',
  'wheels_up_at',
  'wheels_down_at',
  'on_time_departure',
  'on_time_arrival',
  'invoice_sent_at',
  'invoice_status',
  'adsb_actuals_logged',
  'discarded',
  'request_logged_at',
]

function Kpi({
  label,
  value,
  tone = 'cream',
}: {
  label: string
  value: string
  tone?: 'cream' | 'gold' | 'onplan' | 'late'
}) {
  const toneCls =
    tone === 'gold'
      ? 'text-gold'
      : tone === 'onplan'
        ? 'text-onplan'
        : tone === 'late'
          ? 'text-late'
          : 'text-cream'
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={['mt-1 avionic text-lg', toneCls].join(' ')}>{value}</div>
    </div>
  )
}

function shortUtc(iso: string): string {
  if (!iso) return '—'
  const d = Date.parse(iso)
  if (!Number.isFinite(d)) return iso
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `onfly-all-time-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AllTimeInfoPage() {
  const rows = useSyncExternalStore(subscribeAllTime, listAllTimeRows, listAllTimeRows)
  const events = useSyncExternalStore(
    subscribeAllTime,
    listAllTimeEvents,
    listAllTimeEvents,
  )
  const [q, setQ] = useState('')
  const [showDiscarded, setShowDiscarded] = useState(true)
  const [tab, setTab] = useState<'trips' | 'journal'>('trips')

  useEffect(() => ensureAllTimeSync(), [])

  const kpis = useMemo(() => summarizeAllTimeKpis(rows), [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (!showDiscarded && r.discarded === 'yes') return false
      if (!needle) return true
      return ALL_TIME_COLUMNS.some((c) =>
        (r[c] ?? '').toLowerCase().includes(needle),
      )
    })
  }, [rows, q, showDiscarded])

  const csv = useMemo(() => allTimeRowsToCsv(filtered), [filtered])

  return (
    <div className="flex min-h-full flex-col bg-ink text-cream">
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-cream">All Time Info</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Master ops log — every parsed request, quote, book, ADS-B wheels
              up/down, invoice, vendor & client price, discard. CSV-shaped; trip
              spine is still the source of truth.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-cream"
              onClick={() => syncAllTripsToAllTime()}
            >
              Refresh from trips
            </button>
            <button
              type="button"
              className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink hover:bg-gold/90"
              onClick={() => downloadCsv(csv)}
            >
              Download CSV
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Trips logged" value={String(kpis.trips_total)} tone="gold" />
        <Kpi label="Booked" value={String(kpis.trips_booked)} />
        <Kpi label="Delivered" value={String(kpis.trips_delivered)} tone="onplan" />
        <Kpi label="Discarded" value={String(kpis.trips_discarded)} tone="late" />
        <Kpi label="Invoices sent" value={String(kpis.invoices_sent)} />
        <Kpi label="ADS-B tracked" value={String(kpis.adsb_tracked)} />
        <Kpi label="Revenue" value={formatKpiUsd(kpis.revenue_total)} tone="gold" />
        <Kpi label="Vendor cost" value={formatKpiUsd(kpis.vendor_cost_total)} />
        <Kpi label="Margin" value={formatKpiUsd(kpis.margin_total)} tone="onplan" />
        <Kpi
          label="Avg time → quote"
          value={formatKpiMinutes(kpis.avg_minutes_to_quote)}
        />
        <Kpi
          label="Avg request → book"
          value={formatKpiMinutes(kpis.avg_minutes_request_to_book)}
        />
        <Kpi
          label="Avg TTP"
          value={formatKpiMinutes(kpis.avg_time_to_position_min)}
        />
        <Kpi
          label="On-time dep"
          value={formatKpiPct(kpis.on_time_departure_pct)}
          tone={
            kpis.on_time_departure_pct == null
              ? 'cream'
              : kpis.on_time_departure_pct >= 85
                ? 'onplan'
                : 'late'
          }
        />
        <Kpi
          label="On-time arr"
          value={formatKpiPct(kpis.on_time_arrival_pct)}
          tone={
            kpis.on_time_arrival_pct == null
              ? 'cream'
              : kpis.on_time_arrival_pct >= 85
                ? 'onplan'
                : 'late'
          }
        />
        <Kpi
          label="On-time sample"
          value={kpis.on_time_sample ? String(kpis.on_time_sample) : '—'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          <button
            type="button"
            className={[
              'rounded px-3 py-1.5 text-xs',
              tab === 'trips' ? 'bg-gold/20 text-gold' : 'text-muted',
            ].join(' ')}
            onClick={() => setTab('trips')}
          >
            Trip CSV ({filtered.length})
          </button>
          <button
            type="button"
            className={[
              'rounded px-3 py-1.5 text-xs',
              tab === 'journal' ? 'bg-gold/20 text-gold' : 'text-muted',
            ].join(' ')}
            onClick={() => setTab('journal')}
          >
            Event journal ({events.length})
          </button>
        </div>
        {tab === 'trips' && (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter client, lane, tail, PO…"
              className="min-w-[12rem] flex-1 rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold"
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showDiscarded}
                onChange={(e) => setShowDiscarded(e.target.checked)}
              />
              Include discarded
            </label>
          </>
        )}
      </div>

      {tab === 'trips' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[70rem] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr>
                {TABLE_COLS.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap border-b border-border px-2 py-2 font-medium uppercase tracking-wider text-muted"
                  >
                    {COL_LABELS[c] ?? c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={TABLE_COLS.length}
                    className="px-4 py-10 text-center text-sm text-muted"
                  >
                    No trips logged yet. Parse a request, send a quote, or book a
                    trip — rows appear here automatically.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.trip_id}
                    className="border-b border-border/60 hover:bg-surface/80"
                  >
                    {TABLE_COLS.map((c) => {
                      const raw = r[c] ?? ''
                      const display =
                        c.endsWith('_at') || c === 'logged_at'
                          ? shortUtc(raw)
                          : raw || '—'
                      return (
                        <td
                          key={c}
                          className={[
                            'max-w-[10rem] truncate whitespace-nowrap px-2 py-1.5',
                            c === 'trip_code' ||
                            c === 'tail' ||
                            c.endsWith('_at') ||
                            c.includes('min') ||
                            c.includes('cost') ||
                            c.includes('price') ||
                            c.includes('margin')
                              ? 'avionic'
                              : '',
                            r.discarded === 'yes' ? 'text-muted' : 'text-cream',
                          ].join(' ')}
                          title={raw}
                        >
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3 sm:px-6">
          {events.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Event journal is empty. Parses, invoices, ADS-B actuals, and
              discards land here as they happen.
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="avionic text-[11px] text-muted">
                      {shortUtc(ev.at)}
                    </span>
                    <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                      {ev.kind.replace(/_/g, ' ')}
                    </span>
                    {ev.trip_code && (
                      <span className="avionic text-xs text-cream">
                        {ev.trip_code}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-cream/90">{ev.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
