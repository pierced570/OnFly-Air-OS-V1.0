/**
 * Soft quote UI — matches portal soft-pricing mockups.
 * Cream client surface; dark hero; 3-col class cards; door table; Claude; history.
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createLlmAdapter } from '@/adapters/llm'
import {
  formatHoursMinutes,
  type SoftClassQuote,
  type SoftPricingPackage,
} from '@/domain/softPricing'

const FIT_GREEN = '#2E7D32'
const FIT_RED = '#C0392B'

export function SoftPricingPackageView(props: {
  pkg: SoftPricingPackage
  requestRef?: number
  lane?: string
  onHardQuote?: () => void
  hardQuoteDone?: boolean
  hardQuoteEmail?: string
  backTo?: string
}) {
  const { pkg } = props
  const [ask, setAsk] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askAnswer, setAskAnswer] = useState<string | null>(null)
  const [guide, setGuide] = useState(pkg.claude_guidelines)

  async function onAsk(prompt?: string) {
    const q = (prompt ?? ask).trim()
    if (!q) return
    setAskBusy(true)
    setAskAnswer(null)
    try {
      const llm = createLlmAdapter()
      const context = [
        `Soft quote ${pkg.origin_display}→${pkg.dest_display} ${pkg.live_nm} NM.`,
        pkg.fit_summary,
        ...pkg.classes.map(
          (c) =>
            `${c.label}: $${c.price_low}–$${c.price_high} fit=${c.fit.fit} ${c.fit.explanation}`,
        ),
        `Client question: ${q}`,
      ].join('\n')
      const text = await llm.explainSoftPricing(context)
      setAskAnswer(text)
      if (!guide) setGuide(text)
    } catch (e) {
      setAskAnswer(e instanceof Error ? e.message : String(e))
    } finally {
      setAskBusy(false)
    }
  }

  function onAskSubmit(e: FormEvent) {
    e.preventDefault()
    void onAsk()
  }

  return (
    <div className="space-y-6 text-ink">
      {/* Dark hero */}
      <header className="overflow-hidden rounded-2xl bg-[#141414] text-cream">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream/10 px-4 py-3 text-xs sm:px-6">
          <Link
            to={props.backTo ?? '/portal/request'}
            className="text-cream/70 hover:text-gold"
          >
            ← Back to trip request
          </Link>
          <span className="text-cream/50">Soft pricing · not a bookable quote</span>
        </div>
        <div className="grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              What could this possibly cost?
            </p>
            <h1 className="mt-2 font-semibold tracking-tight text-cream">
              <span className="avionic text-3xl sm:text-4xl">
                {pkg.origin_display} → {pkg.dest_display}
              </span>
              <span className="avionic ml-2 text-xl text-cream/70 sm:text-2xl">
                · {pkg.live_nm} NM
              </span>
            </h1>
            {props.requestRef != null && (
              <p className="mt-1 text-xs text-cream/45">
                Ref <span className="avionic">R-{props.requestRef}</span>
                {props.lane ? ` · ${props.lane}` : ''}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {pkg.cargo_badges.map((b) => (
                <span
                  key={b}
                  className="avionic rounded-full border border-cream/15 bg-[#0C0C0E] px-3 py-1.5 text-[10px] tracking-wide text-cream/85"
                >
                  {b}
                </span>
              ))}
              {pkg.ready_asap ? (
                <span className="avionic rounded-full border border-gold/50 px-3 py-1.5 text-[10px] tracking-wide text-gold">
                  READY ASAP
                </span>
              ) : null}
            </div>
          </div>
          <aside className="rounded-xl border border-cream/15 bg-[#0C0C0E]/80 px-4 py-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              How we estimate
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-cream/85">
              We assume a{' '}
              <span className="font-semibold text-cream">
                2.5 hr repositioning leg
              </span>{' '}
              to reach you. Live leg = distance ÷ average ground speed. Return
              home ≈ live leg + 1 hr. Billable time × class hourly rate.
            </p>
          </aside>
        </div>
      </header>

      {/* Class cards — 3 columns */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pkg.classes.map((c) => (
          <SoftClassCard key={c.class_id} quote={c} />
        ))}
      </section>

      {/* Disclaimer banner */}
      <aside className="rounded-xl border border-gold/35 bg-[#F5E6A8]/55 px-4 py-4 text-sm leading-relaxed text-ink sm:px-5">
        <p>
          <span className="font-semibold">This is not the actual price.</span>{' '}
          It’s an estimate based on what we believe will fit and what historical
          data shows. Every mission is unique — aircraft are constantly changing
          distances from your pickup point, so the real repositioning leg (and
          price) moves with the fleet.
        </p>
      </aside>

      {/* Door table + Claude */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white px-4 py-5 sm:px-5">
          <h2 className="text-base font-semibold">
            Will it fit? Door sizes vs your cargo
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your largest piece is {pkg.classes[0]?.fit.largest_piece_label ?? '—'}.
          </p>
          <p className="mt-2 text-xs text-muted">
            A piece fits when its two smallest sides clear the door with ~2 in
            to spare — length rides through the opening.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
                  <th className="py-2 pr-2 font-medium">Aircraft</th>
                  <th className="py-2 pr-2 font-medium">Door</th>
                  <th className="py-2 pr-2 font-medium">Payload</th>
                  <th className="py-2 font-medium">Fit</th>
                </tr>
              </thead>
              <tbody>
                {pkg.door_rows.map((r) => (
                  <tr
                    key={`${r.type_name}-${r.door_w_in}`}
                    className="border-b border-border/70"
                  >
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-ink">{r.type_name}</div>
                      <div className="text-[11px] text-muted">
                        {r.class_label}
                      </div>
                    </td>
                    <td className="avionic py-2.5 pr-2 text-ink">
                      {r.door_w_in}×{r.door_h_in} in
                    </td>
                    <td className="avionic py-2.5 pr-2 text-ink">
                      {r.payload_lbs.toLocaleString('en-US')} lb
                    </td>
                    <td className="py-2.5">
                      <FitBadge fit={r.fit} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Door data comes from our operator network page. Freighter
            conversions may have larger doors. Pieces over 200 lb typically need
            a forklift.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-white px-4 py-5 sm:px-5">
          <h2 className="text-base font-semibold">
            Pricing guide · powered by Claude
          </h2>
          <div className="mt-3 rounded-xl border border-border bg-[#F7F2E3]/70 px-3 py-3 text-sm leading-relaxed text-ink">
            {guide ||
              'Ask a question below for class fit and pricing guidelines.'}
          </div>
          {askAnswer && askAnswer !== guide ? (
            <div className="mt-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-3 text-sm leading-relaxed">
              {askAnswer}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {pkg.ask_chips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={askBusy}
                className="rounded-full border border-border bg-[#F9F7F2] px-3 py-1.5 text-xs text-ink hover:border-gold/40 disabled:opacity-50"
                onClick={() => void onAsk(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <form
            onSubmit={onAskSubmit}
            className="mt-3 flex gap-2"
          >
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Ask about this estimate…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-[#F9F7F2] px-3 py-2.5 text-sm outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={askBusy || !ask.trim()}
              className="rounded-lg bg-[#141414] px-4 py-2.5 text-sm font-semibold text-gold disabled:opacity-50"
            >
              {askBusy ? '…' : 'Ask'}
            </button>
          </form>
        </div>
      </section>

      {/* Similar missions */}
      <section className="rounded-2xl border border-border bg-white px-4 py-5 sm:px-5">
        <h2 className="text-base font-semibold">
          What similar missions actually cost
        </h2>
        <p className="mt-1 text-xs text-muted">Recent OnFly trips</p>
        <ul className="mt-3 divide-y divide-border">
          {pkg.similar_missions.map((m, i) => (
            <li
              key={`${m.origin}-${m.dest}-${i}`}
              className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"
            >
              <div>
                <span className="avionic font-medium text-ink">
                  {m.origin} → {m.dest} · {m.nm} NM
                </span>
                <span className="mt-0.5 block text-muted">
                  {m.type_name} · {m.cargo_blurb} · {m.month_label}
                </span>
              </div>
              <div className="avionic text-base font-semibold text-ink">
                ${m.price.toLocaleString('en-US')}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">
          Historical invoices, all-in. Fuel, ASAP availability and repositioning
          made each one different — yours will differ too.
        </p>
      </section>

      {/* The math */}
      <section>
        <h2 className="mb-3 text-base font-semibold">The math, in the open</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {pkg.math_cards.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-border bg-[#F0E8D4]/70 px-4 py-4"
            >
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink">{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-col gap-4 rounded-2xl bg-[#141414] px-5 py-6 text-cream sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-xl text-sm leading-relaxed text-cream/80">
          Want the real number? Our team checks actual aircraft positions and
          quotes hard in 10–15 minutes. This estimate is not the actual price —
          it reflects assumed positioning and historical averages only.
        </p>
        {props.hardQuoteDone ? (
          <p className="text-sm text-gold">
            Hard quote requested
            {props.hardQuoteEmail ? ` — ${props.hardQuoteEmail}` : ''}.
          </p>
        ) : (
          <button
            type="button"
            onClick={props.onHardQuote}
            className="shrink-0 rounded-xl bg-[#C9A227] px-6 py-3.5 text-sm font-semibold text-[#0C0C0E] hover:bg-[#E3B341]"
          >
            Have OnFly quote this NOW
          </button>
        )}
      </section>
    </div>
  )
}

function SoftClassCard({ quote }: { quote: SoftClassQuote }) {
  const t = quote.timing
  const fits = quote.fit.fit === 'fits'
  const noFit = quote.fit.fit === 'no_fit'
  return (
    <article className="flex flex-col rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-ink">{quote.label}</h3>
          <p className="mt-0.5 text-xs text-muted">
            e.g. {quote.example_types.join(', ')}
          </p>
        </div>
        <FitBadge fit={quote.fit.fit} doorLabel />
      </div>

      <div className="mt-4">
        <div className="avionic text-2xl font-semibold tracking-tight text-ink">
          ${quote.price_low.toLocaleString('en-US')}–$
          {quote.price_high.toLocaleString('en-US')}
        </div>
        <div className="text-xs text-muted">estimated all-in range</div>
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
        <Row
          label="Live leg"
          value={`${formatHoursMinutes(t.live_min)} @ ${t.avg_gs_kts} kt avg`}
        />
        <Row label="Repo leg" value="2h 30m assumed" />
        <Row
          label="Return"
          value={`${formatHoursMinutes(t.home_min)} (live + 1h)`}
        />
        <Row
          label="Billable"
          value={`${formatHoursMinutes(t.total_block_min)} × $${quote.hourly_low.toLocaleString('en-US')}–${quote.hourly_high.toLocaleString('en-US')}/hr`}
        />
        <Row
          label="Door"
          value={`${quote.fit.door_w_in}×${quote.fit.door_h_in} in`}
        />
        <Row
          label="Payload"
          value={`${quote.fit.payload_lbs.toLocaleString('en-US')} lb max`}
        />
      </dl>

      <div
        className={[
          'mt-4 rounded-lg px-3 py-2.5 text-xs leading-relaxed',
          fits
            ? 'bg-[#2E7D32]/10 text-ink'
            : noFit
              ? 'bg-[#C0392B]/10 text-ink'
              : 'bg-[#F7F2E3] text-ink',
        ].join(' ')}
      >
        {quote.fit.explanation}
      </div>
    </article>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="avionic text-right text-ink">{value}</dd>
    </div>
  )
}

function FitBadge({
  fit,
  doorLabel,
}: {
  fit: 'fits' | 'no_fit' | 'unknown'
  doorLabel?: boolean
}) {
  if (fit === 'fits') {
    return (
      <span
        className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
        style={{ background: FIT_GREEN }}
      >
        Fits
      </span>
    )
  }
  if (fit === 'no_fit') {
    return (
      <span
        className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
        style={{ background: FIT_RED }}
      >
        {doorLabel ? 'No fit — door' : 'No fit'}
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
      Verify
    </span>
  )
}
