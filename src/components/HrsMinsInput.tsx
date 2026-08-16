import { useEffect, useState } from 'react'
import { offerInput, offerLabel } from '@/components/OfferBoardChrome'
import {
  hrsMinsFieldDisplay,
  hrsMinsFromTotal,
  totalMinutesFromHrsMins,
} from '@/domain/offerQuoteTiming'
import {
  isDecimalDraft,
  parseDecimalDraft,
  sanitizeDecimalDraft,
} from '@/domain/numericDraft'

type Props = {
  label: string
  /** `null` = empty fields showing grey reference placeholders. */
  totalMinutes: number | null
  onChange: (totalMinutes: number) => void
  /**
   * Marks the duration group for a11y. Never applied as HTML `required` on
   * Hours or Mins — either box may stay blank (e.g. turn time = 40 min only).
   * Parents must validate that a total was entered when needed.
   */
  required?: boolean
  /** Override outer label class (e.g. Quick Dispatch uppercase muted). */
  labelClassName?: string
  /** Override hour/min input class. */
  inputClassName?: string
  /** Where to put hrs/min captions. Default above each box. */
  unitPlacement?: 'above' | 'below' | 'none'
  /**
   * When `totalMinutes` is null, show these as grey placeholders
   * (operator form reference values until they fill in).
   */
  placeholderTotalMinutes?: number
}

/** Two boxes — Hours + Mins — for quote / Quick Dispatch entry. */
export function HrsMinsInput({
  label,
  totalMinutes,
  onChange,
  required,
  labelClassName,
  inputClassName,
  unitPlacement = 'above',
  placeholderTotalMinutes,
}: Props) {
  const empty = totalMinutes == null
  const { hours, minutes } = empty
    ? { hours: 0, minutes: 0 }
    : hrsMinsFromTotal(totalMinutes)
  const ph = hrsMinsFromTotal(placeholderTotalMinutes ?? 0)
  const fieldClass = inputClassName ?? offerInput

  const hoursExternal = hrsMinsFieldDisplay(totalMinutes, 'hours')
  const minsExternal = hrsMinsFieldDisplay(totalMinutes, 'minutes')

  const [hoursFocused, setHoursFocused] = useState(false)
  const [minsFocused, setMinsFocused] = useState(false)
  const [hoursDraft, setHoursDraft] = useState(hoursExternal)
  const [minsDraft, setMinsDraft] = useState(minsExternal)

  useEffect(() => {
    if (!hoursFocused) setHoursDraft(hoursExternal)
  }, [hoursExternal, hoursFocused])
  useEffect(() => {
    if (!minsFocused) setMinsDraft(minsExternal)
  }, [minsExternal, minsFocused])

  function emit(nextH: number, nextM: number) {
    onChange(totalMinutesFromHrsMins({ hours: nextH, minutes: nextM }))
  }

  const showAbove = unitPlacement === 'above'
  const showBelow = unitPlacement === 'below'

  return (
    <div>
      {label || labelClassName !== 'sr-only' ? (
        <div className={labelClassName ?? offerLabel}>{label}</div>
      ) : (
        <div className="sr-only">{label || 'Duration'}</div>
      )}
      <div className={['grid grid-cols-2 gap-2', label ? 'mt-1' : ''].join(' ')}>
        <label className="block">
          {showAbove ? (
            <span className="text-xs text-muted">Hours</span>
          ) : null}
          <input
            type="text"
            inputMode="numeric"
            className={fieldClass}
            value={hoursFocused ? hoursDraft : hoursExternal}
            placeholder={
              placeholderTotalMinutes != null ? String(ph.hours) : '0'
            }
            aria-required={required || undefined}
            onFocus={() => {
              setHoursFocused(true)
              setHoursDraft(hoursExternal)
            }}
            onBlur={() => {
              const n = parseDecimalDraft(hoursDraft, { integer: true })
              emit(n == null ? 0 : Math.max(0, n), minutes)
              setHoursFocused(false)
            }}
            onChange={(e) => {
              const raw = sanitizeDecimalDraft(e.target.value)
              if (!isDecimalDraft(raw, true)) return
              setHoursDraft(raw)
              const n = parseDecimalDraft(raw, { integer: true })
              if (n == null) return
              emit(Math.max(0, n), minutes)
            }}
            aria-label={`${label || 'Duration'} hours`}
          />
          {showBelow ? (
            <span className="mt-1 block text-center text-[10px] uppercase tracking-wide text-[#9A9285]">
              hrs
            </span>
          ) : null}
        </label>
        <label className="block">
          {showAbove ? (
            <span className="text-xs text-muted">Mins</span>
          ) : null}
          <input
            type="text"
            inputMode="numeric"
            className={fieldClass}
            value={minsFocused ? minsDraft : minsExternal}
            placeholder={
              placeholderTotalMinutes != null ? String(ph.minutes) : '0'
            }
            aria-required={required || undefined}
            onFocus={() => {
              setMinsFocused(true)
              setMinsDraft(minsExternal)
            }}
            onBlur={() => {
              const n = parseDecimalDraft(minsDraft, { integer: true })
              emit(hours, n == null ? 0 : Math.min(59, Math.max(0, n)))
              setMinsFocused(false)
            }}
            onChange={(e) => {
              const raw = sanitizeDecimalDraft(e.target.value)
              if (!isDecimalDraft(raw, true)) return
              setMinsDraft(raw)
              const n = parseDecimalDraft(raw, { integer: true })
              if (n == null) return
              emit(hours, Math.min(59, Math.max(0, n)))
            }}
            aria-label={`${label || 'Duration'} minutes`}
          />
          {showBelow ? (
            <span className="mt-1 block text-center text-[10px] uppercase tracking-wide text-[#9A9285]">
              min
            </span>
          ) : null}
        </label>
      </div>
    </div>
  )
}
