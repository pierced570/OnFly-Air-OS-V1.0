/**
 * Informational soft-pricing package — framework UI for portal
 * "what can this possibly cost?" results. Screenshot polish comes next.
 */

import {
  formatHoursMinutes,
  type SoftClassQuote,
  type SoftPricingPackage,
} from '@/domain/softPricing'

export function SoftPricingPackageView(props: {
  pkg: SoftPricingPackage
  requestRef?: number
  lane?: string
}) {
  const { pkg } = props
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">
          What this can possibly cost
        </h1>
        <p className="mt-1 text-sm text-muted">
          {props.requestRef != null ? (
            <>
              Ref{' '}
              <span className="avionic text-ink">R-{props.requestRef}</span>
              {props.lane ? ` · ${props.lane}` : ''}
              {' · '}
            </>
          ) : null}
          {pkg.origin_icao}→{pkg.dest_icao} · {pkg.live_nm} NM live leg
        </p>
      </header>

      <aside className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
        <p className="font-semibold text-gold">Important</p>
        <p className="mt-1 leading-relaxed">{pkg.disclaimer}</p>
      </aside>

      {pkg.claude_guidelines ? (
        <section className="rounded-xl border border-border bg-[#F7F2E3]/60 px-4 py-4">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            Guidelines
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            {pkg.claude_guidelines}
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          How we build this soft quote
        </h2>
        <p className="text-sm leading-relaxed text-ink">
          {pkg.pricing_logic_overview}
        </p>
        <p className="text-sm text-ink">{pkg.fit_summary}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-muted">
          Class options
        </h2>
        {pkg.classes.map((c) => (
          <SoftClassCard key={c.class_id} quote={c} />
        ))}
      </section>

      <aside className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted">
        <p className="font-medium text-ink">Still not a hard quote</p>
        <p className="mt-1 leading-relaxed">{pkg.disclaimer}</p>
      </aside>
    </div>
  )
}

function SoftClassCard({ quote }: { quote: SoftClassQuote }) {
  const t = quote.timing
  return (
    <article
      className={[
        'rounded-xl border px-4 py-4 sm:px-5',
        quote.recommended && quote.fit.fit === 'fits'
          ? 'border-gold bg-gold/5'
          : 'border-border bg-[#F7F2E3]/40',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-gold">
            {quote.fit.fit === 'fits'
              ? 'Fits cargo · '
              : quote.fit.fit === 'no_fit'
                ? 'Door tight · '
                : 'Verify fit · '}
            {quote.label}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-ink">{quote.label}</h3>
          <p className="mt-1 text-sm text-muted">{quote.gs_blurb}</p>
        </div>
        <div className="text-right">
          <div className="avionic text-2xl font-semibold text-ink">
            ${Math.round(quote.air_estimate).toLocaleString('en-US')}
          </div>
          <div className="text-xs text-muted">est. air (before tax)</div>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">
            Repo (assumed)
          </dt>
          <dd className="avionic mt-0.5 text-ink">
            {formatHoursMinutes(t.repo_min)}
          </dd>
          <dd className="text-[11px] text-muted">2.5 hr to position</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">
            Live leg
          </dt>
          <dd className="avionic mt-0.5 text-ink">
            {formatHoursMinutes(t.live_min)}
          </dd>
          <dd className="text-[11px] text-muted">
            {t.live_nm} NM ÷ {t.avg_gs_kts} kt
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">
            Home
          </dt>
          <dd className="avionic mt-0.5 text-ink">
            {formatHoursMinutes(t.home_min)}
          </dd>
          <dd className="text-[11px] text-muted">
            same {t.home_nm} NM + 1 hr
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2 text-sm">
        <p className="text-ink">{quote.fit.explanation}</p>
        <p className="text-muted">{quote.fit.payload_note}</p>
        {quote.fit.door_examples.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted">
            {quote.fit.door_examples.map((d) => (
              <li key={`${d.type_name}-${d.door_w_in}x${d.door_h_in}`}>
                <span className="avionic text-ink">{d.type_name}</span>
                {' · door '}
                <span className="avionic">
                  {d.door_w_in}×{d.door_h_in} in
                </span>
                {' · '}
                {d.fit === 'fits'
                  ? 'clears piece'
                  : d.fit === 'no_fit'
                    ? 'too small'
                    : 'verify'}
              </li>
            ))}
          </ul>
        ) : null}
        {quote.history.some((h) => h.avg_rate_per_nm != null) ? (
          <p className="text-xs text-muted">
            Prior trip rates:{' '}
            {quote.history
              .filter((h) => h.avg_rate_per_nm != null)
              .map(
                (h) =>
                  `${h.type_name} ~$${h.avg_rate_per_nm!.toFixed(1)}/NM${
                    h.trips_logged ? ` (${h.trips_logged} trips)` : ''
                  }`,
              )
              .join(' · ')}
          </p>
        ) : null}
        <details className="text-xs text-muted">
          <summary className="cursor-pointer text-gold">Pricing logic</summary>
          <p className="mt-2 leading-relaxed">{quote.pricing_logic}</p>
        </details>
      </div>
    </article>
  )
}
