import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Candidate } from '@/domain/routing'
import { buildQuoteTotals, type MarkupMode } from '@/domain/quote'
import { formatStopLocal } from '@/domain/timeFmt'
import { getClient } from '@/lib/clientStore'
import { getRequest } from '@/lib/requestStore'
import { getTaxRates } from '@/lib/taxRatesStore'
import {
  resolveQuoteRecipients,
  sendEstimatedQuote,
} from '@/lib/sendEstimatedQuote'

type Draft = {
  pieces: unknown
  originText: string
  destText: string
  ready_at: string
  payloadKind: 'cargo' | 'pax' | 'both'
  hazmat: boolean
  paxCount: number
  mode: string
  candidates: Candidate[]
  originatedMs: number
  client_id?: string | null
  requestId?: string | null
  requestRef?: number | null
  preferredAircraftId?: string
}

export default function QuotePreviewPage() {
  const nav = useNavigate()
  const draft = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('onfly_quote_draft') ?? 'null') as Draft | null
    } catch {
      return null
    }
  }, [])

  const defaultTo = useMemo(() => {
    if (!draft) return ''
    return resolveQuoteRecipients({
      clientId: draft.client_id,
      requestId: draft.requestId,
    }).join(', ')
  }, [draft])

  const [selectedId, setSelectedId] = useState(
    draft?.preferredAircraftId ??
      draft?.candidates.find((c) => c.label === 'best')?.aircraft_id,
  )
  const [markupMode, setMarkupMode] = useState<MarkupMode>('percent')
  const [markupValue, setMarkupValue] = useState(0)
  const [toField, setToField] = useState(defaultTo)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!draft) {
    return (
      <div className="p-8">
        <p className="text-muted">No quote draft — start from intake.</p>
        <Link className="text-gold" to="/trips/new">
          New trip
        </Link>
      </div>
    )
  }

  const selected =
    draft.candidates.find((c) => c.aircraft_id === selectedId) ?? draft.candidates[0]!
  const mtow = selected.mtow_lbs
  const airSubtotal =
    markupValue === 0
      ? selected.price
      : buildQuoteTotals(selected, {
          markupMode,
          markupValue,
          payloadKind: draft.payloadKind,
          mtowLbs: mtow,
          paxCount: draft.paxCount || 0,
          segments: 1,
          rates: getTaxRates(),
        }).airSubtotal
  const tax = buildQuoteTotals(selected, {
    markupMode: 'dollars',
    markupValue: airSubtotal - selected.cost,
    payloadKind: draft.payloadKind,
    mtowLbs: mtow,
    paxCount: draft.paxCount || 0,
    segments: 1,
    rates: getTaxRates(),
  })

  const clientName = draft.client_id
    ? getClient(draft.client_id)?.name
    : draft.requestId
      ? getRequest(draft.requestId)?.client_name
      : null

  async function sendEstimate() {
    setError(null)
    setBusy(true)
    try {
      const to = toField
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.includes('@'))
      const result = await sendEstimatedQuote({
        originLabel: draft!.originText,
        destLabel: draft!.destText,
        readyLabel: draft!.ready_at,
        payloadKind: draft!.payloadKind,
        candidates: draft!.candidates,
        selected,
        airSubtotal,
        total: tax.total,
        taxLines: tax.tax.lines,
        to,
        clientId: draft!.client_id,
        requestId: draft!.requestId,
        requestRef: draft!.requestRef,
        kind: 'estimated',
      })
      sessionStorage.setItem('onfly_last_trip_id', result.trip.id)
      setSent(
        `Sent to ${result.to.join(', ')} · ${result.emailIds.join(', ')}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Quote composer</div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">
            {draft.originText} → {draft.destText}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Routed in {Math.round(draft.originatedMs)}ms · carrier unnamed on client docs
            {clientName ? ` · ${clientName}` : ''}
            {draft.requestRef != null ? ` · R-${draft.requestRef}` : ''}
          </p>
        </div>
        <Link to="/trips/new" className="text-sm text-muted hover:text-cream">
          ← Intake
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {draft.candidates.map((c) => (
          <button
            key={c.aircraft_id}
            type="button"
            onClick={() => setSelectedId(c.aircraft_id)}
            className={[
              'rounded-md border px-3 py-1.5 text-sm',
              c.aircraft_id === selected.aircraft_id
                ? 'border-gold bg-gold/10 text-gold'
                : 'border-border text-muted',
            ].join(' ')}
          >
            {c.label ?? c.tail}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <div className="avionic text-sm text-muted">
            Internal: {selected.operator_name} · {selected.tail} · {selected.type_name}
          </div>
          <div className="flex gap-3">
            <label className="text-xs text-muted">
              Markup
              <select
                value={markupMode}
                onChange={(e) => setMarkupMode(e.target.value as MarkupMode)}
                className="ml-2 rounded border border-border bg-ink px-2 py-1 text-cream"
              >
                <option value="percent">%</option>
                <option value="dollars">$</option>
              </select>
            </label>
            <input
              type="number"
              value={markupValue}
              onChange={(e) => setMarkupValue(Number(e.target.value))}
              className="w-24 rounded border border-border bg-ink px-2 py-1 avionic text-cream"
            />
            <span className="text-xs text-muted self-center">0 = keep 15% target margin price</span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted">
              <span>Air subtotal</span>
              <span className="avionic text-cream">${airSubtotal.toFixed(2)}</span>
            </div>
            {tax.tax.lines.map((l) => (
              <div key={l.code} className="flex justify-between text-muted">
                <span>
                  {l.code} <span className="text-xs">({l.note})</span>
                </span>
                <span className="avionic text-cream">${l.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-cream">
              <span className="font-medium">Total</span>
              <span className="avionic text-lg">${tax.total.toFixed(2)}</span>
            </div>
          </div>

          <label className="block text-xs text-muted">
            Send quote + ETA sheet to
            <input
              className="mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
              value={toField}
              onChange={(e) => setToField(e.target.value)}
              placeholder="client@company.com"
            />
          </label>
          <p className="text-[11px] text-muted">
            Includes estimated timeline (stop-local + Zulu). Carrier stays unnamed.
            Uses Resend when email adapter is live.
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() => void sendEstimate()}
            className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Approve & send estimated quote + ETA sheet'}
          </button>
          {error && <p className="text-sm text-late">{error}</p>}
          {sent && (
            <p className="text-sm text-onplan">
              {sent}.{' '}
              <button
                type="button"
                className="text-gold underline"
                onClick={() => {
                  const id = sessionStorage.getItem('onfly_last_trip_id')
                  if (id) nav(`/trips/${id}/offers`)
                }}
              >
                Open offers →
              </button>
            </p>
          )}
        </section>

        <section
          data-theme="client"
          className="rounded-lg border border-border bg-cream p-6 text-ink print:border-0"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly Air</div>
          <h2 className="mt-2 text-xl font-semibold">Estimated quote</h2>
          <p className="mt-1 text-sm text-muted">
            {draft.originText} → {draft.destText} · via a vetted Part 135 carrier
          </p>
          <p className="mt-4 avionic text-2xl">${tax.total.toFixed(2)}</p>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider">ETA sheet</h3>
          <ol className="mt-2 space-y-2 text-sm">
            {selected.chain.map((leg) => {
              const start = formatStopLocal(leg.est_start, leg.from.tz ?? 'UTC')
              const end = formatStopLocal(leg.est_end, leg.to.tz ?? 'UTC')
              return (
                <li key={leg.seq} className="border-b border-border/40 pb-2">
                  <div className="font-medium">{leg.label}</div>
                  <div className="avionic text-xs text-muted">
                    {start.local} → {end.local} <span>({end.zulu})</span>
                  </div>
                </li>
              )
            })}
          </ol>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-6 rounded-md border border-ink/20 px-3 py-1.5 text-sm print:hidden"
          >
            Print / Save PDF
          </button>
        </section>
      </div>
    </div>
  )
}
