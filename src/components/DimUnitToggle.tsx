import type { DimLengthUnit } from '@/domain/dimsParser'

/** Inches vs feet for cargo L×W×H entry. */
export function DimUnitToggle({
  value,
  onChange,
  className = '',
  hideLabel = false,
  light = false,
}: {
  value: DimLengthUnit
  onChange: (u: DimLengthUnit) => void
  className?: string
  hideLabel?: boolean
  /** Cream/white portal chrome (vs dispatch gold). */
  light?: boolean
}) {
  const seg = (on: boolean) =>
    [
      'flex-1 min-h-10 rounded-md px-3 py-2.5 text-xs font-medium transition-colors sm:min-h-0 sm:py-1.5',
      light
        ? on
          ? 'bg-white font-semibold text-ink shadow-sm'
          : 'text-muted hover:text-ink'
        : on
          ? 'bg-gold text-ink'
          : 'bg-surface-2 text-muted hover:text-cream',
    ].join(' ')

  return (
    <div className={className}>
      {hideLabel ? null : (
        <div className="text-[10px] uppercase tracking-wider text-muted">
          Dims unit
        </div>
      )}
      <div
        className={[
          'flex rounded-lg border p-0.5',
          hideLabel ? '' : 'mt-1',
          light
            ? 'max-w-[14rem] border-[#e5dfd0] bg-[#F3EEE4]'
            : 'border-border bg-surface-2',
        ].join(' ')}
      >
        <button
          type="button"
          className={seg(value === 'in')}
          onClick={() => onChange('in')}
          aria-pressed={value === 'in'}
        >
          Inches
        </button>
        <button
          type="button"
          className={seg(value === 'ft')}
          onClick={() => onChange('ft')}
          aria-pressed={value === 'ft'}
        >
          Feet
        </button>
      </div>
    </div>
  )
}
