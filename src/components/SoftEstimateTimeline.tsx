/**
 * Expandable soft-estimate timeline — planning stages + flight by aircraft class.
 * Matches frost / portal-glass client surfaces.
 */

import { useId, useState } from 'react'
import {
  formatHoursMinutes,
  softFixedTimelineStages,
  type SoftClassQuote,
} from '@/domain/softPricing'

export function SoftEstimateTimeline(props: {
  classes: SoftClassQuote[]
  /** Narrow frost panel on the fast-quote result page. */
  compact?: boolean
}) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const stages = softFixedTimelineStages()
  const flightClasses = props.classes.filter(
    (c) => c.pricing_mode === 'hourly_range' || c.timing.live_min > 0,
  )

  return (
    <div className="portal-glass-strong overflow-hidden rounded-2xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-12 items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/25"
      >
        <div>
          <div className="text-sm font-semibold text-ink">Estimate timeline</div>
          <p className="mt-0.5 text-xs text-muted">
            Call-out, position, load &amp; fuel, then flight by aircraft type
          </p>
        </div>
        <span
          className={[
            'avionic shrink-0 text-sm font-semibold text-gold transition',
            open ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="border-t border-ink/10 px-4 pb-4 pt-3"
        >
          <ol className="space-y-3">
            {stages.map((stage) => {
              if (stage.key !== 'flight') {
                return (
                  <li
                    key={stage.key}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">
                        {stage.label}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{stage.hint}</p>
                    </div>
                    <span className="avionic shrink-0 text-sm font-semibold text-gold">
                      {formatHoursMinutes(stage.minutes ?? 0)}
                    </span>
                  </li>
                )
              }

              return (
                <li key={stage.key} className="space-y-2">
                  <div>
                    <div className="text-sm font-semibold text-ink">
                      {stage.label}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{stage.hint}</p>
                  </div>
                  <ul className="divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/10 bg-white/35">
                    {flightClasses.map((c) => (
                      <li
                        key={c.class_id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">
                            {c.label}
                          </div>
                          <p className="truncate text-[11px] text-muted">
                            {c.example_types.slice(0, 2).join(', ') ||
                              `${c.timing.avg_gs_kts} kt avg`}
                            {' · '}
                            <span className="avionic">
                              {c.timing.avg_gs_kts} kt
                            </span>
                          </p>
                        </div>
                        <span className="avionic shrink-0 text-sm font-semibold text-ink">
                          {formatHoursMinutes(c.timing.live_min)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Planning assumptions only — real call-out and positioning move with
            crew duty and where the aircraft sits today. Not a bookable schedule.
          </p>
        </div>
      ) : null}
    </div>
  )
}
