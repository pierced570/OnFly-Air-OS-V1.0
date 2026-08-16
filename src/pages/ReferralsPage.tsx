/**
 * Referrals — partner directory + monthly gross-margin payout tabs.
 * Entire calendar months remit together; statement math is copyable for the partner.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { NumericDraftInput } from '@/components/NumericDraftInput'
import {
  buildReferralMonthStatement,
  buildReferralMonthTabs,
  referralPayoutReady,
  shareTermsLabel,
  summarizeReferralPayouts,
} from '@/domain/referrals'
import {
  listFinancials,
  markReferralMonthPaidOut,
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
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  const monthTabs = useMemo(
    () => (selected ? buildReferralMonthTabs(financials, selected.name) : []),
    [financials, selected],
  )

  const activeMonthKey =
    selectedMonth && monthTabs.some((t) => t.month_key === selectedMonth)
      ? selectedMonth
      : monthTabs.find((t) => t.has_unpaid)?.month_key ??
        monthTabs[0]?.month_key ??
        null

  const statement = useMemo(() => {
    if (!selected || !activeMonthKey) return null
    return buildReferralMonthStatement({
      person: selected,
      monthKey: activeMonthKey,
      rows: financials,
    })
  }, [selected, activeMonthKey, financials])

  const readiness = selected ? referralPayoutReady(selected) : null

  return (
    <div className="flex min-h-full flex-col gap-6 p-4 sm:p-8 lg:flex-row">
      <aside className="w-full shrink-0 space-y-3 lg:w-80">
        <header>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">
            Profit share
          </div>
          <h1 className="mt-1 text-xl font-semibold text-cream">Referrals</h1>
          <p className="mt-1 text-xs text-muted">
            Name, negotiated % of gross margin, W-9 + banking. Monthly tabs roll up
            from Financials — pay entire months (Aug 1–31 → remitted in September).
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
              const p = addReferral({
                name: newName.trim(),
                share_mode: 'percent_margin',
                share_value: 10,
              })
              setNewName('')
              setSelectedId(p.id)
              setSelectedMonth(null)
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
            const ready = referralPayoutReady(p).ready
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(p.id)
                    setSelectedMonth(null)
                    setCopied(false)
                  }}
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
                    {!ready && (
                      <span className="ml-2 text-[10px] text-late">needs info</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {shareTermsLabel(p.share_mode, p.share_value)}
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
          <div className="text-xs uppercase tracking-wider text-muted">
            Running tabs
          </div>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
            {payouts.length === 0 && (
              <li className="text-muted">No referral trips on the ledger yet.</li>
            )}
            {payouts.map((p) => (
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
              readiness={readiness}
            />

            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs uppercase tracking-wider text-muted">
                  Monthly payout tabs
                </h3>
                <p className="text-[11px] text-muted">
                  Pay whole months only — flight dates Aug 1–31 = August tab
                </p>
              </div>

              {monthTabs.length === 0 ? (
                <p className="text-sm text-muted">
                  No financial rows yet. Attach this name on Quick Dispatch or Edit on{' '}
                  <Link className="text-gold" to="/financials">
                    Financials
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {monthTabs.map((t) => (
                    <button
                      key={t.month_key}
                      type="button"
                      onClick={() => {
                        setSelectedMonth(t.month_key)
                        setCopied(false)
                      }}
                      className={[
                        'rounded-md border px-3 py-2 text-left text-xs',
                        activeMonthKey === t.month_key
                          ? 'border-gold bg-gold/10 text-cream'
                          : 'border-border bg-surface text-muted hover:text-cream',
                      ].join(' ')}
                    >
                      <div className="font-medium text-cream">{t.label}</div>
                      <div className="mt-0.5 avionic">
                        {t.has_unpaid ? (
                          <span className="text-gold">
                            Due {usd(t.unpaid_share)}
                          </span>
                        ) : (
                          <span className="text-onplan">Paid {usd(t.share_total)}</span>
                        )}
                        <span className="text-muted">
                          {' '}
                          · {t.trip_count} trip{t.trip_count === 1 ? '' : 's'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {statement ? (
                <div className="space-y-3 rounded-lg border border-gold/30 bg-gold/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-gold">
                        Statement · {statement.label}
                      </div>
                      <p className="mt-1 text-sm text-cream">
                        {statement.share_label} · gross margin{' '}
                        <span className="avionic">{usd(statement.gross_margin_total)}</span>
                        {' → '}
                        share{' '}
                        <span className="avionic text-gold">
                          {usd(statement.share_total)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Amount due{' '}
                        <span className="avionic text-gold">
                          {usd(statement.unpaid_share)}
                        </span>
                        {statement.partner_email
                          ? ` · send to ${statement.partner_email}`
                          : ' · add partner email to remit'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-border px-3 py-2 text-xs text-cream hover:border-gold/40"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(statement.body_text)
                            .then(() => {
                              setCopied(true)
                              window.setTimeout(() => setCopied(false), 2000)
                            })
                        }}
                      >
                        {copied ? 'Copied' : 'Copy statement'}
                      </button>
                      {statement.unpaid_share > 0 ? (
                        <button
                          type="button"
                          className="rounded-md bg-gold px-3 py-2 text-xs font-semibold text-ink disabled:opacity-40"
                          disabled={!readiness?.ready}
                          title={
                            readiness?.ready
                              ? `Mark all ${statement.label} trips paid`
                              : `Missing: ${readiness?.missing.join(', ')}`
                          }
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Mark entire ${statement.label} paid out for ${selected.name}? (${usd(statement.unpaid_share)})`,
                              )
                            ) {
                              return
                            }
                            markReferralMonthPaidOut({
                              referralName: selected.name,
                              monthKey: statement.month_key,
                              paid: true,
                            })
                          }}
                        >
                          Mark {statement.label.split(' ')[0]} paid
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md border border-border px-3 py-2 text-xs text-muted"
                          onClick={() => {
                            markReferralMonthPaidOut({
                              referralName: selected.name,
                              monthKey: statement.month_key,
                              paid: false,
                            })
                          }}
                        >
                          Undo month paid
                        </button>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-2">
                    {statement.lines.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-md border border-border/60 bg-ink/40 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="avionic text-xs text-muted">
                              {r.date_of_flight ?? '—'} ·{' '}
                              {r.operator_po ?? r.id.slice(0, 8)}
                            </div>
                            <div className="text-cream">
                              {r.client_name ?? '—'} · {r.route_text ?? '—'}
                            </div>
                            <div className="mt-1 text-[11px] text-muted">
                              Client {usd(r.client_invoiced_amount)} − Vendor{' '}
                              {usd(r.vendor_amount)} = Margin{' '}
                              <span className="avionic text-cream">
                                {usd(r.margin)}
                              </span>
                              {selected.share_mode === 'percent_margin' ? (
                                <>
                                  {' '}
                                  × {selected.share_value}% ={' '}
                                  <span className="avionic text-gold">
                                    {usd(r.referral_share_amount)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  {' → share '}
                                  <span className="avionic text-gold">
                                    {usd(r.referral_share_amount)}
                                  </span>
                                </>
                              )}
                            </div>
                            <Link
                              to="/financials"
                              className="mt-1 inline-block text-[11px] text-gold"
                            >
                              View on Financials →
                            </Link>
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
                            Paid
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-ink/60 p-3 font-mono text-[11px] text-cream/85">
                    {statement.body_text}
                  </pre>
                </div>
              ) : null}
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
  readiness,
}: {
  id: string
  unpaid: number
  total: number
  trips: number
  readiness: ReturnType<typeof referralPayoutReady> | null
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
        {readiness && !readiness.ready ? (
          <p className="mt-1 text-xs text-late">
            Before monthly payout: add {readiness.missing.join(', ')}
          </p>
        ) : (
          <p className="mt-1 text-xs text-onplan">Payout profile ready</p>
        )}
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
            type="email"
            value={person.email}
            onChange={(e) => updateReferral(id, { email: e.target.value })}
            placeholder="partner@email.com"
          />
        </label>
        <label className={label}>
          Negotiated payout
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
              <option value="percent_margin">% of gross margin</option>
              <option value="flat">Flat $ / trip</option>
            </select>
            <NumericDraftInput
              className={`${input} avionic`}
              value={person.share_value}
              onValueChange={(n) => {
                if (n == null) return
                updateReferral(id, { share_value: n })
              }}
            />
          </div>
          <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-muted">
            Admin-set terms. New trips use this; Financials keeps the $ share per trip.
          </span>
        </label>
        <label className={label}>
          Cell
          <input
            className={`${input} avionic`}
            value={person.cell}
            onChange={(e) => updateReferral(id, { cell: e.target.value })}
          />
        </label>

        <div className="rounded-md border border-border/60 bg-ink/30 p-3 sm:col-span-2">
          <div className="text-xs uppercase tracking-wider text-muted">W-9</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-cream">
              <input
                type="checkbox"
                checked={person.w9_on_file}
                onChange={(e) =>
                  updateReferral(id, { w9_on_file: e.target.checked })
                }
              />
              W-9 on file
            </label>
            <label className={label}>
              Filename / note
              <input
                className={input}
                value={person.w9_filename}
                onChange={(e) =>
                  updateReferral(id, { w9_filename: e.target.value })
                }
                placeholder="Alex_W9_2026.pdf"
              />
            </label>
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-ink/30 p-3 sm:col-span-2">
          <div className="text-xs uppercase tracking-wider text-muted">
            Banking (ACH)
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Bank name
              <input
                className={input}
                value={person.banking.bank_name}
                onChange={(e) =>
                  updateReferral(id, {
                    banking: { ...person.banking, bank_name: e.target.value },
                  })
                }
              />
            </label>
            <label className={label}>
              Account type
              <select
                className={input}
                value={person.banking.account_type}
                onChange={(e) =>
                  updateReferral(id, {
                    banking: {
                      ...person.banking,
                      account_type: e.target.value as '' | 'checking' | 'savings',
                    },
                  })
                }
              >
                <option value="">—</option>
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
              </select>
            </label>
            <label className={label}>
              Routing number
              <input
                className={`${input} avionic`}
                value={person.banking.routing_number}
                onChange={(e) =>
                  updateReferral(id, {
                    banking: {
                      ...person.banking,
                      routing_number: e.target.value,
                    },
                  })
                }
                autoComplete="off"
              />
            </label>
            <label className={label}>
              Account number
              <input
                className={`${input} avionic`}
                value={person.banking.account_number}
                onChange={(e) =>
                  updateReferral(id, {
                    banking: {
                      ...person.banking,
                      account_number: e.target.value,
                    },
                  })
                }
                autoComplete="off"
              />
            </label>
          </div>
        </div>

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
