/**
 * Soft quote UI — cream client surface; dark hero; class cards + math/CTA.
 */

import { Link } from 'react-router-dom'
import { BRAND_PHONE, BRAND_PHONE_E164, dialBrandOps } from '@/domain/brand'
import {
  destinationFromGoMinutes,
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
  /** Prefer over backTo — returns to the request form with the same draft. */
  onEditTrip?: () => void
  backTo?: string
}) {
  const { pkg } = props

  return (
    <div className="space-y-6 text-ink">
      <div className="sticky top-0 z-40 -mx-4 border-b border-gold/35 bg-[#0C0C0E] px-4 py-3 text-cream shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          {props.hardQuoteDone ? (
            <p className="text-sm font-semibold text-gold">
              Hard quote requested
              {props.hardQuoteEmail ? ` — ${props.hardQuoteEmail}` : ''}.{' '}
              <a
                href={`tel:${BRAND_PHONE_E164}`}
                className="underline hover:text-gold-lt"
              >
                Call {BRAND_PHONE}
              </a>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                // Same gesture: open dialer, then escalate to hard quote email.
                dialBrandOps()
                props.onHardQuote?.()
              }}
              className="w-full rounded-lg bg-[#C9A227] px-4 py-2.5 text-sm font-semibold text-[#0C0C0E] hover:bg-[#E3B341] sm:w-auto"
            >
              Push to hard quote · Call ops
            </button>
          )}
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="text-center text-sm text-cream/85 hover:text-gold sm:text-right"
          >
            Contact a live dispatcher{' '}
            <span className="avionic font-semibold text-gold">{BRAND_PHONE}</span>
            {' '}
            <span className="text-cream/55">24Hr Line</span>
          </a>
        </div>
      </div>

      {/* Dark hero */}
      <header className="overflow-hidden rounded-2xl bg-[#141414] text-cream">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream/10 px-4 py-3 text-xs sm:px-6">
          {props.onEditTrip ? (
            <button
              type="button"
              onClick={props.onEditTrip}
              className="text-cream/70 hover:text-gold"
            >
              ← Edit trip request
            </button>
          ) : (
            <Link
              to={props.backTo ?? '/portal/request'}
              className="text-cream/70 hover:text-gold"
            >
              ← Edit trip request
            </Link>
          )}
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
              to reach you. Live leg uses distance and class average ground
              speed. Destination arrival from Go is repo plus the live leg —
              ranges above are estimates only, not a bookable quote.
            </p>
          </aside>
        </div>
      </header>

      {/* Class cards — 2-col mobile, 3-col desktop */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
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
            onClick={() => {
              dialBrandOps()
              props.onHardQuote?.()
            }}
            className="shrink-0 rounded-xl bg-[#C9A227] px-6 py-3.5 text-sm font-semibold text-[#0C0C0E] hover:bg-[#E3B341]"
          >
            Request this trip NOW · Call ops
          </button>
        )}
      </section>
    </div>
  )
}

function SoftClassCard({ quote }: { quote: SoftClassQuote }) {
  const inquiry = quote.pricing_mode === 'inquiry_only'
  const eta = formatHoursMinutes(destinationFromGoMinutes(quote.timing))
  const examples = quote.example_types.slice(0, 2).join(', ')
  return (
    <article className="flex aspect-[2/1.5] flex-col justify-between rounded-xl border border-border bg-white p-3 sm:aspect-auto sm:min-h-[9.5rem] sm:rounded-2xl sm:p-4 lg:min-h-[10.5rem]">
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink sm:text-base">
            {quote.label}
          </h3>
          <p className="mt-0.5 truncate text-[10px] text-muted sm:text-xs">
            {examples ? `e.g. ${examples}` : null}
          </p>
        </div>
        {inquiry ? (
          <span className="shrink-0 rounded-md bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold sm:px-2 sm:py-1 sm:text-[10px]">
            Call
          </span>
        ) : (
          <FitBadge fit={quote.fit.fit} doorLabel />
        )}
      </div>

      <div className="mt-2 sm:mt-3">
        {inquiry ? (
          <>
            <div className="text-base font-semibold tracking-tight text-ink sm:text-xl">
              Hard quote
            </div>
            <div className="text-[10px] text-muted sm:text-xs">
              Too variable to estimate
            </div>
          </>
        ) : (
          <>
            <div className="avionic text-sm font-semibold tracking-tight text-ink sm:text-lg lg:text-xl">
              ${quote.price_low.toLocaleString('en-US')}–$
              {quote.price_high.toLocaleString('en-US')}
            </div>
            <div className="text-[10px] text-muted sm:text-xs">
              est. all-in · ~{eta} to dest
            </div>
          </>
        )}
      </div>
    </article>
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
