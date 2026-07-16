import {
  REST_CHIP_TOOLTIP,
  type RestChip as RestChipKind,
} from '@/domain/fleetStatus'

const LABELS: Record<RestChipKind, string> = {
  likely_rested: 'likely rested',
  rest_clock_running: 'rest clock',
  unknown: 'rest unknown',
}

const STYLES: Record<RestChipKind, string> = {
  likely_rested: 'border-onplan/40 bg-onplan/15 text-onplan',
  rest_clock_running: 'border-gold/40 bg-gold/10 text-gold',
  unknown: 'border-border bg-surface-2 text-muted',
}

export function RestChip({
  rest,
  inPosition,
  laddBlocked,
}: {
  rest?: RestChipKind
  inPosition?: boolean
  laddBlocked?: boolean
}) {
  if (!rest && !inPosition && !laddBlocked) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {laddBlocked && (
        <span
          title="No ADS-B returns (LADD / coverage gap)"
          className="rounded-full border border-late/40 bg-late/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-late"
        >
          LADD
        </span>
      )}
      {rest && (
        <span
          title={REST_CHIP_TOOLTIP}
          className={[
            'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide',
            STYLES[rest],
          ].join(' ')}
        >
          {LABELS[rest]}
        </span>
      )}
      {inPosition && (
        <span
          title="Last known within ~40 NM of base"
          className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold"
        >
          in position
        </span>
      )}
    </span>
  )
}
