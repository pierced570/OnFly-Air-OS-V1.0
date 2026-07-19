import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Candidate } from '@/domain/routing'
import { TEST_TAX_RATES_2026 } from '@/domain/tax'
import { buildQuoteTotals, type MarkupMode } from '@/domain/quote'
import { formatStopLocal } from '@/domain/timeFmt'
import { createEmailAdapter } from '@/adapters/email'
import { createTripFromCandidates } from '@/lib/tripStore'
import { useNavigate } from 'react-router-dom'

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

  const [selectedId, setSelectedId] = useState(draft?.candidates.find((c) => c.label === 'best')?.aircraft_id)
  const [markupMode, setMarkupMode] = useState<MarkupMode>('percent')
  const [markupValue, setMarkupValue] = useState(0)
  const [sent, setSent] = useState<string | null>(null)

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
  const mtow = selected.type_name?.match(/310/) ? 5500 : 12500
  const totals = buildQuoteTotals(selected, {
    markupMode,
    markupValue: markupValue === 0 ? 0 : markupValue,
    payloadKind: draft.payloadKind,
    mtowLbs: mtow,
    paxCount: draft.paxCount || 0,
    segments: 1,
    rates: TEST_TAX_RATES_2026,
  })
  // If markup is 0, use engine price (already at 15% margin)
  const airSubtotal = markupValue === 0 ? selected.price : totals.airSubtotal
  const tax = buildQuoteTotals(selected, {
    markupMode: 'dollars',
    markupValue: airSubtotal - selected.cost,
    payloadKind: draft.payloadKind,
    mtowLbs: mtow,
    paxCount: draft.paxCount || 0,
    segments: 1,
    rates: TEST_TAX_RATES_2026,
  })

  async function sendEstimate() {
    const email = createEmailAdapter()
    const acceptToken = crypto.randomUUID()
    const r = await email.send({
      to: 'client@example.com',
      subject: `OnFly estimated quote — ${draft!.originText} → ${draft!.destText}`,
      text: `Estimated total $${tax.total.toFixed(2)}. Carrier: a vetted Part 135 carrier. Accept: /accept/${acceptToken}`,
      html: renderQuoteHtml({
        draft: draft!,
        selected,
        airSubtotal,
        taxTotal: tax.total,
        taxLines: tax.tax.lines,
      }),
    })
    setSent(r.id)
    const trip = createTripFromCandidates({
      lane: `${draft!.originText} → ${draft!.destText}`,
      payload_summary: draft!.payloadKind,
      ready_label: draft!.ready_at,
      candidates: draft!.candidates,
      payload_kind: draft!.payloadKind,
      client_id: draft!.client_id ?? undefined,
    })
    sessionStorage.setItem('onfly_last_trip_id', trip.id)
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
          <button
            type="button"
            onClick={() => void sendEstimate()}
            className="w-full rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt"
          >
            Approve & send estimated quote
          </button>
          {sent && (
            <p className="text-sm text-onplan">
              Mock email sent ({sent}).{' '}
              <button
                type="button"
                className="text-gold underline"
                onClick={() => {
                  const id = sessionStorage.getItem('onfly_last_trip_id')
                  if (id) nav(`/trips/${id}/offers`)
                }}
              >
                Open offers / phone simulator →
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

function renderQuoteHtml(args: {
  draft: Draft
  selected: Candidate
  airSubtotal: number
  taxTotal: number
  taxLines: Array<{ code: string; amount: number; note: string }>
}) {
  return `<h1>OnFly estimated quote</h1>
<p>${args.draft.originText} → ${args.draft.destText}</p>
<p>Carrier: a vetted Part 135 carrier</p>
<p>Total: $${args.taxTotal.toFixed(2)}</p>`
}
