import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  addFinancialVendorLine,
  listFinancials,
  removeFinancialVendorLine,
  subscribeFinancials,
  updateFinancialField,
  updateFinancialRecord,
  updateFinancialVendorLine,
  financialOverrideCount,
  clearFinancialOverrides,
} from '@/lib/financialsStore'
import {
  dueDateFor,
  summarize,
  vendorKindLabel,
  type ComputedFinancial,
  type VendorLineKind,
} from '@/domain/financials'
import {
  referralFlightMonthKey,
  referralMonthLabel,
  shareTermsLabel,
} from '@/domain/referrals'
import { getReferralByName } from '@/lib/referralStore'
import { sendFinancialInvoice } from '@/lib/invoiceFlow'
import { useQuickBooksDashboard } from '@/lib/useQuickBooksDashboard'
import { isRealQbEnabled } from '@/adapters/accounting'
import {
  AircraftTypeSelect,
  initialAircraftTypeSelectValue,
} from '@/components/AircraftTypeSelect'
import { BrandLockup } from '@/components/BrandLockup'
import { NumericDraftInput } from '@/components/NumericDraftInput'
import {
  canUseStorage,
  uploadTripDocToStorage,
} from '@/lib/storage'

function usd(n: number, digits = 2) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

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

function StatusPill({
  label,
  ok,
  tone,
}: {
  label: string
  ok: boolean
  tone: 'onplan' | 'gold' | 'attn'
}) {
  const colors =
    tone === 'onplan'
      ? ok
        ? 'border-onplan/50 bg-onplan/20 text-onplan'
        : 'border-border text-muted'
      : tone === 'gold'
        ? ok
          ? 'border-gold/50 bg-gold/20 text-gold'
          : 'border-border text-muted'
        : ok
          ? 'border-late/40 bg-late/15 text-late'
          : 'border-border text-muted'
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        colors,
      ].join(' ')}
    >
      {label}
      {ok ? ' ✓' : ''}
    </span>
  )
}

type Drawer = 'op' | 'client' | 'edit' | null

export default function FinancialsPage() {
  const rows = useSyncExternalStore(subscribeFinancials, listFinancials, listFinancials)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'unpaid' | 'due_soon'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [openDrawer, setOpenDrawer] = useState<Record<string, Drawer>>({})
  const [openAll, setOpenAll] = useState<Drawer>(null)
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null)
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null)
  const qb = useQuickBooksDashboard()
  const editedCount = financialOverrideCount()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('qb')
    if (flag === 'connected') {
      setInvoiceMsg('QuickBooks connected.')
      void qb.refresh()
    } else if (flag === 'token_failed' || flag === 'error') {
      setInvoiceMsg('QuickBooks connect failed — check QB secrets / redirect URI.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const now = Date.now()
    const week = now + 7 * 86400000
    return rows.filter((r) => {
      if (dateFrom && (r.date_of_flight ?? '') < dateFrom) return false
      if (dateTo && (r.date_of_flight ?? '') > dateTo) return false
      if (status === 'unpaid') {
        if (r.was_it_paid && r.vendor_paid && r.jonny_money_owed <= 0) return false
      }
      if (status === 'due_soon') {
        if (r.was_it_paid) return false
        const due = dueDateFor(r)
        if (!due) return false
        const t = due.getTime()
        if (t < now || t > week) return false
      }
      if (!needle) return true
      const blob = [
        r.operator_po,
        r.client_name,
        r.vendor_name,
        r.tail_number,
        r.aircraft_type,
        r.route_text,
        r.check_deposit_number,
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(needle)
    })
  }, [rows, q, status, dateFrom, dateTo])

  const stats = useMemo(() => summarize(filtered), [filtered])

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected],
  )
  const selectedSum = useMemo(() => summarize(selectedRows), [selectedRows])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function markSelectedPaid() {
    for (const id of selected) {
      updateFinancialField(id, 'was_it_paid', true)
    }
  }

  function drawerFor(id: string): Drawer {
    if (openAll) return openAll
    return openDrawer[id] ?? null
  }

  function setDrawer(id: string, d: Drawer) {
    setOpenAll(null)
    setOpenDrawer((m) => ({ ...m, [id]: m[id] === d ? null : d }))
  }

  async function sendInvoice(r: ComputedFinancial) {
    const latest = listFinancials().find((x) => x.id === r.id) ?? r
    const confirmed = (latest.aircraft_type ?? '').trim()
    if (!confirmed) {
      setInvoiceMsg(
        'Confirm aircraft type on the row (Edit or Client Pmts) before sending the invoice.',
      )
      setDrawer(r.id, 'client')
      return
    }
    setInvoiceBusy(r.id)
    setInvoiceMsg(null)
    try {
      const result = await sendFinancialInvoice(latest)
      setInvoiceMsg(
        result.emailed
          ? `Invoice ${result.poNumber} created + emailed to ${result.to.join(', ')}`
          : `Invoice ${result.poNumber} created${
              result.created.mock ? ' locally' : ' in QuickBooks'
            }${result.to.length ? '' : ' — no AP email on file'}`,
      )
      void qb.refresh()
    } catch (e) {
      setInvoiceMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setInvoiceBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-28 sm:p-6">
      <header>
        <BrandLockup variant="mark" className="!h-9 !w-9 mb-2" />
        <div className="text-xs uppercase tracking-[0.2em] text-gold">Money</div>
        <h1 className="mt-1 text-2xl font-semibold text-cream">Financials</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} records · open <span className="text-gold">Edit</span> on
          any row to fix wrong trip / money data
          {editedCount > 0
            ? ` · ${editedCount} correction(s) saved to this workspace`
            : ''}
          {' · '}
          QBO create with ACH View &amp; pay · native QuickBooks send
        </p>
      </header>

      <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2.5 text-sm text-cream">
        <span className="font-medium text-gold">Fix wrong data:</span> click{' '}
        <span className="avionic text-gold">Edit</span> on a trip row → change date,
        PO, client, route, aircraft, tail, amounts, tax, funded-by, notes. Leave a
        field to save (synced to the ledger). Margin / investor math recalculates
        on money edits (legacy rows unlock automatically).
        {editedCount > 0 && (
          <button
            type="button"
            className="ml-2 text-xs text-late underline"
            onClick={() => {
              if (
                window.confirm(
                  `Discard ${editedCount} local correction(s) and reload fixture defaults? DB values reload on next refresh.`,
                )
              ) {
                clearFinancialOverrides()
              }
            }}
          >
            Reset local edits
          </button>
        )}
      </div>

      <QbConnectBanner
        connected={qb.connection?.connected ?? false}
        environment={qb.connection?.environment ?? null}
        realMode={isRealQbEnabled()}
        busy={qb.busy}
        error={qb.error}
        onConnect={() => void qb.connect()}
        onRefresh={() => void qb.refresh()}
        onMessage={setInvoiceMsg}
      />

      {invoiceMsg && (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream">
          {invoiceMsg}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total revenue" value={usd(stats.revenue, 0)} tone="onplan" />
        <Kpi label="Operator cost" value={usd(stats.cost, 0)} />
        <Kpi label="Net margin" value={usd(stats.margin, 0)} tone="gold" />
        <Kpi label="Unpaid" value={String(stats.unpaid)} tone="late" />
        <Kpi label="Records" value={String(stats.trips)} />
      </div>

      {qb.stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label={`QBO revenue (${qb.stats.source})`}
            value={usd(qb.stats.lifetime_revenue, 0)}
            tone="onplan"
          />
          <Kpi
            label="QBO outstanding"
            value={usd(qb.stats.total_outstanding, 0)}
            tone="late"
          />
          <Kpi label="QBO open" value={String(qb.stats.open_count)} />
          <Kpi label="QBO overdue" value={String(qb.stats.overdue_count)} tone="late" />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search PO#, client, operator, route…"
          className="w-full min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-cream sm:py-2"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <label className="text-xs text-muted">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-2.5 text-sm text-cream sm:py-1.5"
            />
          </label>
          <label className="text-xs text-muted">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-2.5 text-sm text-cream sm:py-1.5"
            />
          </label>
        </div>
        <div className="flex w-full rounded-lg border border-border bg-surface-2 p-0.5 sm:w-auto">
          {(
            [
              ['all', 'All'],
              ['unpaid', 'Unpaid'],
              ['due_soon', 'Due 7d'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatus(id)}
              className={[
                'min-h-10 flex-1 rounded-md px-3 py-2 text-xs font-medium sm:flex-none sm:py-1.5',
                status === id ? 'bg-gold text-ink' : 'text-muted',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="board-rail flex gap-2 overflow-x-auto pb-1 text-muted sm:flex-wrap sm:overflow-visible">
          <span className="hidden shrink-0 uppercase tracking-wider sm:inline">
            Open all:
          </span>
          <button
            type="button"
            className="shrink-0 rounded border border-border px-3 py-2 hover:text-cream"
            onClick={() => setOpenAll('op')}
          >
            Open Vendor
          </button>
          <button
            type="button"
            className="shrink-0 rounded border border-border px-3 py-2 hover:text-cream"
            onClick={() => setOpenAll('client')}
          >
            Open Client
          </button>
          <button
            type="button"
            className="shrink-0 rounded border border-border px-3 py-2 hover:text-cream"
            onClick={() => {
              setOpenAll(null)
              setOpenDrawer({})
            }}
          >
            Collapse all
          </button>
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">{selected.size} selected</span>
            <button
              type="button"
              className="tap text-gold"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={markSelectedPaid}
              className="min-h-10 rounded-md bg-gold px-3 py-2 font-medium text-ink"
            >
              Mark as paid
            </button>
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 lg:hidden">
        {filtered.map((r) => {
          const d = drawerFor(r.id)
          const clientOk = r.was_it_paid
          // Op pill = operator paid (QB bill log is separate in Op Pmts)
          const opOk = r.vendor_paid
          const invOk = r.investor_paid || r.jonny_money_owed <= 0
          return (
            <MobileFinancialCard
              key={r.id}
              r={r}
              selected={selected.has(r.id)}
              onToggle={() => toggleSelect(r.id)}
              drawer={d}
              onDrawer={(next) => setDrawer(r.id, next)}
              clientOk={clientOk}
              opOk={Boolean(opOk)}
              invOk={invOk}
              invoiceBusy={invoiceBusy === r.id}
              onSendInvoice={() => void sendInvoice(r)}
            />
          )
        })}
        {filtered.length === 0 && (
          <li className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted">
            No matching rows
          </li>
        )}
      </ul>

      {/* Desktop table */}
      <div className="board-rail hidden overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="w-10 px-2 py-2" />
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">PO#</th>
              <th className="px-2 py-2">Client</th>
              <th className="px-2 py-2">Route</th>
              <th className="px-2 py-2">Operator</th>
              <th className="px-2 py-2">Aircraft</th>
              <th className="px-2 py-2">Tail</th>
              <th className="px-2 py-2 text-right">Client charged</th>
              <th className="px-2 py-2 text-right">Tax</th>
              <th className="px-2 py-2 text-right">Op owed</th>
              <th className="px-2 py-2 text-right">Margin</th>
              <th className="px-2 py-2 text-right">Investor owed</th>
              <th className="px-2 py-2 text-right">Referral</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Drawers</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const d = drawerFor(r.id)
              const clientOk = r.was_it_paid
              // Op pill = operator paid (QB bill log is separate in Op Pmts)
          const opOk = r.vendor_paid
              const invOk = r.investor_paid || r.jonny_money_owed <= 0
              return (
                <FragmentRow
                  key={r.id}
                  r={r}
                  selected={selected.has(r.id)}
                  onToggle={() => toggleSelect(r.id)}
                  drawer={d}
                  onDrawer={(next) => setDrawer(r.id, next)}
                  clientOk={clientOk}
                  opOk={Boolean(opOk)}
                  invOk={invOk}
                  invoiceBusy={invoiceBusy === r.id}
                  onSendInvoice={() => void sendInvoice(r)}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedRows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-ink/95 px-4 py-3 safe-bottom backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <span className="text-muted">{selectedRows.length} row(s)</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 avionic text-xs sm:text-sm">
              <span>
                Client{' '}
                <span className="text-cream">{usd(selectedSum.revenue)}</span>
              </span>
              <span>
                Op <span className="text-cream">{usd(selectedSum.cost)}</span>
              </span>
              <span>
                Margin <span className="text-onplan">{usd(selectedSum.margin)}</span>
              </span>
              <span>
                Investor{' '}
                <span className="text-gold">
                  {usd(
                    selectedRows.reduce((s, r) => s + r.jonny_money_owed, 0),
                  )}
                </span>
              </span>
              <span>
                Referral{' '}
                <span className="text-gold">
                  {usd(
                    selectedRows.reduce(
                      (s, r) =>
                        s +
                        (r.referral_paid_out
                          ? 0
                          : r.referral_share_amount || 0),
                      0,
                    ),
                  )}
                </span>
              </span>
              <span>
                Profit <span className="text-onplan">{usd(selectedSum.ofa)}</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QbConnectBanner({
  connected,
  environment,
  realMode,
  busy,
  error,
  onConnect,
  onRefresh,
  onMessage,
}: {
  connected: boolean
  environment: string | null
  realMode: boolean
  busy: boolean
  error: string | null
  onConnect: () => void
  onRefresh: () => void
  onMessage?: (msg: string) => void
}) {
  const [simBusy, setSimBusy] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  useEffect(() => {
    let unsub: () => void = () => undefined
    void import('@/lib/invoiceRetryQueue').then((m) => {
      setRetryCount(m.listInvoiceRetries().length)
      unsub = m.subscribeInvoiceRetry(() =>
        setRetryCount(m.listInvoiceRetries().length),
      )
    })
    return () => {
      unsub()
    }
  }, [])

  async function simulatePaid() {
    setSimBusy(true)
    try {
      const { listTripsStable } = await import('@/lib/tripStore')
      const { markMockInvoicePaid } = await import('@/adapters/accounting')
      const { pollQbPaidInvoices } = await import('@/lib/qbPaidPoller')
      let marked = 0
      for (const t of listTripsStable()) {
        if (t.state !== 'invoiced' || !t.invoice?.qb_invoice_id) continue
        if (markMockInvoicePaid(t.invoice.qb_invoice_id)) marked++
      }
      const result = await pollQbPaidInvoices()
      onMessage?.(
        marked
          ? `Marked ${marked} mock invoice(s) paid · closed ${result.closed} trip(s)`
          : 'No invoiced mock trips to mark paid',
      )
      onRefresh()
    } finally {
      setSimBusy(false)
    }
  }

  async function flushRetries() {
    setSimBusy(true)
    try {
      const m = await import('@/lib/invoiceRetryQueue')
      const r = await m.flushInvoiceRetryQueue()
      onMessage?.(`Invoice retry flush · ok ${r.ok} · failed ${r.failed}`)
      setRetryCount(m.listInvoiceRetries().length)
    } finally {
      setSimBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted">
            QuickBooks Online
          </div>
          <p className="mt-0.5 text-sm text-cream">
            {!realMode
              ? 'Mock mode — invoices create locally (zero API keys). Set VITE_QB_ADAPTER=real + edge QB secrets to go live.'
              : connected
                ? `Connected${environment ? ` · ${environment}` : ''} · QBO ACH View & pay · native send`
                : 'Not connected — Connect to create live QBO invoices'}
          </p>
          {realMode && connected && environment === 'sandbox' ? (
            <p className="mt-1 text-xs text-late">
              Still on Intuit <span className="font-semibold">sandbox</span> —
              invoices will look wrong. Disconnect/Connect and pick the live
              OnFly Air company (QB_ENVIRONMENT=production).
            </p>
          ) : null}
          {error && <p className="mt-1 text-xs text-late">{error}</p>}
          {retryCount > 0 && (
            <p className="mt-1 text-xs text-gold">
              {retryCount} invoice(s) waiting to retry
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || simBusy}
            onClick={onRefresh}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-cream"
          >
            Refresh
          </button>
          {retryCount > 0 && (
            <button
              type="button"
              disabled={simBusy}
              onClick={() => void flushRetries()}
              className="rounded-md border border-gold/40 px-3 py-1.5 text-xs text-gold"
            >
              Retry failed invoices
            </button>
          )}
          {!realMode && (
            <button
              type="button"
              disabled={simBusy}
              onClick={() => void simulatePaid()}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-cream"
            >
              Simulate QB paid → close
            </button>
          )}
          {realMode && !connected && (
            <button
              type="button"
              disabled={busy}
              onClick={onConnect}
              className="rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-ink"
            >
              Connect QuickBooks
            </button>
          )}
        </div>
      </div>
      <ul className="grid gap-1 text-[11px] text-muted sm:grid-cols-2 lg:grid-cols-4">
        <li>1. Intuit app → QB_CLIENT_ID / SECRET</li>
        <li>2. Deploy quickbooks-auth + quickbooks-api</li>
        <li>3. VITE_QB_ADAPTER=real</li>
        <li>4. Connect here · invoice on deliver / Financials</li>
      </ul>
    </div>
  )
}

function MobileFinancialCard({
  r,
  selected,
  onToggle,
  drawer,
  onDrawer,
  clientOk,
  opOk,
  invOk,
  invoiceBusy,
  onSendInvoice,
}: {
  r: ComputedFinancial
  selected: boolean
  onToggle: () => void
  drawer: Drawer
  onDrawer: (d: Drawer) => void
  clientOk: boolean
  opOk: boolean
  invOk: boolean
  invoiceBusy: boolean
  onSendInvoice: () => void
}) {
  const alreadyInvoiced = Boolean(r.qb_invoice_id)
  return (
    <li
      className={[
        'rounded-lg border border-border p-3',
        selected ? 'border-gold/50 bg-gold/10' : 'bg-surface',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${r.operator_po ?? r.id}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="avionic text-gold">
              {r.operator_po ?? '—'}
            </span>
            <span className="avionic text-xs text-muted">
              {r.date_of_flight ?? '—'}
            </span>
          </div>
          <div className="mt-0.5 truncate text-sm font-medium text-cream">
            {r.client_name ?? '—'}
          </div>
          <div className="mt-0.5 avionic text-xs text-muted">
            {r.route_text ?? '—'}
            {r.tail_number ? ` · ${r.tail_number}` : ''}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div>
              <span className="text-muted">Client </span>
              <span className="avionic text-cream">
                {usd(r.client_invoiced_amount)}
              </span>
            </div>
            <div>
              <span className="text-muted">Op </span>
              <span className="avionic text-cream">{usd(r.vendor_amount)}</span>
            </div>
            <div>
              <span className="text-muted">Margin </span>
              <span className="avionic text-onplan">{usd(r.margin)}</span>
            </div>
            <div>
              <span className="text-muted">Investor </span>
              <span className="avionic text-gold">
                {r.jonny_money_owed > 0 ? usd(r.jonny_money_owed) : '—'}
              </span>
            </div>
            {r.referral_name && (
              <div className="col-span-2">
                <span className="text-muted">Referral </span>
                <span className="text-cream">{r.referral_name}</span>
                <span className="avionic text-gold">
                  {' '}
                  {usd(r.referral_share_amount || 0)}
                  {r.referral_paid_out ? ' paid' : ''}
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <StatusPill label="Client" ok={clientOk} tone="onplan" />
            <StatusPill label="Op" ok={opOk} tone="gold" />
            <StatusPill label="Inv" ok={invOk} tone="attn" />
            {Boolean(r.referral_name) && (
              <StatusPill
                label="Ref"
                ok={r.referral_paid_out || (r.referral_share_amount || 0) <= 0}
                tone="gold"
              />
            )}
            {alreadyInvoiced && <StatusPill label="QB" ok tone="gold" />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-10 rounded-md bg-gold px-3 py-2 text-xs font-medium text-ink"
            onClick={() => onDrawer(drawer === 'edit' ? null : 'edit')}
          >
            {drawer === 'edit' ? 'Hide Edit' : 'Edit trip'}
          </button>
          <button
              type="button"
              className="min-h-10 rounded-md border border-border px-3 py-2 text-xs text-gold"
              onClick={() => onDrawer(drawer === 'op' ? null : 'op')}
            >
              {drawer === 'op' ? 'Hide Op' : 'Op Pmts'}
            </button>
            <button
              type="button"
              className="min-h-10 rounded-md border border-border px-3 py-2 text-xs text-gold"
              onClick={() => onDrawer(drawer === 'client' ? null : 'client')}
            >
              {drawer === 'client' ? 'Hide Client' : 'Client Pmts'}
            </button>
            <button
              type="button"
              disabled={
                invoiceBusy ||
                alreadyInvoiced ||
                r.client_invoiced_amount <= 0 ||
                !(r.aircraft_type ?? '').trim()
              }
              onClick={onSendInvoice}
              className="min-h-10 rounded-md border border-gold/40 px-3 py-2 text-xs font-medium text-gold disabled:opacity-40"
            >
              {invoiceBusy ? '…' : alreadyInvoiced ? 'Invoiced' : 'Send Invoice'}
            </button>
          </div>
          {drawer && (
            <div className="mt-3">
              {drawer === 'edit' ? (
                <EditDrawer r={r} />
              ) : drawer === 'op' ? (
                <OpDrawer r={r} />
              ) : (
                <ClientDrawer
                  r={r}
                  invoiceBusy={invoiceBusy}
                  onSendInvoice={onSendInvoice}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function FragmentRow({
  r,
  selected,
  onToggle,
  drawer,
  onDrawer,
  clientOk,
  opOk,
  invOk,
  invoiceBusy,
  onSendInvoice,
}: {
  r: ComputedFinancial
  selected: boolean
  onToggle: () => void
  drawer: Drawer
  onDrawer: (d: Drawer) => void
  clientOk: boolean
  opOk: boolean
  invOk: boolean
  invoiceBusy: boolean
  onSendInvoice: () => void
}) {
  const alreadyInvoiced = Boolean(r.qb_invoice_id)
  return (
    <>
      <tr
        className={[
          'border-t border-border/50',
          selected ? 'bg-gold/10' : r.is_legacy ? 'bg-surface/50' : 'bg-surface',
        ].join(' ')}
      >
        <td className="px-2 py-2">
          <input type="checkbox" checked={selected} onChange={onToggle} />
        </td>
        <td className="avionic px-2 py-2 text-muted whitespace-nowrap">
          {r.date_of_flight ?? '—'}
        </td>
        <td className="avionic px-2 py-2 text-gold whitespace-nowrap">
          {r.operator_po ?? '—'}
        </td>
        <td className="px-2 py-2 text-cream">{r.client_name ?? '—'}</td>
        <td className="avionic px-2 py-2 text-muted whitespace-nowrap">
          {r.route_text ?? '—'}
        </td>
        <td className="px-2 py-2 text-muted">{r.vendor_name ?? '—'}</td>
        <td className="px-2 py-2 text-cream">{r.aircraft_type ?? '—'}</td>
        <td className="avionic px-2 py-2 text-gold">{r.tail_number ?? '—'}</td>
        <td className="avionic px-2 py-2 text-right text-cream">
          {usd(r.client_invoiced_amount)}
        </td>
        <td className="avionic px-2 py-2 text-right text-muted">
          {r.tax_total > 0 ? usd(r.tax_total) : '—'}
        </td>
        <td className="avionic px-2 py-2 text-right text-cream">
          {usd(r.vendor_amount)}
        </td>
        <td className="avionic px-2 py-2 text-right font-semibold text-onplan">
          {usd(r.margin)}
        </td>
        <td className="avionic px-2 py-2 text-right font-semibold text-gold">
          {r.jonny_money_owed > 0 ? usd(r.jonny_money_owed) : '—'}
        </td>
        <td className="px-2 py-2 text-right">
          {r.referral_name ? (
            <div>
              <div className="truncate text-xs text-cream">{r.referral_name}</div>
              <div
                className={[
                  'avionic text-xs font-semibold',
                  r.referral_paid_out ? 'text-muted line-through' : 'text-gold',
                ].join(' ')}
              >
                {usd(r.referral_share_amount || 0)}
                {r.referral_paid_out ? ' ✓' : ''}
              </div>
              <div className="text-[10px] text-muted">
                {referralMonthLabel(referralFlightMonthKey(r.date_of_flight))}
              </div>
            </div>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-wrap gap-1">
            <StatusPill label="Client" ok={clientOk} tone="onplan" />
            <StatusPill label="Op" ok={opOk} tone="gold" />
            <StatusPill label="Inv" ok={invOk} tone="attn" />
            {Boolean(r.referral_name) && (
              <StatusPill
                label="Ref"
                ok={r.referral_paid_out || (r.referral_share_amount || 0) <= 0}
                tone="gold"
              />
            )}
            {alreadyInvoiced && (
              <StatusPill label="QB" ok tone="gold" />
            )}
          </div>
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <button
            type="button"
            className="mr-2 min-h-9 rounded bg-gold px-2.5 py-1.5 text-xs font-medium text-ink"
            onClick={() => onDrawer('edit')}
          >
            {drawer === 'edit' ? '▾ Edit' : '▸ Edit'}
          </button>
          <button
            type="button"
            className="mr-2 min-h-9 rounded px-2 py-1.5 text-xs text-gold hover:underline"
            onClick={() => onDrawer('op')}
          >
            {drawer === 'op' ? '▾' : '▸'} Op Pmts
          </button>
          <button
            type="button"
            className="mr-2 min-h-9 rounded px-2 py-1.5 text-xs text-gold hover:underline"
            onClick={() => onDrawer('client')}
          >
            {drawer === 'client' ? '▾' : '▸'} Client Pmts
          </button>
          <button
            type="button"
            disabled={
              invoiceBusy ||
              alreadyInvoiced ||
              r.client_invoiced_amount <= 0 ||
              !(r.aircraft_type ?? '').trim()
            }
            onClick={onSendInvoice}
            className="min-h-9 rounded border border-gold/40 px-2.5 py-1.5 text-xs font-medium text-gold disabled:opacity-40"
            title={
              alreadyInvoiced
                ? `QB ${r.qb_invoice_number || r.qb_invoice_id}`
                : 'Create QBO invoice + send payment request'
            }
          >
            {invoiceBusy ? '…' : alreadyInvoiced ? 'Invoiced' : 'Send Invoice'}
          </button>
        </td>
      </tr>
      {drawer && (
        <tr className="border-t border-border/40 bg-ink/60">
          <td colSpan={16} className="px-3 py-3">
            {drawer === 'edit' ? (
              <EditDrawer r={r} />
            ) : drawer === 'op' ? (
              <OpDrawer r={r} />
            ) : (
              <ClientDrawer
                r={r}
                invoiceBusy={invoiceBusy}
                onSendInvoice={onSendInvoice}
              />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

const field =
  'mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-cream'

function EditDrawer({ r }: { r: ComputedFinancial }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/80 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-cream">
          Edit trip
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {r.is_legacy ? (
            <span className="rounded border border-border px-2 py-0.5 text-muted">
              Legacy import — money edits unlock live math
            </span>
          ) : (
            <span className="rounded border border-onplan/40 px-2 py-0.5 text-onplan">
              Live math
            </span>
          )}
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-gold hover:border-gold/40"
            onClick={() =>
              updateFinancialField(r.id, 'is_legacy', !r.is_legacy)
            }
          >
            {r.is_legacy ? 'Unlock live math' : 'Lock as legacy'}
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted">
          Date of flight
          <input
            key={`dof-${r.id}-${r.date_of_flight}`}
            type="date"
            className={field}
            defaultValue={r.date_of_flight ?? ''}
            onBlur={(e) =>
              updateFinancialField(
                r.id,
                'date_of_flight',
                e.target.value || null,
              )
            }
          />
        </label>
        <label className="text-xs text-muted">
          PO #
          <input
            key={`po-${r.id}-${r.operator_po}`}
            className={`${field} avionic`}
            defaultValue={r.operator_po ?? ''}
            onBlur={(e) =>
              updateFinancialField(r.id, 'operator_po', e.target.value || null)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Client
          <input
            key={`cl-${r.id}-${r.client_name}`}
            className={field}
            defaultValue={r.client_name ?? ''}
            onBlur={(e) =>
              updateFinancialField(r.id, 'client_name', e.target.value || null)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Pay terms
          <input
            key={`pt-${r.id}-${r.pay_terms}`}
            className={field}
            defaultValue={r.pay_terms ?? ''}
            onBlur={(e) =>
              updateFinancialField(r.id, 'pay_terms', e.target.value || null)
            }
            placeholder="Net 30"
          />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Route
          <input
            key={`rt-${r.id}-${r.route_text}`}
            className={`${field} avionic`}
            defaultValue={r.route_text ?? ''}
            onBlur={(e) =>
              updateFinancialField(r.id, 'route_text', e.target.value || null)
            }
            placeholder="KCAK → KMDW"
          />
        </label>
        <AircraftTypeSelect
          key={`ac-${r.id}-${r.aircraft_type}`}
          label="Aircraft type"
          draft={r.aircraft_type}
          value={r.aircraft_type ?? ''}
          onChange={(v) =>
            updateFinancialField(r.id, 'aircraft_type', v || null)
          }
          selectClassName={field}
        />
        <label className="text-xs text-muted">
          Tail
          <input
            key={`tail-${r.id}-${r.tail_number}`}
            className={`${field} avionic`}
            defaultValue={r.tail_number ?? ''}
            onBlur={(e) =>
              updateFinancialField(r.id, 'tail_number', e.target.value || null)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Operator
          <input
            key={`vn-${r.id}-${r.vendor_name}`}
            className={field}
            defaultValue={r.vendor_name ?? ''}
            onBlur={(e) =>
              updateFinancialField(r.id, 'vendor_name', e.target.value || null)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Referral
          <input
            key={`rf-${r.id}-${r.referral_name}`}
            className={field}
            defaultValue={r.referral_name ?? ''}
            onBlur={(e) =>
              updateFinancialField(
                r.id,
                'referral_name',
                e.target.value || null,
              )
            }
            placeholder="Partner name"
          />
          {r.referral_name ? (
            <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-muted">
              {(() => {
                const partner = getReferralByName(r.referral_name)
                const month = referralFlightMonthKey(r.date_of_flight)
                return (
                  <>
                    {partner
                      ? `Terms: ${shareTermsLabel(partner.share_mode, partner.share_value)} · `
                      : null}
                    Tab: {referralMonthLabel(month)} ·{' '}
                    <Link to="/referrals" className="text-gold">
                      Open Referrals →
                    </Link>
                  </>
                )
              })()}
            </span>
          ) : null}
        </label>
        <label className="text-xs text-muted">
          Referral share ($)
          <NumericDraftInput
            blankZero
            className={`${field} avionic`}
            value={r.referral_share_amount}
            onValueChange={(n) =>
              updateFinancialField(r.id, 'referral_share_amount', n ?? 0)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Client charged ($)
          <NumericDraftInput
            blankZero
            className={`${field} avionic`}
            value={r.client_invoiced_amount}
            onValueChange={(n) =>
              updateFinancialRecord(r.id, {
                client_invoiced_amount: n ?? 0,
              })
            }
          />
        </label>
        <label className="text-xs text-muted">
          Pre-tax subtotal ($)
          <NumericDraftInput
            blankZero
            className={`${field} avionic`}
            value={r.client_subtotal_pre_tax}
            onValueChange={(n) =>
              updateFinancialField(r.id, 'client_subtotal_pre_tax', n)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Operator owed ($)
          <NumericDraftInput
            blankZero
            className={`${field} avionic`}
            value={r.vendor_amount}
            onValueChange={(n) =>
              updateFinancialRecord(r.id, {
                vendor_amount: n ?? 0,
              })
            }
          />
        </label>
        <label className="text-xs text-muted">
          Tax total ($)
          <NumericDraftInput
            blankZero
            className={`${field} avionic`}
            value={r.tax_total}
            onValueChange={(n) =>
              updateFinancialField(r.id, 'tax_total', n ?? 0)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Funded by
          <select
            key={`fd-${r.id}-${r.funded_by}`}
            className={field}
            defaultValue={r.funded_by ?? 'Jonny 1%'}
            onChange={(e) => updateFinancialField(r.id, 'funded_by', e.target.value)}
          >
            <option>Jonny 1%</option>
            <option>Jonny</option>
            <option>OFA</option>
            <option>Awaiting $</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Deposited to
          <select
            key={`dep-${r.id}-${r.deposited_to}`}
            className={field}
            defaultValue={r.deposited_to ?? ''}
            onChange={(e) =>
              updateFinancialField(r.id, 'deposited_to', e.target.value || null)
            }
          >
            <option value="">—</option>
            <option>OFA Biz Acct</option>
            <option>OFA Bank (8071)</option>
            <option>Jonny (Investor)</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          ACH / Check #
          <input
            key={`chk-${r.id}-${r.check_deposit_number}`}
            className={`${field} avionic`}
            defaultValue={r.check_deposit_number ?? ''}
            onBlur={(e) =>
              updateFinancialField(
                r.id,
                'check_deposit_number',
                e.target.value || null,
              )
            }
          />
        </label>
        <label className="text-xs text-muted sm:col-span-2 lg:col-span-4">
          Notes
          <textarea
            key={`nt-${r.id}-${r.notes}`}
            className={`${field} min-h-[4rem]`}
            defaultValue={r.notes ?? ''}
            onBlur={(e) =>
              updateFinancialField(r.id, 'notes', e.target.value || null)
            }
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-cream">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.was_it_paid}
            onChange={(e) =>
              updateFinancialField(r.id, 'was_it_paid', e.target.checked)
            }
          />
          Client paid
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.vendor_paid}
            onChange={(e) =>
              updateFinancialField(r.id, 'vendor_paid', e.target.checked)
            }
          />
          Operator paid
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.investor_paid}
            onChange={(e) =>
              updateFinancialField(r.id, 'investor_paid', e.target.checked)
            }
          />
          Investor paid
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.referral_paid_out}
            onChange={(e) =>
              updateFinancialField(r.id, 'referral_paid_out', e.target.checked)
            }
          />
          Referral paid out
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.bill_logged_in_qb}
            onChange={(e) =>
              updateFinancialField(r.id, 'bill_logged_in_qb', e.target.checked)
            }
          />
          Logged in QB
        </label>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Margin <span className="avionic text-onplan">{usd(r.margin)}</span>
        {' · '}
        Investor owed{' '}
        <span className="avionic text-gold">{usd(r.jonny_money_owed)}</span>
        {' · '}
        Referral share{' '}
        <span className="avionic text-gold">
          {usd(r.referral_share_amount || 0)}
        </span>
        {' · '}
        OFA profit{' '}
        <span className="avionic text-cream">{usd(r.ofa_profit_per_trip)}</span>
        {' · '}
        Edits sync to the ledger (and this browser) after you leave a field.
      </p>
    </div>
  )
}

async function attachVendorBill(
  financialId: string,
  lineId: string,
  file: File,
  po: string | null,
): Promise<void> {
  let url: string | null = null
  if (canUseStorage()) {
    const tripId = financialId.startsWith('trip-')
      ? financialId.slice('trip-'.length)
      : financialId
    try {
      const up = await uploadTripDocToStorage({
        tripId,
        kind: `vendor_bill_${lineId}`,
        file,
      })
      url = up.signedUrl || up.path
    } catch (e) {
      console.warn('[financials] bill upload failed', e)
    }
  }
  if (!url) {
    url = URL.createObjectURL(file)
  }
  updateFinancialVendorLine(financialId, lineId, {
    vendor_bill_url: url,
    vendor_bill_verified: false,
    notes: po ? `PO ${po} · ${file.name}` : file.name,
  })
}

function OpDrawer({ r }: { r: ComputedFinancial }) {
  const vendors = r.vendors
  return (
    <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-gold">
          Op Pmts · same PO
        </div>
        <span className="avionic text-xs text-muted">
          {r.operator_po ?? r.po_number ?? 'No PO yet'} · total owed{' '}
          <span className="text-gold">{usd(r.vendor_amount)}</span>
        </span>
      </div>
      <p className="mb-3 text-[11px] text-muted">
        Aircraft, ground, and FBO vendors on this mission share one PO. Upload a
        bill for each.
      </p>

      <div className="space-y-3">
        {vendors.map((line) => (
          <div
            key={line.id}
            className="rounded-md border border-border/70 bg-ink/60 px-3 py-2.5"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-gold">
                {vendorKindLabel(line.kind)}
              </span>
              {vendors.length > 1 ? (
                <button
                  type="button"
                  className="text-[11px] text-late hover:underline"
                  onClick={() => removeFinancialVendorLine(r.id, line.id)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-muted">
                Vendor
                <input
                  className={field}
                  key={`vn-${line.id}-${line.vendor_name}`}
                  defaultValue={line.vendor_name}
                  onBlur={(e) =>
                    updateFinancialVendorLine(r.id, line.id, {
                      vendor_name: e.target.value,
                    })
                  }
                />
              </label>
              <label className="text-xs text-muted">
                Kind
                <select
                  className={field}
                  value={line.kind}
                  onChange={(e) =>
                    updateFinancialVendorLine(r.id, line.id, {
                      kind: e.target.value as VendorLineKind,
                    })
                  }
                >
                  <option value="aircraft">Aircraft</option>
                  <option value="ground">Ground</option>
                  <option value="fbo">FBO</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-xs text-muted">
                Owed ($)
                <NumericDraftInput
                  blankZero
                  className={field}
                  value={line.amount}
                  onValueChange={(n) =>
                    updateFinancialVendorLine(r.id, line.id, {
                      amount: n ?? 0,
                    })
                  }
                />
              </label>
              <label className="text-xs text-muted">
                Tail / type
                <input
                  className={field}
                  key={`tl-${line.id}-${line.tail_number}-${line.aircraft_type}`}
                  defaultValue={
                    [line.tail_number, line.aircraft_type]
                      .filter(Boolean)
                      .join(' · ') || ''
                  }
                  placeholder="N123AB · Caravan"
                  onBlur={(e) => {
                    const raw = e.target.value.trim()
                    const [tail, ...rest] = raw.split('·').map((s) => s.trim())
                    updateFinancialVendorLine(r.id, line.id, {
                      tail_number: tail || null,
                      aircraft_type: rest.join(' · ') || null,
                    })
                  }}
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-cream">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={line.vendor_paid}
                  onChange={(e) =>
                    updateFinancialVendorLine(r.id, line.id, {
                      vendor_paid: e.target.checked,
                    })
                  }
                />
                Paid
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={line.bill_logged_in_qb}
                  onChange={(e) =>
                    updateFinancialVendorLine(r.id, line.id, {
                      bill_logged_in_qb: e.target.checked,
                    })
                  }
                />
                Logged in QB
              </label>
              {line.vendor_bill_url ? (
                <a
                  href={line.vendor_bill_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gold hover:text-gold-lt"
                >
                  View bill →
                </a>
              ) : (
                <span className="text-xs text-muted">No bill yet</span>
              )}
              <label className="cursor-pointer text-xs font-medium text-gold hover:text-gold-lt">
                {line.vendor_bill_url ? 'Replace bill' : 'Upload bill'}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    void attachVendorBill(
                      r.id,
                      line.id,
                      file,
                      r.operator_po ?? r.po_number ?? null,
                    )
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-gold/50 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/10"
          onClick={() =>
            addFinancialVendorLine(r.id, {
              kind: 'aircraft',
              vendor_name: '',
              pay_terms: r.pay_terms ?? 'Net 30',
            })
          }
        >
          + Aircraft vendor
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-cream hover:border-gold/40"
          onClick={() =>
            addFinancialVendorLine(r.id, {
              kind: 'ground',
              vendor_name: '',
              pay_terms: r.pay_terms ?? 'Net 30',
            })
          }
        >
          + Ground vendor
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-cream hover:border-gold/40"
          onClick={() =>
            addFinancialVendorLine(r.id, {
              kind: 'fbo',
              vendor_name: '',
              pay_terms: r.pay_terms ?? 'Net 30',
            })
          }
        >
          + FBO
        </button>
        <label className="ml-auto text-xs text-muted">
          Funded
          <select
            className={`${field} mt-1 min-w-[8rem]`}
            value={r.funded_by ?? 'Jonny 1%'}
            onChange={(e) => updateFinancialField(r.id, 'funded_by', e.target.value)}
          >
            <option>Jonny 1%</option>
            <option>Jonny</option>
            <option>OFA</option>
            <option>Awaiting $</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Investor owed now:{' '}
        <span className="avionic text-gold">{usd(r.jonny_money_owed)}</span>
        {' · '}
        Op complete when every vendor has bill + paid + QB.
      </p>
    </div>
  )
}

function ClientDrawer({
  r,
  invoiceBusy,
  onSendInvoice,
}: {
  r: ComputedFinancial
  invoiceBusy: boolean
  onSendInvoice: () => void
}) {
  const [confirmedType, setConfirmedType] = useState(() =>
    initialAircraftTypeSelectValue(r.aircraft_type),
  )

  useEffect(() => {
    setConfirmedType((prev) => prev || initialAircraftTypeSelectValue(r.aircraft_type))
  }, [r.aircraft_type])

  return (
    <div className="rounded-lg border border-onplan/30 bg-onplan/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-onplan">
          Client Pmts
        </div>
        <button
          type="button"
          disabled={
            invoiceBusy ||
            Boolean(r.qb_invoice_id) ||
            r.client_invoiced_amount <= 0 ||
            !confirmedType.trim()
          }
          onClick={() => {
            if (confirmedType.trim() !== (r.aircraft_type ?? '').trim()) {
              updateFinancialField(r.id, 'aircraft_type', confirmedType.trim())
            }
            onSendInvoice()
          }}
          className="rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
        >
          {invoiceBusy
            ? 'Sending…'
            : r.qb_invoice_id
              ? `QB ${r.qb_invoice_number || r.qb_invoice_id}`
              : 'Send Invoice'}
        </button>
      </div>
      <AircraftTypeSelect
        className="mb-3 block text-xs text-muted"
        label="Confirm aircraft type before invoice"
        draft={r.aircraft_type}
        value={confirmedType}
        onChange={(v) => {
          setConfirmedType(v)
          updateFinancialField(r.id, 'aircraft_type', v || null)
        }}
        selectClassName={field}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted">
          Charged ($)
          <NumericDraftInput
            blankZero
            className={field}
            value={r.client_invoiced_amount}
            onValueChange={(n) =>
              updateFinancialField(
                r.id,
                'client_invoiced_amount',
                n ?? 0,
              )
            }
          />
        </label>
        <label className="text-xs text-muted">
          Tax total ($)
          <NumericDraftInput
            blankZero
            className={field}
            value={r.tax_total}
            onValueChange={(n) =>
              updateFinancialField(r.id, 'tax_total', n ?? 0)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Deposited
          <select
            key={`dep-${r.id}-${r.deposited_to ?? ''}`}
            className={field}
            defaultValue={r.deposited_to ?? ''}
            onChange={(e) =>
              updateFinancialField(r.id, 'deposited_to', e.target.value || null)
            }
          >
            <option value="">—</option>
            <option>OFA Biz Acct</option>
            <option>OFA Bank (8071)</option>
            <option>Jonny (Investor)</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          ACH / Check #
          <input
            key={`ach-${r.id}-${r.check_deposit_number ?? ''}`}
            className={field}
            defaultValue={r.check_deposit_number ?? ''}
            onBlur={(e) =>
              updateFinancialField(
                r.id,
                'check_deposit_number',
                e.target.value || null,
              )
            }
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-cream">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.was_it_paid}
            onChange={(e) =>
              updateFinancialField(r.id, 'was_it_paid', e.target.checked)
            }
          />
          Client paid
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.investor_paid}
            onChange={(e) =>
              updateFinancialField(r.id, 'investor_paid', e.target.checked)
            }
          />
          Investor paid
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={r.referral_paid_out}
            onChange={(e) =>
              updateFinancialField(r.id, 'referral_paid_out', e.target.checked)
            }
          />
          Referral paid out
        </label>
        <span className="rounded-full border border-gold/40 px-2 py-0.5 text-xs text-gold">
          Inv ({r.funded_by ?? '—'}): {usd(r.jonny_money_owed || r.jonny_invested)}
        </span>
        {r.referral_name && (
          <span className="rounded-full border border-gold/40 px-2 py-0.5 text-xs text-gold">
            Ref ({r.referral_name}): {usd(r.referral_share_amount || 0)}
          </span>
        )}
      </div>
    </div>
  )
}
