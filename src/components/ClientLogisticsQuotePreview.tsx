/**
 * Client-facing logistics quote layout — shared by /accept and desk preview.
 * Portal-safe: no operator names, margins, or carrier branding.
 * Keep the card about price + times; supporting copy stays fine print.
 */

import { BRAND_EMAIL, BRAND_PHONE } from '@/domain/brand'
import type {
  CharterQuoteMissionChip,
  LogisticsQuoteOptionView,
} from '@/domain/clientLogisticsQuote'
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
  /** Lane headline (city + code). */
  title: string
  options: LogisticsQuoteOptionView[]
  /** Show Accept / Deny / Change request controls (live accept page). */
  interactive?: boolean
  optionActions?: (opt: LogisticsQuoteOptionView) => OptionActions | null
  disclosureText?: string | null
  /** Desk banner when previewing before send. */
  previewBanner?: string | null
  className?: string
  refLabel?: string | null
  missionChips?: CharterQuoteMissionChip[]
  intro?: string | null
  validityNote?: string | null
  dispatcherLine?: string | null
  trackingHintUrl?: string | null
}

export function ClientLogisticsQuotePreview({
  title,
  options,
  interactive = false,
  optionActions,
  disclosureText,
  previewBanner,
  className,
  refLabel,
  missionChips,
  intro,
  validityNote,
  dispatcherLine,
  trackingHintUrl,
}: Props) {
  const introText =
    intro?.trim() ||
    (options.length <= 1
      ? 'All-in price · taxes & fees included. Accept to lock it.'
      : `${options.length} options · all-in prices. Pick one to lock it.`)

  return (
    <div
      className={[
        'overflow-hidden rounded-xl border border-[#E5DFD0] bg-white text-[#0C0C0E] shadow-sm',
        className ?? '',
      ].join(' ')}
      data-theme="client"
    >
      {previewBanner ? (
        <div className="border-b border-[#C9A227]/40 bg-[#C9A227]/15 px-4 py-1.5 text-[11px] font-medium text-[#0C0C0E]">
          {previewBanner}
        </div>
      ) : null}

      <header className="bg-[#0C0C0E] px-5 py-4 text-[#F7F2E3]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-[#C9A227]">
            ONFLY AIR
          </div>
          {refLabel?.trim() ? (
            <div className="rounded-full border border-[#C9A227] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#C9A227]">
              Quote · {refLabel.trim()}
            </div>
          ) : null}
        </div>
        <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight text-[#F7F2E3] sm:text-2xl">
          {title}
        </h2>
        {missionChips?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {missionChips.map((c) => (
              <span
                key={c.label}
                className="rounded-full bg-[#1A1A1C] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#F7F2E3]"
              >
                {c.label}
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-xs leading-snug text-[#F7F2E3]/55">
          {introText}
        </p>
      </header>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <ul className="space-y-3">
          {options.map((opt) => {
            const actions = interactive ? optionActions?.(opt) : null
            const recommended = Boolean(opt.recommended)
            return (
              <li
                key={opt.offer_id}
                className={[
                  'overflow-hidden rounded-xl border-2 bg-white',
                  recommended
                    ? 'border-[#C9A227] bg-[#FFFDF6]'
                    : 'border-[#E5DFD0]',
                ].join(' ')}
              >
                {opt.recommended_badge ? (
                  <div className="bg-[#C9A227] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#0C0C0E]">
                    {opt.recommended_badge}
                  </div>
                ) : null}
                <div className="space-y-2.5 px-3.5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0 text-base font-semibold text-[#0C0C0E]">
                      {opt.option_number_label} · {opt.aircraft_type}
                    </div>
                    <div className="text-right">
                      <div className="avionic text-2xl font-semibold text-[#0C0C0E] sm:text-3xl">
                        {money(opt.price)}
                      </div>
                      <div className="text-[10px] font-medium text-[#2E7D32]">
                        {opt.all_in_note || CLIENT_QUOTE_TAXES_NOTE}
                      </div>
                    </div>
                  </div>

                  {opt.milestones.length ? (
                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                      {opt.milestones.map((m) => {
                        const hi = m.key === 'delivered'
                        return (
                          <div
                            key={m.key}
                            className={[
                              'rounded-md px-2 py-1.5',
                              hi
                                ? 'bg-[#0C0C0E] text-[#C9A227]'
                                : 'bg-[#F3EBDA] text-[#0C0C0E]',
                            ].join(' ')}
                          >
                            <div
                              className={[
                                'text-[8px] font-semibold uppercase tracking-wider',
                                hi ? 'text-[#C9A227]' : 'text-[#6B6560]',
                              ].join(' ')}
                            >
                              {m.label}
                            </div>
                            <div className="avionic mt-0.5 text-sm font-semibold">
                              {m.clock}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-[#6B6560]">
                      {[opt.flight_time_label, opt.door_to_door_label]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {interactive && actions?.onAccept ? (
                      <button
                        type="button"
                        disabled={actions.busy}
                        className={[
                          'rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-50',
                          recommended
                            ? 'bg-[#0C0C0E] text-[#C9A227]'
                            : 'border border-[#C9A227] bg-white text-[#C9A227]',
                        ].join(' ')}
                        onClick={actions.onAccept}
                      >
                        {actions.busy
                          ? 'Accepting…'
                          : `Accept ${opt.option_number_label}`}
                      </button>
                    ) : !interactive ? (
                      <div
                        className={[
                          'rounded-lg px-3.5 py-2 text-sm font-semibold',
                          recommended
                            ? 'bg-[#0C0C0E] text-[#C9A227]'
                            : 'border border-[#C9A227] text-[#C9A227]',
                        ].join(' ')}
                      >
                        Accept {opt.option_number_label}
                      </div>
                    ) : null}
                  </div>

                  {interactive && actions ? (
                    <div className="flex flex-wrap gap-2 border-t border-[#E5DFD0] pt-2">
                      {actions.onDeny ? (
                        <button
                          type="button"
                          disabled={actions.busy}
                          className="rounded-md border border-[#E5DFD0] px-2.5 py-1.5 text-[11px] font-medium text-[#0C0C0E] disabled:opacity-50"
                          onClick={actions.onDeny}
                        >
                          Deny all options
                        </button>
                      ) : null}
                      {actions.changeRequestHref ? (
                        <a
                          className="rounded-md border border-[#C9A227]/40 bg-[#C9A227]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#0C0C0E]"
                          href={actions.changeRequestHref}
                        >
                          Add details / Change request
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>

        <p className="text-[10px] leading-snug text-[#8A8680]">
          All-in includes repositioning, crew, fuel, FET &amp; segment fees where
          applicable. On accept: confirmation, ETA sheet, live tracking.{' '}
          {validityNote?.trim() ||
            'ETAs assume ready-now. Quote valid 4 hours unless withdrawn.'}
        </p>
      </div>

      <footer className="bg-[#0C0C0E] px-5 py-3 text-[#F7F2E3]">
        <div className="flex flex-wrap items-start justify-between gap-3 text-[11px] leading-relaxed">
          <div>
            Questions?
            <span className="ml-1.5 font-semibold text-[#C9A227]">
              24-hr ops · {BRAND_PHONE}
            </span>
          </div>
          <div className="text-[#F7F2E3]/55 sm:text-right">
            {dispatcherLine?.trim() || `OnFly Air dispatch · ${BRAND_EMAIL}`}
          </div>
        </div>
      </footer>

      {trackingHintUrl?.trim() ? (
        <p className="bg-[#ECE8DF] px-5 py-2 text-center text-[11px] text-[#6B6560]">
          Once booked:{' '}
          <a
            className="font-semibold text-[#0C0C0E] underline"
            href={trackingHintUrl}
          >
            {trackingHintUrl}
          </a>
        </p>
      ) : null}

      <p className="border-t border-[#E5DFD0] bg-[#F9F7F2] px-5 py-1.5 text-[9px] leading-snug text-[#8A8680]">
        {disclosureText?.trim() ||
          'Operated by a vetted Part 135 carrier. OnFly Air acts as broker and is not the air carrier.'}
      </p>
    </div>
  )
}
