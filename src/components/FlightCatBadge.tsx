import {
  FLIGHT_CATEGORY_LABELS,
  FLIGHT_CATEGORY_TOKEN,
  type FlightCategory,
} from '@/domain/flightCategory'

const chipCls: Record<FlightCategory, string> = {
  VFR: 'border-vfr/50 bg-vfr/15 text-vfr',
  MVFR: 'border-mvfr/50 bg-mvfr/15 text-mvfr',
  IFR: 'border-ifr/50 bg-ifr/15 text-ifr',
  LIFR: 'border-lifr/50 bg-lifr/15 text-lifr',
}

export function FlightCatBadge({
  cat,
  size = 'md',
  title,
}: {
  cat: FlightCategory | null | undefined
  size?: 'sm' | 'md'
  title?: string
}) {
  if (!cat) {
    return (
      <span
        className={[
          'inline-flex items-center rounded border border-border px-1.5 font-medium uppercase tracking-wide text-muted',
          size === 'sm' ? 'text-[10px] py-0.5' : 'text-xs py-0.5',
        ].join(' ')}
        title={title}
      >
        —
      </span>
    )
  }
  return (
    <span
      className={[
        'inline-flex items-center rounded border px-1.5 font-semibold uppercase tracking-wide',
        chipCls[cat],
        size === 'sm' ? 'text-[10px] py-0.5' : 'text-xs py-0.5',
      ].join(' ')}
      title={title ?? FLIGHT_CATEGORY_LABELS[cat]}
      data-flight-cat={FLIGHT_CATEGORY_TOKEN[cat]}
    >
      {cat}
    </span>
  )
}
