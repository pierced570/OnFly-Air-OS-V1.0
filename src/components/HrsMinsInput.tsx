import { offerInput, offerLabel } from '@/components/OfferBoardChrome'
import {
  hrsMinsFromTotal,
  totalMinutesFromHrsMins,
} from '@/domain/offerQuoteTiming'

type Props = {
  label: string
  totalMinutes: number
  onChange: (totalMinutes: number) => void
  required?: boolean
  /** Override outer label class (e.g. Quick Dispatch uppercase muted). */
  labelClassName?: string
  /** Override hour/min input class. */
  inputClassName?: string
  /** Where to put hrs/min captions. Default above each box. */
  unitPlacement?: 'above' | 'below' | 'none'
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
}: Props) {
  const { hours, minutes } = hrsMinsFromTotal(totalMinutes)
  const fieldClass = inputClassName ?? offerInput

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
            type="number"
            inputMode="numeric"
            min={0}
            className={[fieldClass, showAbove ? '' : ''].join(' ')}
            value={hours === 0 && minutes === 0 ? '' : hours}
            placeholder="0"
            required={required}
            onChange={(e) => {
              const raw = e.target.value
              emit(raw === '' ? 0 : Number(raw) || 0, minutes)
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
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            className={fieldClass}
            value={hours === 0 && minutes === 0 ? '' : minutes}
            placeholder="0"
            required={required}
            onChange={(e) => {
              const raw = e.target.value
              emit(hours, raw === '' ? 0 : Number(raw) || 0)
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
