import { useEffect, useState } from 'react'
import {
  composeDimsLines,
  emptyDimsTripleRow,
  parseDimsLines,
  type DimLengthUnit,
  type DimsTripleRow,
} from '@/domain/dimsParser'

const box =
  'min-h-11 w-full rounded-md border border-border bg-surface-2 px-2 py-2.5 text-center avionic text-sm text-[var(--text)] outline-none focus:border-gold sm:min-h-0 sm:py-2'

const xSep =
  'shrink-0 px-1 text-lg font-semibold text-gold select-none sm:px-1.5'

type Props = {
  /** Composed free-text line(s) — `;` separates pieces (kept for parsers / cargo_notes). */
  value: string
  onChange: (composed: string) => void
  unit: DimLengthUnit
  className?: string
  /** Show qty + weight helpers around the L×W×H triple. */
  showQtyWeight?: boolean
  /** Override dim/weight placeholders (desk standard cargo uses 12 / 75). */
  placeholders?: {
    l?: string
    w?: string
    h?: string
    weight?: string
  }
}

function rowsEqual(a: DimsTripleRow[], b: DimsTripleRow[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (r, i) =>
      r.count === b[i]?.count &&
      r.l === b[i]?.l &&
      r.w === b[i]?.w &&
      r.h === b[i]?.h &&
      r.weight === b[i]?.weight,
  )
}

/**
 * Cargo L × W × H entry — one or more cargo rows with gold X separators.
 * Still emits a parseable dims string (`piece; piece; …`).
 */
export function DimsTripleInput({
  value,
  onChange,
  unit,
  className = '',
  showQtyWeight = true,
  placeholders,
}: Props) {
  const [rows, setRows] = useState<DimsTripleRow[]>(() => parseDimsLines(value))
  const phL = placeholders?.l ?? (unit === 'ft' ? '4' : '48')
  const phW = placeholders?.w ?? (unit === 'ft' ? '3.5' : '40')
  const phH = placeholders?.h ?? (unit === 'ft' ? '5' : '60')
  const phWt = placeholders?.weight ?? '800'

  // Re-hydrate from parent (clear / load request). Keep trailing empty rows
  // the user just added via "+ Add cargo".
  useEffect(() => {
    if (!value.trim()) {
      setRows((prev) => {
        const blank = emptyDimsTripleRow()
        if (prev.length === 1 && rowsEqual(prev, [blank])) return prev
        return [blank]
      })
      return
    }
    const next = parseDimsLines(value)
    const allComplete = next.every((r) => r.l && r.w && r.h)
    if (!allComplete) return
    setRows((prev) => {
      const trailingEmpty = prev.filter(
        (r, i) =>
          i >= next.length && !r.l && !r.w && !r.h && !String(r.weight).trim(),
      )
      const merged = [...next, ...trailingEmpty]
      return rowsEqual(prev, merged) ? prev : merged
    })
  }, [value])

  function emit(nextRows: DimsTripleRow[]) {
    setRows(nextRows)
    onChange(composeDimsLines(nextRows, unit))
  }

  function patchRow(index: number, patch: Partial<DimsTripleRow>) {
    emit(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addCargo(prefill?: Partial<DimsTripleRow>) {
    // Local row first — empty lines are omitted from cargo_notes until typed.
    setRows((prev) => [...prev, { ...emptyDimsTripleRow(), ...prefill }])
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      emit([emptyDimsTripleRow()])
      return
    }
    emit(rows.filter((_, i) => i !== index))
  }

  const unitLabel = unit === 'ft' ? 'ft' : 'in'

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted">
          Cargo dims (L × W × H)
        </div>
        <button
          type="button"
          onClick={() => addCargo()}
          className="rounded-md bg-gold/15 px-2.5 py-1 text-[11px] font-semibold text-gold hover:bg-gold/25"
        >
          + Add cargo
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="space-y-1.5 rounded-lg border border-border/60 bg-surface-2/30 p-2.5 sm:p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                Cargo {index + 1}
                {rows.length > 1 ? ` of ${rows.length}` : ''}
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="text-[11px] text-muted hover:text-late"
                  aria-label={`Remove cargo ${index + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {showQtyWeight && (
                <label className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-muted">
                  Qty
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={row.count}
                    onChange={(e) =>
                      patchRow(index, { count: e.target.value })
                    }
                    className={box}
                    aria-label={`Cargo ${index + 1} piece count`}
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
                    value={row.l}
                    onChange={(e) => patchRow(index, { l: e.target.value })}
                    placeholder={phL}
                    className={box}
                    aria-label={`Cargo ${index + 1} length in ${unitLabel}`}
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
                    value={row.w}
                    onChange={(e) => patchRow(index, { w: e.target.value })}
                    placeholder={phW}
                    className={box}
                    aria-label={`Cargo ${index + 1} width in ${unitLabel}`}
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
                    value={row.h}
                    onChange={(e) => patchRow(index, { h: e.target.value })}
                    placeholder={phH}
                    className={box}
                    aria-label={`Cargo ${index + 1} height in ${unitLabel}`}
                  />
                </label>
              </div>
              {showQtyWeight && (
                <label className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-muted">
                  Lb ea <span className="text-late">*</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={row.weight}
                    onChange={(e) =>
                      patchRow(index, { weight: e.target.value })
                    }
                    placeholder={phWt}
                    className={box}
                    aria-label={`Cargo ${index + 1} weight pounds each`}
                  />
                </label>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted">
        Enter L × W × H in{' '}
        <span className="text-[var(--text)]">
          {unit === 'ft' ? 'feet' : 'inches'}
        </span>
        . Door fit always uses inches
        {unit === 'ft' ? ' (we convert for you)' : ''}. Use{' '}
        <span className="text-[var(--text)]">Add cargo</span> for different
        sizes — or raise Qty when pieces match.
      </p>
    </div>
  )
}
