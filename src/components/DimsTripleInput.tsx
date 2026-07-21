import { useEffect, useState } from 'react'
import {
  composeDimsLine,
  parseDimsTriple,
  type DimLengthUnit,
} from '@/domain/dimsParser'

const box =
  'min-h-11 w-full rounded-md border border-border bg-surface-2 px-2 py-2.5 text-center avionic text-sm text-[var(--text)] outline-none focus:border-gold sm:min-h-0 sm:py-2'

const xSep =
  'shrink-0 px-1 text-lg font-semibold text-gold select-none sm:px-1.5'

type Props = {
  /** Composed free-text line (kept for parsers / cargo_notes). */
  value: string
  onChange: (composed: string) => void
  unit: DimLengthUnit
  className?: string
  /** Show qty + weight helpers around the L×W×H triple. */
  showQtyWeight?: boolean
}

/**
 * Cargo L × W × H entry — three boxes with gold X separators so the
 * L×W×H order is obvious. Still emits a parseable dims string.
 */
export function DimsTripleInput({
  value,
  onChange,
  unit,
  className = '',
  showQtyWeight = true,
}: Props) {
  const parsed = parseDimsTriple(value)
  const [count, setCount] = useState(String(parsed.count || 1))
  const [l, setL] = useState(parsed.l)
  const [w, setW] = useState(parsed.w)
  const [h, setH] = useState(parsed.h)
  const [weight, setWeight] = useState(parsed.weight)

  // Re-hydrate when parent clears or loads a full L×W×H line (e.g. request).
  // Skip partial emits ("48", "48x40") so typing one box doesn't wipe the others.
  useEffect(() => {
    if (!value.trim()) {
      setCount('1')
      setL('')
      setW('')
      setH('')
      setWeight('')
      return
    }
    const next = parseDimsTriple(value)
    if (!next.l || !next.w || !next.h) return
    setCount(String(next.count || 1))
    setL(next.l)
    setW(next.w)
    setH(next.h)
    setWeight(next.weight)
  }, [value])

  function emit(
    next: Partial<{ count: string; l: string; w: string; h: string; weight: string }>,
  ) {
    const c = next.count ?? count
    const ll = next.l ?? l
    const ww = next.w ?? w
    const hh = next.h ?? h
    const wt = next.weight ?? weight
    onChange(
      composeDimsLine({
        count: Number(c) || 1,
        l: ll,
        w: ww,
        h: hh,
        weightLbs: wt.trim() ? Number(wt) : null,
        unit,
      }),
    )
  }

  const unitLabel = unit === 'ft' ? 'ft' : 'in'

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-xs font-medium text-muted">
        Cargo dims (L × W × H)
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {showQtyWeight && (
          <label className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-muted">
            Qty
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={count}
              onChange={(e) => {
                setCount(e.target.value)
                emit({ count: e.target.value })
              }}
              className={box}
              aria-label="Piece count"
            />
          </label>
        )}
        <div className="flex min-w-0 flex-1 items-end gap-0.5 sm:gap-1">
          <label className="min-w-0 flex-1 text-[10px] uppercase tracking-wider text-muted">
            L ({unitLabel})
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={l}
              onChange={(e) => {
                setL(e.target.value)
                emit({ l: e.target.value })
              }}
              placeholder={unit === 'ft' ? '4' : '48'}
              className={box}
              aria-label={`Length in ${unitLabel}`}
            />
          </label>
          <span className={xSep} aria-hidden>
            ×
          </span>
          <label className="min-w-0 flex-1 text-[10px] uppercase tracking-wider text-muted">
            W ({unitLabel})
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={w}
              onChange={(e) => {
                setW(e.target.value)
                emit({ w: e.target.value })
              }}
              placeholder={unit === 'ft' ? '3.5' : '40'}
              className={box}
              aria-label={`Width in ${unitLabel}`}
            />
          </label>
          <span className={xSep} aria-hidden>
            ×
          </span>
          <label className="min-w-0 flex-1 text-[10px] uppercase tracking-wider text-muted">
            H ({unitLabel})
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={h}
              onChange={(e) => {
                setH(e.target.value)
                emit({ h: e.target.value })
              }}
              placeholder={unit === 'ft' ? '5' : '60'}
              className={box}
              aria-label={`Height in ${unitLabel}`}
            />
          </label>
        </div>
        {showQtyWeight && (
          <label className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-muted">
            Lb ea
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value)
                emit({ weight: e.target.value })
              }}
              placeholder="800"
              className={box}
              aria-label="Weight pounds each"
            />
          </label>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Enter L × W × H in{' '}
        <span className="text-[var(--text)]">
          {unit === 'ft' ? 'feet' : 'inches'}
        </span>
        . Door fit always uses inches
        {unit === 'ft' ? ' (we convert for you)' : ''}.
      </p>
    </div>
  )
}
