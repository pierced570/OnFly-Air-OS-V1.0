import { DimUnitToggle } from '@/components/DimUnitToggle'
import { DimsTripleInput } from '@/components/DimsTripleInput'
import { NumericDraftInput } from '@/components/NumericDraftInput'
import {
  parseDims,
  type DimLengthUnit,
} from '@/domain/dimsParser'
import {
  composeStandardCargoDims,
  STANDARD_CARGO_DEFAULTS,
  STANDARD_TOOLING,
} from '@/domain/standardTooling'
import {
  legHasCargo,
  legHasPax,
  legLaneLabel,
  type CargoDimsStatus,
  type PaxRow,
  type TripLegDraft,
} from '@/domain/tripRequest'

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-gold'
const labelCls = 'block text-xs font-medium text-muted'
const segBtn = (on: boolean) =>
  [
    'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    on ? 'bg-gold text-ink' : 'bg-surface-2 text-muted hover:text-[var(--text)]',
  ].join(' ')

type Props = {
  leg: TripLegDraft
  index: number
  dimUnit: DimLengthUnit
  wizard: boolean
  variant: 'portal' | 'dispatch'
  onPayloadFlags: (hasPax: boolean, hasCargo: boolean) => void
  onPatch: (patch: Partial<TripLegDraft>) => void
  onDimUnit: (unit: DimLengthUnit) => void
}

export function TripRequestLegPayloadSection({
  leg,
  index,
  dimUnit,
  wizard,
  variant,
  onPayloadFlags,
  onPatch,
  onDimUnit,
}: Props) {
  const lane = legLaneLabel(leg)
  const pax = leg.pax

  function setPaxCount(n: number) {
    const count = Math.max(1, Math.min(20, n))
    const next: PaxRow[] = []
    for (let i = 0; i < count; i++) {
      next.push(pax[i] ?? { name: '', weight_lbs: '', dob: '' })
    }
    onPatch({ pax: next })
  }

  function applyCargoDimsStatus(status: CargoDimsStatus) {
    if (status === 'standard') {
      onPatch({
        cargo_dims_status: status,
        cargo_notes: composeStandardCargoDims(STANDARD_CARGO_DEFAULTS),
        cargo_weight_lbs: Number(STANDARD_CARGO_DEFAULTS.weight),
      })
      onDimUnit('in')
      return
    }
    if (status === 'not_yet') {
      onPatch({
        cargo_dims_status: status,
        cargo_notes: '',
        cargo_weight_lbs: '',
      })
      return
    }
    onPatch({ cargo_dims_status: status })
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2
          className={
            wizard
              ? 'text-base font-semibold text-ink'
              : 'text-xs font-medium uppercase tracking-wider text-muted'
          }
        >
          Leg {index + 1}{' '}
          <span className="avionic font-semibold text-ink">{lane}</span>
        </h2>
        <div className="flex flex-wrap gap-4 text-sm text-[var(--text)]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={legHasPax(leg)}
              onChange={(e) =>
                onPayloadFlags(e.target.checked, legHasCargo(leg))
              }
            />
            Passengers
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={legHasCargo(leg)}
              onChange={(e) =>
                onPayloadFlags(legHasPax(leg), e.target.checked)
              }
            />
            Cargo
          </label>
        </div>
      </div>

      {legHasPax(leg) ? (
        <div className="space-y-3 rounded-lg border border-border bg-white p-3">
          <label className={`${labelCls} max-w-[8rem]`}>
            Pax count
            <NumericDraftInput
              integer
              min={1}
              max={20}
              className={inputCls}
              value={pax.length > 0 ? pax.length : null}
              onValueChange={(n) => {
                if (n == null) return
                setPaxCount(n)
              }}
            />
          </label>
          {pax.map((p, i) => (
            <div
              key={i}
              className="grid gap-2 border-t border-border pt-3 sm:grid-cols-3"
            >
              <label className={labelCls}>
                Name
                <input
                  value={p.name}
                  onChange={(e) => {
                    const next = [...pax]
                    next[i] = { ...next[i]!, name: e.target.value }
                    onPatch({ pax: next })
                  }}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Est. weight (lb)
                <NumericDraftInput
                  integer
                  min={1}
                  className={inputCls}
                  value={p.weight_lbs === '' ? null : Number(p.weight_lbs)}
                  onValueChange={(n) => {
                    const next = [...pax]
                    next[i] = {
                      ...next[i]!,
                      weight_lbs: n == null ? '' : n,
                    }
                    onPatch({ pax: next })
                  }}
                />
              </label>
              <label className={labelCls}>
                DOB
                <input
                  type="date"
                  value={p.dob}
                  onChange={(e) => {
                    const next = [...pax]
                    next[i] = { ...next[i]!, dob: e.target.value }
                    onPatch({ pax: next })
                  }}
                  className={inputCls}
                />
              </label>
            </div>
          ))}
        </div>
      ) : null}

      {legHasCargo(leg) ? (
        <div className="space-y-3 rounded-lg border border-border bg-white p-3">
          {variant === 'portal' ? (
            <div>
              <div className="text-xs font-medium text-muted">
                Cargo dims &amp; weight
              </div>
              <div
                className={[
                  'mt-2 grid gap-1 p-1 sm:grid-cols-3',
                  wizard
                    ? 'rounded-xl bg-[#F3EEE4]'
                    : 'gap-2 rounded-lg border border-border bg-surface-2',
                ].join(' ')}
              >
                {(
                  [
                    ['known', 'I have dims'],
                    ['not_yet', 'Not yet'],
                    ['standard', 'Autofill standard cargo'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyCargoDimsStatus(id)}
                    className={
                      wizard
                        ? [
                            'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            leg.cargo_dims_status === id
                              ? 'bg-white font-semibold text-ink shadow-sm'
                              : 'text-muted hover:text-ink',
                          ].join(' ')
                        : segBtn(leg.cargo_dims_status === id)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {leg.cargo_dims_status === 'standard' ? (
                <p className="mt-2 text-xs text-muted">
                  Using {STANDARD_TOOLING.ui_label}:{' '}
                  <span className="avionic text-[var(--text)]">
                    {STANDARD_TOOLING.summary}
                  </span>
                </p>
              ) : null}
              {leg.cargo_dims_status === 'not_yet' ? (
                <p className="mt-2 text-xs text-muted">
                  We’ll size this leg after you send dims — or choose standard
                  cargo above.
                </p>
              ) : null}
            </div>
          ) : null}

          {(variant === 'dispatch' ||
            leg.cargo_dims_status === 'known' ||
            leg.cargo_dims_status === 'standard') && (
            <div className="space-y-3">
              <DimUnitToggle
                value={dimUnit}
                onChange={onDimUnit}
                hideLabel={wizard}
                light={wizard}
              />
              <DimsTripleInput
                value={leg.cargo_notes}
                unit={dimUnit}
                onChange={(cargo_notes) => {
                  const parsed = parseDims(cargo_notes || '', {
                    unit: dimUnit,
                  })
                  const weighted = parsed.pieces.filter((p) => p.weight_lbs > 0)
                  const cargo_weight_lbs =
                    weighted.length === parsed.pieces.length &&
                    weighted.length > 0
                      ? weighted[0]!.weight_lbs
                      : leg.cargo_weight_lbs
                  onPatch({
                    cargo_notes,
                    cargo_weight_lbs,
                    cargo_dims_status:
                      leg.cargo_dims_status === 'not_yet'
                        ? 'known'
                        : leg.cargo_dims_status,
                  })
                }}
              />
              <label className={`${labelCls} max-w-[10rem]`}>
                Weight each (lb)
                <NumericDraftInput
                  min={0}
                  className={`${inputCls} avionic`}
                  value={
                    leg.cargo_weight_lbs === ''
                      ? null
                      : Number(leg.cargo_weight_lbs)
                  }
                  onValueChange={(n) =>
                    onPatch({
                      cargo_weight_lbs: n == null ? '' : n,
                    })
                  }
                  placeholder="Required"
                />
              </label>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
