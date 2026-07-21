/**
 * Referrals directory — people who send work + unpaid profit-share tracker.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { summarizeReferralPayouts } from '@/domain/referrals'
import {
  listFinancials,
  subscribeFinancials,
  updateFinancialField,
} from '@/lib/financialsStore'
import {
  addReferral,
  getReferral,
  listReferrals,
  subscribeReferrals,
  updateReferral,
} from '@/lib/referralStore'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'

function usd(n: number) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export default function ReferralsPage() {
  const people = useSyncExternalStore(subscribeReferrals, listReferrals, listReferrals)
  const financials = useSyncExternalStore(
    subscribeFinancials,
    listFinancials,
    listFinancials,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [filter, setFilter] = useState<'all' | 'unpaid'>('all')

  const payouts = useMemo(
    () => summarizeReferralPayouts(financials, people),
    [financials, people],
  )
  const unpaidTotal = useMemo(
    () => payouts.reduce((s, p) => s + p.unpaid_share, 0),
    [payouts],
  )

  const selected = people.find((p) => p.id === selectedId) ?? people[0] ?? null
  const selectedPayout = selected
    ? payouts.find(
        (p) =>
          p.referral_id === selected.id ||
          p.referral_name.toLowerCase() === selected.name.toLowerCase(),
      )
    : null

  const tripsForSelected = useMemo(() => {
    if (!selected) return []
    const name = selected.name.trim().toLowerCase()
    return financials.filter(
      (r) => (r.referral_name ?? '').trim().toLowerCase() === name,
    )
  }, [financials, selected])

  const visiblePayouts =
    filter === 'unpaid' ? payouts.filter((p) => p.unpaid_share > 0) : payouts

  return (
    <div className="flex min-h-full flex-col gap-6 p-4 sm:p-8 lg:flex-row">
      <aside className="w-full shrink-0 space-y-3 lg:w-80">
        <header>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            Profit share
          </div>
          <h1 className="mt-1 text-xl font-semibold text-cream">Referrals</h1>
          <p className="mt-1 text-xs text-muted">
            People who send us work. Attach them at book — amounts land on Financials
            and roll up here for payout.
          </p>
          <p className="mt-2 avionic text-sm text-gold">
            Unpaid {usd(unpaidTotal)}
          </p>
        </header>

        <div className="flex gap-2">
          <input
            className={`${input} min-w-0 flex-1`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New referral name"
          />
          <button
            type="button"
            className="shrink-0 rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink"
            onClick={() => {
              if (!newName.trim()) return
              const p = addReferral({ name: newName.trim() })
              setNewName('')
              setSelectedId(p.id)
            }}
          >
            Add
          </button>
        </div>

        <ul className="max-h-[50vh] space-y-1 overflow-auto">
          {people.length === 0 && (
            <li className="rounded-md border border-border px-3 py-4 text-center text-xs text-muted">
              No referral partners yet — add someone who sends you trips.
            </li>
          )}
          {people.map((p) => {
            const pay = payouts.find(
              (x) =>
                x.referral_id === p.id ||
                x.referral_name.toLowerCase() === p.name.toLowerCase(),
            )
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={[
                    'w-full rounded-md border px-3 py-2.5 text-left text-sm',
                    selected?.id === p.id
                      ? 'border-gold bg-gold/10 text-cream'
                      : 'border-border bg-surface text-muted hover:text-cream',
                  ].join(' ')}
                >
                  <div className="font-medium text-cream">
                    {p.name}
                    {!p.active && (
                      <span className="ml-2 text-[10px] text-muted">inactive</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {p.share_mode === 'percent_margin'
                      ? `${p.share_value}% of margin`
                      : `${usd(p.share_value)} flat`}
                    {pay
                      ? ` · unpaid ${usd(pay.unpaid_share)}`
                      : ' · no trips yet'}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-wider text-muted">
              Payout rollup
            </div>
            <select
              className="rounded border border-border bg-ink px-2 py-1 text-[11px] text-cream"
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'unpaid')}
            >
              <option value="all">All</option>
              <option value="unpaid">Unpaid only</option>
            </select>
          </div>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
            {visiblePayouts.length === 0 && (
              <li className="text-muted">No referral trips on the ledger yet.</li>
            )}
            {visiblePayouts.map((p) => (
              <li
                key={p.referral_name}
                className="flex justify-between gap-2 border-b border-border/40 py-1.5"
              >
                <span className="text-cream">{p.referral_name}</span>
                <span className="avionic text-gold">{usd(p.unpaid_share)}</span>
              </li>
            ))}
          </ul>
          <Link to="/financials" className="mt-2 inline-block text-xs text-gold">
            Open Financials →
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-6">
        {!selected ? (
          <p className="text-sm text-muted">Select or add a referral partner.</p>
        ) : (
          <>
            <ReferralDetail
              id={selected.id}
              unpaid={selectedPayout?.unpaid_share ?? 0}
              total={selectedPayout?.total_share ?? 0}
              trips={selectedPayout?.trip_count ?? 0}
            />

            <section className="space-y-2">
              <h3 className="text-xs uppercase tracking-wider text-muted">
                Trips · {selected.name}
              </h3>
              {tripsForSelected.length === 0 ? (
                <p className="text-sm text-muted">
                  No financial rows yet. Attach this name on Quick Dispatch or Edit on
                  Financials.
                </p>
              ) : (
                <ul className="space-y-2">
                  {tripsForSelected.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="avionic text-xs text-muted">
                            {r.date_of_flight ?? '—'} · {r.operator_po ?? r.id.slice(0, 8)}
                          </div>
                          <div className="text-cream">
                            {r.client_name ?? '—'} · {r.route_text ?? '—'}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted">
                            Margin {usd(r.margin)} · share{' '}
                            <span className="avionic text-gold">
                              {usd(r.referral_share_amount || 0)}
                            </span>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-cream">
                          <input
                            type="checkbox"
                            checked={r.referral_paid_out}
                            onChange={(e) =>
                              updateFinancialField(
                                r.id,
                                'referral_paid_out',
                                e.target.checked,
                              )
                            }
                          />
                          Paid out
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function ReferralDetail({
  id,
  unpaid,
  total,
  trips,
}: {
  id: string
  unpaid: number
  total: number
  trips: number
}) {
  const people = useSyncExternalStore(subscribeReferrals, listReferrals, listReferrals)
  const person = people.find((p) => p.id === id) ?? getReferral(id)
  if (!person) return null

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-cream">{person.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {trips} trip{trips === 1 ? '' : 's'} · total share {usd(total)} · unpaid{' '}
          <span className="text-gold">{usd(unpaid)}</span>
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Name
          <input
            className={input}
            value={person.name}
            onChange={(e) => updateReferral(id, { name: e.target.value })}
          />
        </label>
        <label className={label}>
          Email
          <input
            className={input}
            value={person.email}
            onChange={(e) => updateReferral(id, { email: e.target.value })}
          />
        </label>
        <label className={label}>
          Cell
          <input
            className={`${input} avionic`}
            value={person.cell}
            onChange={(e) => updateReferral(id, { cell: e.target.value })}
          />
        </label>
        <label className={label}>
          Default share
          <div className="mt-1 flex gap-2">
            <select
              className={input}
              value={person.share_mode}
              onChange={(e) =>
                updateReferral(id, {
                  share_mode: e.target.value as 'flat' | 'percent_margin',
                })
              }
            >
              <option value="flat">Flat $</option>
              <option value="percent_margin">% of margin</option>
            </select>
            <input
              type="number"
              className={`${input} avionic`}
              value={person.share_value}
              onChange={(e) =>
                updateReferral(id, { share_value: Number(e.target.value) || 0 })
              }
            />
          </div>
        </label>
        <label className={`${label} sm:col-span-2`}>
          Notes
          <textarea
            className={input}
            rows={2}
            value={person.notes}
            onChange={(e) => updateReferral(id, { notes: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-cream">
          <input
            type="checkbox"
            checked={person.active}
            onChange={(e) => updateReferral(id, { active: e.target.checked })}
          />
          Active (show in book picker)
        </label>
      </section>
    </div>
  )
}
