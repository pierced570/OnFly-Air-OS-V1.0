/**
 * Client-facing logistics quote layout — shared by /accept and desk preview.
 * Portal-safe: no operator names, margins, or carrier branding.
 */

import type { LogisticsQuoteOptionView } from '@/domain/clientLogisticsQuote'
import { CLIENT_QUOTE_TAXES_NOTE } from '@/domain/clientLogisticsQuote'

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

type OptionActions = {
  busy?: boolean
  onAccept?: () => void
  onDeny?: () => void
  changeRequestHref?: string
}

type Props = {
  title: string
  options: LogisticsQuoteOptionView[]
  /** Show Accept / Deny / Change request controls (live accept page). */
  interactive?: boolean
  optionActions?: (opt: LogisticsQuoteOptionView) => OptionActions | null
  disclosureText?: string | null
  /** Desk banner when previewing before send. */
  previewBanner?: string | null
  className?: string
}

export function ClientLogisticsQuotePreview({
  title,
  options,
  interactive = false,
  optionActions,
  disclosureText,
  previewBanner,
  className,
}: Props) {
  return (
    <div
      className={[
        'space-y-4 rounded-lg border border-border bg-cream px-4 py-5 text-ink',
        className ?? '',
      ].join(' ')}
      data-theme="client"
    >
      {previewBanner ? (
        <div className="rounded-md border border-gold/50 bg-gold/15 px-3 py-2 text-xs font-medium text-ink">
          {previewBanner}
        </div>
      ) : null}

      <header className="space-y-1">
        <h2 className="text-xl font-semibold leading-snug">{title}</h2>
        <p className="text-sm text-muted">
          Operated by a vetted Part 135 carrier
        </p>
      </header>

      <ul className="space-y-4">
        {options.map((opt) => {
          const actions = interactive ? optionActions?.(opt) : null
          return (
            <li
              key={opt.offer_id}
              className="rounded-lg border border-border bg-white px-4 py-4 shadow-sm"
            >
              <div className="text-lg font-semibold">
                {opt.label}: {opt.aircraft_type}
              </div>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-muted">
                    Aircraft ready for pickup at {opt.departure_label}
                  </dt>
                  <dd className="mt-0.5">
                    <div className="avionic text-base font-medium">
                      {opt.position_eta.duration}
                    </div>
                    {opt.position_eta.clock ? (
                      <div className="avionic mt-0.5 text-sm text-muted">
                        ETA {opt.position_eta.clock}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">
                    Leg: {opt.departure_label} → {opt.destination_label}
                  </dt>
                  <dd className="mt-0.5">
                    <div className="avionic text-base font-medium">
                      {opt.arrival_eta.duration}
                    </div>
                    {opt.arrival_eta.clock ? (
                      <div className="avionic mt-0.5 text-sm text-muted">
                        Est. arrival ~ {opt.arrival_eta.clock}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Loading / turn around</dt>
                  <dd className="mt-0.5">
                    <div className="avionic text-base font-medium">
                      {opt.etd.duration}
                    </div>
                    {opt.etd.clock ? (
                      <div className="avionic mt-0.5 text-sm text-muted">
                        ETD {opt.etd.clock}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div className="border-t border-border/70 pt-3">
                  <dt className="text-muted">Price</dt>
                  <dd className="avionic mt-0.5 text-3xl font-semibold text-ink">
                    {money(opt.price)}
                  </dd>
                  <p className="mt-1 text-xs text-muted">
                    {opt.taxes_fees_note || CLIENT_QUOTE_TAXES_NOTE}
                  </p>
                </div>
              </dl>

              {interactive && actions ? (
                <div className="mt-4 flex flex-col gap-2">
                  {actions.onAccept ? (
                    <button
                      type="button"
                      disabled={actions.busy}
                      className="w-full rounded-md bg-gold py-3 text-sm font-semibold text-ink disabled:opacity-50"
                      onClick={actions.onAccept}
                    >
                      {actions.busy ? 'Accepting…' : 'Accept'}
                    </button>
                  ) : null}
                  {actions.onDeny ? (
                    <button
                      type="button"
                      disabled={actions.busy}
                      className="w-full rounded-md border border-border bg-cream py-3 text-sm font-medium text-ink disabled:opacity-50"
                      onClick={actions.onDeny}
                    >
                      Deny
                    </button>
                  ) : null}
                  {actions.changeRequestHref ? (
                    <a
                      className="w-full rounded-md border border-gold/40 bg-gold/10 py-3 text-center text-sm font-medium text-ink"
                      href={actions.changeRequestHref}
                    >
                      Add details / Change request
                    </a>
                  ) : null}
                </div>
              ) : !interactive ? (
                <div className="mt-4 space-y-2 text-xs text-muted">
                  <div className="rounded-md bg-gold/20 py-2.5 text-center font-semibold text-ink">
                    Accept
                  </div>
                  <div className="rounded-md border border-border py-2.5 text-center">
                    Deny
                  </div>
                  <div className="rounded-md border border-gold/40 bg-gold/10 py-2.5 text-center">
                    Add details / Change request
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {disclosureText ? (
        <div className="rounded-md border border-border bg-white p-4 text-sm">
          <div className="font-medium">Part 295.24 disclosure</div>
          <p className="mt-2 text-muted">{disclosureText}</p>
        </div>
      ) : null}
    </div>
  )
}
