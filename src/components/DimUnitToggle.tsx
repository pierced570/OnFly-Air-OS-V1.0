import type { DimLengthUnit } from '@/domain/dimsParser'

const seg = (on: boolean) =>
  [
    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
    on ? 'bg-gold text-ink' : 'bg-surface-2 text-muted hover:text-cream',
  ].join(' ')

/** Inches vs feet for cargo L×W×H entry. */
export function DimUnitToggle({
  value,
  onChange,
  className = '',
}: {
  value: DimLengthUnit
  onChange: (u: DimLengthUnit) => void
  className?: string
}) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-muted">
        Dims unit
      </div>
      <div className="mt-1 flex rounded-lg border border-border bg-surface-2 p-0.5">
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
