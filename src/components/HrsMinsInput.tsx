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
}

/** Two boxes — Hours + Mins — for quote / Quick Dispatch entry. */
export function HrsMinsInput({
  label,
  totalMinutes,
  onChange,
  required,
  labelClassName,
  inputClassName,
}: Props) {
  const { hours, minutes } = hrsMinsFromTotal(totalMinutes)
  const fieldClass = inputClassName ?? offerInput

  function emit(nextH: number, nextM: number) {
    onChange(totalMinutesFromHrsMins({ hours: nextH, minutes: nextM }))
  }

  return (
    <div>
      <div className={labelClassName ?? offerLabel}>{label}</div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Hours
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={fieldClass}
            value={hours === 0 && minutes === 0 ? '' : hours}
            placeholder="0"
            required={required}
            onChange={(e) => {
              const raw = e.target.value
              emit(raw === '' ? 0 : Number(raw) || 0, minutes)
            }}
            aria-label={`${label} hours`}
          />
        </label>
        <label className="text-xs text-muted">
          Mins
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
            aria-label={`${label} minutes`}
          />
        </label>
      </div>
    </div>
  )
}
