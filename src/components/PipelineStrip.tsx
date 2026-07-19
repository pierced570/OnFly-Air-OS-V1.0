import {
  PIPELINE_STAGES,
  stageForTripState,
  stageIndex,
  tripStateLabel,
  type PipelineBucket,
} from '@/domain/pipelineStages'
import type { TripState } from '@/domain/stateMachine'

/** Compact stage meter for a trip detail header. */
export function PipelineStrip({ state }: { state: TripState }) {
  const bucket: PipelineBucket = stageForTripState(state)
  const idx = stageIndex(bucket)

  if (bucket === 'out') {
    return (
      <div className="rounded-md border border-late/40 bg-late/10 px-3 py-2 text-xs text-late">
        {tripStateLabel(state)} — off the active pipeline
      </div>
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted">
          Pipeline
        </span>
        <span className="text-xs text-gold">{tripStateLabel(state)}</span>
      </div>
      <ol className="flex gap-1">
        {PIPELINE_STAGES.map((s, i) => {
          const reached = idx >= i
          const current = idx === i
          return (
            <li
              key={s.id}
              title={s.blurb}
              className={[
                'min-w-0 flex-1 rounded-sm px-1 py-1.5 text-center text-[9px] uppercase tracking-wide',
                current
                  ? 'bg-gold text-ink'
                  : reached
                    ? 'bg-onplan/30 text-onplan'
                    : 'bg-surface-2 text-muted',
              ].join(' ')}
            >
              <span className="block truncate">{s.label.split('·')[0]?.trim()}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
