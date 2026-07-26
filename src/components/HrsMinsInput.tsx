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
}

/** Two boxes — Hours + Mins — for mobile quote entry. */
export function HrsMinsInput({
  label,
  totalMinutes,
  onChange,
  required,
}: Props) {
  const { hours, minutes } = hrsMinsFromTotal(totalMinutes)

  function emit(nextH: number, nextM: number) {
    onChange(totalMinutesFromHrsMins({ hours: nextH, minutes: nextM }))
  }

  return (
    <div>
      <div className={offerLabel}>{label}</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <label className="text-sm text-muted">
          Hours
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={offerInput}
            value={hours}
            required={required}
            onChange={(e) => emit(Number(e.target.value) || 0, minutes)}
            aria-label={`${label} hours`}
          />
        </label>
        <label className="text-sm text-muted">
          Mins
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            className={offerInput}
            value={minutes}
            required={required}
            onChange={(e) => emit(hours, Number(e.target.value) || 0)}
            aria-label={`${label} minutes`}
          />
        </label>
      </div>
    </div>
  )
}
