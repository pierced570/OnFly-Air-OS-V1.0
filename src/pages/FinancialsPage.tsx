import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  listFinancials,
  subscribeFinancials,
  updateFinancialField,
} from '@/lib/financialsStore'
import {
  dueDateFor,
  summarize,
  type ComputedFinancial,
} from '@/domain/financials'

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

type Drawer = 'op' | 'client' | null

export default function FinancialsPage() {
  const rows = useSyncExternalStore(subscribeFinancials, listFinancials, () => [])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'unpaid' | 'due_soon'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [openDrawer, setOpenDrawer] = useState<Record<string, Drawer>>({})
  const [openAll, setOpenAll] = useState<Drawer>(null)

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

  return (
    <div className="flex flex-col gap-5 p-4 pb-28 sm:p-6">
      <header>
        <div className="text-xs uppercase tracking-[0.2em] text-gold">Money</div>
        <h1 className="mt-1 text-2xl font-semibold text-cream">Financials</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} records from OFA export · tax column ready (historical rows
          blank until FET split)
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total revenue" value={usd(stats.revenue, 0)} tone="onplan" />
        <Kpi label="Operator cost" value={usd(stats.cost, 0)} />
        <Kpi label="Net margin" value={usd(stats.margin, 0)} tone="gold" />
        <Kpi label="Unpaid" value={String(stats.unpaid)} tone="late" />
        <Kpi label="Records" value={String(stats.trips)} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search PO#, client, operator, route…"
          className="min-w-[16rem] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream"
        />
        <label className="text-xs text-muted">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-cream"
          />
        </label>
        <label className="text-xs text-muted">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-cream"
          />
        </label>
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
          {(
            [
              ['all', 'All'],
              ['unpaid', 'Unpaid'],
              ['due_soon', 'Due Next 7d'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatus(id)}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-medium',
                status === id ? 'bg-gold text-ink' : 'text-muted',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted">
          <span className="uppercase tracking-wider">Open all:</span>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 hover:text-cream"
            onClick={() => setOpenAll('op')}
          >
            Open Vendor
          </button>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 hover:text-cream"
            onClick={() => setOpenAll('client')}
          >
            Open Client
          </button>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 hover:text-cream"
            onClick={() => {
              setOpenAll(null)
              setOpenDrawer({})
            }}
          >
            Collapse all
          </button>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted">{selected.size} selected</span>
            <button
              type="button"
              className="text-gold"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={markSelectedPaid}
              className="rounded-md bg-gold px-3 py-1.5 font-medium text-ink"
            >
              Mark as paid
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
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
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Drawers</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const d = drawerFor(r.id)
              const clientOk = r.was_it_paid
              const opOk = r.vendor_paid && r.bill_logged_in_qb
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
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedRows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-ink/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted">{selectedRows.length} row(s)</span>
            <div className="flex flex-wrap gap-4 avionic text-xs sm:text-sm">
              <span>
                Client charged{' '}
                <span className="text-cream">{usd(selectedSum.revenue)}</span>
              </span>
              <span>
                Op owed <span className="text-cream">{usd(selectedSum.cost)}</span>
              </span>
              <span>
                Margin <span className="text-onplan">{usd(selectedSum.margin)}</span>
              </span>
              <span>
                Investor owed{' '}
                <span className="text-gold">
                  {usd(
                    selectedRows.reduce((s, r) => s + r.jonny_money_owed, 0),
                  )}
                </span>
              </span>
              <span>
                Profit <span className="text-onplan">{usd(selectedSum.ofa)}</span>
              </span>
            </div>
            <span className="text-xs text-muted">{filtered.length} visible</span>
          </div>
        </div>
      )}
    </div>
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
}: {
  r: ComputedFinancial
  selected: boolean
  onToggle: () => void
  drawer: Drawer
  onDrawer: (d: Drawer) => void
  clientOk: boolean
  opOk: boolean
  invOk: boolean
}) {
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
        <td className="px-2 py-2">
          <div className="flex flex-wrap gap-1">
            <StatusPill label="Client" ok={clientOk} tone="onplan" />
            <StatusPill label="Op" ok={opOk} tone="gold" />
            <StatusPill label="Inv" ok={invOk} tone="attn" />
          </div>
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <button
            type="button"
            className="mr-2 text-xs text-gold hover:underline"
            onClick={() => onDrawer('op')}
          >
            {drawer === 'op' ? '▾' : '▸'} Op Pmts
          </button>
          <button
            type="button"
            className="text-xs text-gold hover:underline"
            onClick={() => onDrawer('client')}
          >
            {drawer === 'client' ? '▾' : '▸'} Client Pmts
          </button>
        </td>
      </tr>
      {drawer && (
        <tr className="border-t border-border/40 bg-ink/60">
          <td colSpan={15} className="px-3 py-3">
            {drawer === 'op' ? <OpDrawer r={r} /> : <ClientDrawer r={r} />}
          </td>
        </tr>
      )}
    </>
  )
}

const field =
  'mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-cream'

function OpDrawer({ r }: { r: ComputedFinancial }) {
  return (
    <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold">
        Op Pmts
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted">
          Operator
          <input
            className={field}
            defaultValue={r.vendor_name ?? ''}
            onBlur={(e) => updateFinancialField(r.id, 'vendor_name', e.target.value)}
          />
        </label>
        <label className="text-xs text-muted">
          Owed ($)
          <input
            type="number"
            className={field}
            defaultValue={r.vendor_amount}
            onBlur={(e) =>
              updateFinancialField(r.id, 'vendor_amount', Number(e.target.value) || 0)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Funded
          <select
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
        <div className="flex flex-col justify-end gap-2 text-sm text-cream">
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
              checked={r.bill_logged_in_qb}
              onChange={(e) =>
                updateFinancialField(r.id, 'bill_logged_in_qb', e.target.checked)
              }
            />
            Logged in QB
          </label>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Vendor bill upload → private storage (next pass). Inv owed now:{' '}
        <span className="avionic text-gold">{usd(r.jonny_money_owed)}</span>
      </p>
    </div>
  )
}

function ClientDrawer({ r }: { r: ComputedFinancial }) {
  return (
    <div className="rounded-lg border border-onplan/30 bg-onplan/5 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-onplan">
        Client Pmts
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted">
          Charged ($)
          <input
            type="number"
            className={field}
            defaultValue={r.client_invoiced_amount}
            onBlur={(e) =>
              updateFinancialField(
                r.id,
                'client_invoiced_amount',
                Number(e.target.value) || 0,
              )
            }
          />
        </label>
        <label className="text-xs text-muted">
          Tax total ($)
          <input
            type="number"
            className={field}
            defaultValue={r.tax_total}
            onBlur={(e) =>
              updateFinancialField(r.id, 'tax_total', Number(e.target.value) || 0)
            }
          />
        </label>
        <label className="text-xs text-muted">
          Deposited
          <select
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
        <span className="rounded-full border border-gold/40 px-2 py-0.5 text-xs text-gold">
          Inv ({r.funded_by ?? '—'}): {usd(r.jonny_money_owed || r.jonny_invested)}
        </span>
      </div>
    </div>
  )
}
