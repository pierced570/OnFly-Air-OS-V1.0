import type { FlightPhase } from '@/domain/fleetStatus'

const LABELS: Record<FlightPhase, string> = {
  airborne: 'airborne',
  on_ground: 'on ground',
  no_data: 'no ADS-B',
}

const STYLES: Record<FlightPhase, string> = {
  airborne: 'border-gold/40 bg-gold/10 text-gold',
  on_ground: 'border-onplan/40 bg-onplan/15 text-onplan',
  no_data: 'border-late/40 bg-late/10 text-late',
}

export function FlightChip({
  phase,
  inPosition,
  laddBlocked,
}: {
  phase?: FlightPhase
  inPosition?: boolean
  laddBlocked?: boolean
}) {
  const p = laddBlocked ? 'no_data' : phase
  if (!p && !inPosition) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {p && (
        <span
          className={[
            'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide',
            STYLES[p],
          ].join(' ')}
        >
          {LABELS[p]}
        </span>
      )}
      {inPosition && p !== 'no_data' && (
        <span
          title="Last known within ~40 NM of base"
          className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold"
        >
          near base
        </span>
      )}
    </span>
  )
}
